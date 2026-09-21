const { generateAuthenticationOptions } = require('@simplewebauthn/server');
const { getSupabase } = require('../_lib/supabase');
const { getWebAuthnConfig } = require('../_lib/webauthn-config');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { rpID } = getWebAuthnConfig();
    const supabase = getSupabase();

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      // allowCredentials를 비워둠 -> 아이디를 입력하지 않아도 브라우저가
      // 이 사이트에 등록된(디스커버러블) 패스키 목록을 보여준다
    });

    // 이 시점에는 어떤 계정인지 아직 모른다. user_id는 비워두고, 검증 단계에서
    // 클라이언트가 그대로 돌려준 challenge 문자열로 이 행을 다시 찾는다.
    const { error } = await supabase.from('webauthn_challenges').insert({
      user_id: null,
      type: 'authentication',
      challenge: options.challenge,
    });
    if (error) throw error;

    return res.status(200).json({ options });
  } catch (err) {
    console.error('login/options error', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
