// pages/api/docs/list.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getTenantIdForUser } from '@/lib/tenant'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabaseServerClient(req, res)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const tenant_id = await getTenantIdForUser(supabase)
  if (!tenant_id) return res.status(400).json({ error: 'No tenant for this user' })

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ documents: data ?? [] })
}
