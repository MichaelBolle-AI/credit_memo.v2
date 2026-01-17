// pages/api/portfolio/add.ts
import { supabase } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { user_id, name, ticker, industry, country, lei } = req.body;

  const { data, error } = await supabase
  .from("portfolio")
  .insert([{ user_id, name, ticker, industry, country, lei }])
  .select()
  .single();



  if (error) {
    console.error('Supabase error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ message: 'Company added', data });
}
