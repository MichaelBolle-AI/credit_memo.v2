// pages/api/portfolio/add.ts
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getTenantIdForUser } from '@/lib/tenant';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabase = getSupabaseServerClient(req, res);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const tenant_id = await getTenantIdForUser(supabase);

  const { name, ticker, industry, country, lei } = req.body;

  const { data, error } = await supabase
    .from('portfolio')
    .insert([{ tenant_id, user_id: user.id, name, ticker, industry, country, lei }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ message: 'Company added', data });
}

