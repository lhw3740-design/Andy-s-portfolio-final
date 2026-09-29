const { getSession } = require('./_lib/session');
const { getSupabase } = require('./_lib/supabase');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 비공개 항목 하나를 번호(id)로 읽는다. 카드5에서 "남의 자료를 번호로 직접 요청하면 거절되는지" 확인하는 용도.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });

  const id = String((req.query && req.query.id) || '');
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid_id' });

  try {
    const { data, error } = await getSupabase()
      .from('private_items')
      .select('id, user_id, title, body, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found' });

    // ★ 남의 자료를 막는 자리: 항목의 주인(user_id)이 지금 로그인한 사람(session.sub)이 아니면 내용 없이 403
    if (data.user_id !== session.sub) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.status(200).json({
      item: { id: data.id, title: data.title, body: data.body, created_at: data.created_at },
    });
  } catch (err) {
    console.error('item.js error', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
