const { verifyRegistrationResponse } = require('@simplewebauthn/server');
const { getSupabase } = require('../_lib/supabase');
const { getWebAuthnConfig } = require('../_lib/webauthn-config');
const { buildSessionCookie } = require('../_lib/session');
const { toBase64 } = require('../_lib/buf');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { rpID, origins } = getWebAuthnConfig();
    const supabase = getSupabase();
    const body = req.body || {};
    const { userId, response, deviceName } = body;

    if (!userId || !response) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    // 아직 쓰지 않았고 만료되지 않은 등록용 질문 중 가장 최근 것을 찾는다 (재사용 방지의 핵심)
    const { data: challengeRow, error: chErr } = await supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'registration')
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (chErr) throw chErr;
    if (!challengeRow) {
      return res
        .status(400)
        .json({ error: 'challenge_expired', message: '등록 질문이 만료되었거나 이미 사용되었습니다. 다시 시도해주세요.' });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
      });
    } catch (err) {
      console.error('verifyRegistrationResponse failed', err);
      return res.status(400).json({ error: 'verification_failed' });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'verification_failed' });
    }

    // 질문은 1회용 -> 성공 즉시 사용 처리
    await supabase.from('webauthn_challenges').update({ used: true }).eq('id', challengeRow.id);

    const { credential } = verification.registrationInfo;

    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('handle')
      .eq('id', userId)
      .single();
    if (userErr) throw userErr;

    const { error: insertErr } = await supabase.from('credentials').insert({
      id: credential.id,
      user_id: userId,
      public_key: toBase64(credential.publicKey), // 공개키만 저장 (개인키는 이 요청 본문에 애초에 없음)
      counter: credential.counter,
      device_name: (deviceName && String(deviceName).trim().slice(0, 60)) || '이름 없는 패스키',
      transports: credential.transports || [],
    });

    if (insertErr) {
      if (insertErr.code === '23505') {
        return res.status(409).json({ error: 'credential_exists', message: '이미 등록된 패스키입니다.' });
      }
      throw insertErr;
    }

    // 첫 패스키 등록(=새 계정)이면, 확인용으로 만들어 넣은 비공개 항목 3개를 함께 만들어준다.
    // 실제 개인정보는 아니며, 카드5에서 계정별로 서로 다른 내용을 비교할 때도 쓰인다.
    const { count } = await supabase
      .from('private_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (!count) {
      await supabase.from('private_items').insert([
        {
          user_id: userId,
          title: '진행 중인 사이드 프로젝트 메모',
          body: `${userRow.handle}만 보는 메모입니다. 아직 공개하기 전 아이디어를 정리해두는 자리예요.`,
        },
        {
          user_id: userId,
          title: '지원하고 싶은 곳 목록 (가상)',
          body: '연습용으로 만들어 넣은 목록입니다. 실제 지원 정보가 아니에요.',
        },
        {
          user_id: userId,
          title: '이번 주 회고',
          body: '패스키 과제를 진행하면서 느낀 점을 스스로 적어보는 공간입니다.',
        },
      ]);
    }

    res.setHeader('Set-Cookie', buildSessionCookie(userId, userRow.handle));
    return res.status(200).json({ ok: true, handle: userRow.handle });
  } catch (err) {
    console.error('register/verify error', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
