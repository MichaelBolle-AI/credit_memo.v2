// pages/api/rag/search.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getTenantIdForUser } from '@/lib/tenant'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { query, portfolio_id, top_k } = req.body as {
    query?: string
    portfolio_id?: string
    top_k?: number
  }

  if (!query || !portfolio_id) {
    return res.status(400).json({ error: 'Missing query or portfolio_id' })
  }

  const supabase = getSupabaseServerClient(req, res)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const tenant_id = await getTenantIdForUser(supabase)

  // 1) embed the query
  const emb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })

  const queryEmbedding = emb.data[0].embedding

  // 2) call SQL function
  const { data, error } = await supabase.rpc('match_document_chunks', {
    p_tenant_id: tenant_id,
    p_portfolio_id: portfolio_id,
    p_query_embedding: queryEmbedding,
    p_match_count: top_k ?? 8,
  })

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true, matches: data ?? [] })
}
