// pages/api/portfolio/index.ts
import { supabase } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { user_id } = req.query;

  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data);
}
