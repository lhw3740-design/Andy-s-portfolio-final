const { getSession } = require('./_lib/session');
const { getSupabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = getSession(req);
  if (!session) {
    // 로그인(패스키 인증)하지 않은 상태 -> 비공개 내용은 절대 내려주지 않음
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const supabase = getSupabase();
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
