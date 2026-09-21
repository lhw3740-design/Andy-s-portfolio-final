const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { getSupabase } = require('../_lib/supabase');
const { getWebAuthnConfig } = require('../_lib/webauthn-config');
const { buildSessionCookie } = require('../_lib/session');
const { toBase64, fromBase64 } = require('../_lib/buf');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { rpID, origins } = getWebAuthnConfig();
    const supabase = getSupabase();
    const body = req.body || {};
    const { response, challenge } = body;

    if (!response || !challenge) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    // 이미 쓴 질문이면(재사용) 여기서 걸러진다: used=false, 만료 전인 행만 조회
    const { data: challengeRow, error: chErr } = await supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('type', 'authentication')
      .eq('challenge', challenge)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (chErr) throw chErr;
    if (!challengeRow) {
      return res.status(401).json({ error: 'challenge_invalid', message: '이미 사용됐거나 만료된 질문입니다.' });
    }

    const userHandleB64 = response.response && response.response.userHandle;
    if (!userHandleB64) return res.status(400).json({ error: 'invalid_request' });
    const webauthnUserId = Buffer.from(userHandleB64, 'base64url');

    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id, handle, webauthn_user_id')
      .eq('webauthn_user_id', toBase64(webauthnUserId))
      .maybeSingle();
    if (userErr) throw userErr;
    if (!userRow) return res.status(401).json({ error: 'unknown_credential' });

    const { data: credRow, error: credErr } = await supabase
      .from('credentials')
      .select('*')
      .eq('id', response.id)
      .eq('user_id', userRow.id)
      .maybeSingle();
    if (credErr) throw credErr;
    if (!credRow) return res.status(401).json({ error: 'unknown_credential' });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        credential: {
          id: credRow.id,
          publicKey: new Uint8Array(fromBase64(credRow.public_key)),
          counter: credRow.counter,
          transports: credRow.transports || undefined,
        },
      });
    } catch (err) {
      console.error('verifyAuthenticationResponse failed', err);
      return res.status(401).json({ error: 'verification_failed' });
    }

    if (!verification.verified) {
      return res.status(401).json({ error: 'verification_failed' });
    }

    // 성공한 요청과 실패한 요청을 가르는 지점: used 처리 + counter 갱신은 검증 통과했을 때만 일어난다
    await supabase.from('webauthn_challenges').update({ used: true }).eq('id', challengeRow.id);
    await supabase
      .from('credentials')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', credRow.id);

    res.setHeader('Set-Cookie', buildSessionCookie(userRow.id, userRow.handle));
    return res.status(200).json({ ok: true, handle: userRow.handle });
  } catch (err) {
    console.error('login/verify error', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
