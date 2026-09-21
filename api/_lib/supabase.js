const { createClient } = require('@supabase/supabase-js');

// service_role 키는 RLS를 우회합니다. 절대 클라이언트/브라우저로 보내지 마세요.
// 이 파일은 /api 안의 서버 함수에서만 import 됩니다.
let client;
function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
    }
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

module.exports = { getSupabase };
