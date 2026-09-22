const { getSupabase } = require('./_lib/supabase');
const { getSession } = require('./_lib/session');

module.exports = async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });

  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('credentials')
      .select('id, device_name, created_at')
      .eq('user_id', session.sub)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('passkeys GET error', error);
      return res.status(500).json({ error: 'server_error' });
    }
    return res.status(200).json({ passkeys: data });
  }

  if (req.method === 'DELETE') {
    const body = req.body || {};
    const credentialId = body.credentialId;
    if (!credentialId) return res.status(400).json({ error: 'invalid_request' });

    // 본인 소유의 패스키인지 반드시 확인 (다른 계정 것은 못 지움)
    const { data: existing, error: findErr } = await supabase
      .from('credentials')
      .select('id')
      .eq('id', credentialId)
      .eq('user_id', session.sub)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const { error: delErr } = await supabase.from('credentials').delete().eq('id', credentialId);
    if (delErr) {
      console.error('passkeys DELETE error', delErr);
      return res.status(500).json({ error: 'server_error' });
    }

    const { count } = await supabase
      .from('credentials')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.sub);

    return res.status(200).json({ ok: true, remaining: count || 0 });
  }

  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ error: 'method_not_allowed' });
};
