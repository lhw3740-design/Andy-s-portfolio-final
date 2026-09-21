const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7일

function secret() {
  const s = process.env.SESSION_JWT_SECRET;
  if (!s) throw new Error('SESSION_JWT_SECRET 환경변수가 설정되지 않았습니다.');
  return s;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

// 로그인 성공 후(카드3에서 호출) 세션 쿠키를 발급합니다. 비밀번호나 개인키는 담지 않습니다.
function buildSessionCookie(userId, handle) {
  const token = jwt.sign({ sub: userId, handle }, secret(), { expiresIn: SESSION_TTL_SECONDS });
  const isProd = process.env.VERCEL === '1';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

function buildClearCookie() {
  const isProd = process.env.VERCEL === '1';
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

// req에서 세션을 읽어 유효하면 { sub, handle }를, 없거나 만료/변조면 null을 반환합니다.
function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, secret());
  } catch (err) {
    return null; // 만료되었거나 서명이 유효하지 않음
  }
}

module.exports = { COOKIE_NAME, buildSessionCookie, buildClearCookie, getSession, parseCookies };
