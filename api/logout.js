const { buildClearCookie } = require('./_lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  res.setHeader('Set-Cookie', buildClearCookie());
  return res.status(200).json({ ok: true });
};
