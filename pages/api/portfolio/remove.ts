// pages/api/portfolio/remove.ts
import { supabase } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { user_id, lei } = req.body;

  const { error } = await supabase
    .from('portfolio')
    .delete()
    .match({ user_id, lei });

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ message: 'Company removed' });
}
