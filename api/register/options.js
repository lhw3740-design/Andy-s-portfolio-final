const crypto = require('crypto');
const { generateRegistrationOptions } = require('@simplewebauthn/server');
const { getSupabase } = require('../_lib/supabase');
const { getSession } = require('../_lib/session');
const { getWebAuthnConfig } = require('../_lib/webauthn-config');
const { toBase64, fromBase64 } = require('../_lib/buf');

const HANDLE_RE = /^[a-zA-Z0-9_-]{2,20}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { rpID, rpName } = getWebAuthnConfig();
    const supabase = getSupabase();
    const session = getSession(req);
    const body = req.body || {};

    let userRow;
    let existingCredentials = [];

    if (session) {
      // 이미 로그인된 상태 -> 같은 계정에 패스키를 하나 더 등록 (카드4에서 사용)
      const { data, error } = await supabase.from('users').select('*').eq('id', session.sub).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(401).json({ error: 'unauthorized' });
      userRow = data;

      const { data: creds, error: credErr } = await supabase
        .from('credentials')
        .select('id, transports')
        .eq('user_id', userRow.id);
      if (credErr) throw credErr;
      existingCredentials = creds || [];
    } else {
      // 로그인 전 -> 새 계정을 만드는 등록 (카드2)
      const handle = String(body.handle || '').trim();
      if (!HANDLE_RE.test(handle)) {
        return res
          .status(400)
          .json({ error: 'invalid_handle', message: '아이디는 영문/숫자/-/_ 2~20자여야 합니다.' });
      }

      const webauthnUserId = crypto.randomBytes(32);
      const { data, error } = await supabase
        .from('users')
        .insert({ handle, webauthn_user_id: toBase64(webauthnUserId) })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'handle_taken', message: '이미 사용 중인 아이디입니다.' });
        }
        throw error;
      }
      userRow = data;
    }

    const webauthnUserId = fromBase64(userRow.webauthn_user_id);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: userRow.handle,
      userID: new Uint8Array(webauthnUserId),
      userDisplayName: userRow.handle,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((c) => ({
        id: c.id,
        transports: c.transports || undefined,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    const { error: chError } = await supabase.from('webauthn_challenges').insert({
      user_id: userRow.id,
      type: 'registration',
      challenge: options.challenge,
    });
    if (chError) throw chError;

    return res.status(200).json({ options, userId: userRow.id, handle: userRow.handle });
  } catch (err) {
    console.error('register/options error', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
