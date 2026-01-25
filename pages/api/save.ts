import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getTenantIdForUser } from '@/lib/tenant'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = getSupabaseServerClient(req, res)

  // 1) Authenticate user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // 2) Resolve tenant_id
  const tenant_id = await getTenantIdForUser(supabase)

  // 3) Read payload (NO user_id from client)
  const { text } = req.body

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Invalid memo text' })
  }

  // 4) Insert memo
  const { data, error } = await supabase
    .from('memos')
    .insert([{ tenant_id, user_id: user.id, text }])
    .select()
    .single()

  if (error || !data) {
    console.error('Failed to insert memo:', error)
    return res.status(500).json({ error: error?.message || 'Insert failed' })
  }

  return res.status(200).json({ memo: data })
}
