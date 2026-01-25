// pages/api/portfolio/index.ts
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getTenantIdForUser } from '@/lib/tenant';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const tenant_id = await getTenantIdForUser(supabase);

  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ portfolio: data ?? [] });
}
