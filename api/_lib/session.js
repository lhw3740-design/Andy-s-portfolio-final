const jwt = require('jsonwebtoken');
const { getSupabase } = require('./supabase');

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

function cookieAttrs(maxAge) {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.VERCEL === '1') parts.push('Secure');
  return parts;
}

// 로그인/등록 성공 후 호출. 세션을 서버 DB(sessions)에 한 줄 저장하고,
// 그 세션 번호(sid)를 서명된 토큰에 넣어 HttpOnly 쿠키로 돌려준다.
// 서버에 기록이 남기 때문에 로그아웃하면 이 줄을 폐기(revoked)해서 옛 쿠키를 무효로 만들 수 있다.
async function createSessionCookie(userId, handle) {
  const supabase = getSupabase();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: userId, expires_at: expiresAt })
    .select('id')
    .single();
  if (error) throw error;

  const token = jwt.sign({ sub: userId, handle, sid: data.id }, secret(), {
    expiresIn: SESSION_TTL_SECONDS,
  });
  return [`${COOKIE_NAME}=${encodeURIComponent(token)}`, ...cookieAttrs(SESSION_TTL_SECONDS)].join('; ');
}

function buildClearCookie() {
  return [`${COOKIE_NAME}=`, ...cookieAttrs(0)].join('; ');
}

function readToken(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, secret());
  } catch (err) {
    return null; // 만료됐거나 서명이 유효하지 않음
  }
}

// 유효하면 { sub, handle, sid }, 아니면 null.
// 토큰 서명뿐 아니라 서버의 sessions 기록이 폐기되지 않았고 만료 전인지도 확인한다.
async function getSession(req) {
  const payload = readToken(req);
  if (!payload || !payload.sid) return null;
  try {
    const { data, error } = await getSupabase()
      .from('sessions')
      .select('id')
      .eq('id', payload.sid)
      .eq('user_id', payload.sub)
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return payload;
  } catch (err) {
    console.error('getSession lookup failed', err);
    return null; // 확인 못 하면 열어주지 않는다
  }
}

// 로그아웃: 이 쿠키가 가리키는 서버 세션을 폐기한다.
async function revokeSession(req) {
  const payload = readToken(req);
  if (!payload || !payload.sid) return;
  await getSupabase().from('sessions').update({ revoked: true }).eq('id', payload.sid);
}

module.exports = {
  COOKIE_NAME,
  createSessionCookie,
  buildClearCookie,
  getSession,
  revokeSession,
  parseCookies,
};
