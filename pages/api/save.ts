import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, user_id } = req.body;

  const { data, error } = await supabase
    .from('memos')
    .insert([{ text, user_id }])
    .select(); // Ensures inserted data is returned

  if (error || !data || data.length === 0) {
    console.error('Failed to insert memo:', error);
    return res.status(500).json({ error: error?.message || 'Insert failed' });
  }

  res.status(200).json({ memo: data[0] });
}
