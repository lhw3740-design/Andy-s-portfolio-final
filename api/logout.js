const { buildClearCookie, revokeSession } = require('./_lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    // 쿠키만 지우는 게 아니라 서버의 세션 기록도 폐기한다 -> 옛 쿠키 값으로 다시 요청해도 거절됨
    await revokeSession(req);
  } catch (err) {
    console.error('logout revoke failed', err);
  }
  res.setHeader('Set-Cookie', buildClearCookie());
  return res.status(200).json({ ok: true });
};
