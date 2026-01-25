// pages/api/portfolio/remove.ts
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getTenantIdForUser } from '@/lib/tenant';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const tenant_id = await getTenantIdForUser(supabase);
  const { id } = req.body;

  const { error } = await supabase
    .from('portfolio')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ message: 'Removed' });
}
