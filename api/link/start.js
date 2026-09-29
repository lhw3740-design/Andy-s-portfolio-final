const crypto = require('crypto');
const { getSupabase } = require('../_lib/supabase');
const { getSession } = require('../_lib/session');

function randomCode() {
  // 사람이 손으로 입력하기 편하게 헷갈리는 0/O, 1/I 없이 6자리
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });

  const supabase = getSupabase();

  // 이 계정에 아직 안 쓴 코드가 있으면 정리하고 새로 하나 발급 (동시에 여러 개 떠다니지 않게)
  await supabase
    .from('device_link_codes')
    .update({ used: true })
    .eq('user_id', session.sub)
    .eq('used', false);

  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = randomCode();
    const { error } = await supabase.from('device_link_codes').insert({ code, user_id: session.sub });
    if (!error) break;
    if (error.code !== '23505') {
      console.error('link/start error', error);
      return res.status(500).json({ error: 'server_error' });
    }
    code = null; // 코드 충돌(드묾) -> 재시도
  }
  if (!code) return res.status(500).json({ error: 'server_error' });

  return res.status(200).json({ code, expiresInSeconds: 300 });
};
