const { getSession } = require('./_lib/session');
const { getSupabase } = require('./_lib/supabase');

const MAX_ITEMS_PER_USER = 20;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = await getSession(req);
  if (!session) {
    // 로그인(패스키 인증)하지 않은 상태 -> 비공개 내용은 절대 내려주지 않음
    return res.status(401).json({ error: 'unauthorized' });
  }

  // ★ 카드5: 누구의 자료인지는 오직 서버가 확인한 세션(session.sub)으로만 정한다.
  //   주소(?user=...)나 요청 본문(user_id 등)에 다른 계정이 적혀 있어도 읽지 않고 무시한다.
  try {
    const supabase = getSupabase();

    if (req.method === 'POST') {
      const payload = req.body || {};
      const title = String(payload.title || '').trim();
      const text = String(payload.body || '').trim();
      if (!title || title.length > 60 || !text || text.length > 500) {
        return res.status(400).json({ error: 'invalid_input', message: '제목 1~60자, 내용 1~500자로 적어주세요.' });
      }

      const { count, error: countErr } = await supabase
        .from('private_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.sub);
      if (countErr) throw countErr;
      if ((count || 0) >= MAX_ITEMS_PER_USER) {
        return res.status(400).json({ error: 'too_many_items', message: `메모는 최대 ${MAX_ITEMS_PER_USER}개까지예요.` });
      }

      const { data: created, error: insErr } = await supabase
        .from('private_items')
        .insert({ user_id: session.sub, title, body: text }) // user_id는 항상 세션 값
        .select('id, title, body, created_at')
        .single();
      if (insErr) throw insErr;
      return res.status(201).json({ handle: session.handle, item: created });
    }

    const { data, error } = await supabase
      .from('private_items')
      .select('id, title, body, created_at')
      .eq('user_id', session.sub)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ handle: session.handle, items: data });
  } catch (err) {
    console.error('private.js error', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
