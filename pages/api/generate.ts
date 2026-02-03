import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getTenantIdForUser } from '@/lib/tenant'

type RagMatch = {
  document_id: string
  chunk_index: number
  content: string
  similarity?: number
}

function buildContextBlock(matches: RagMatch[]) {
  if (!matches || matches.length === 0) return ''

  // Keep context predictable + readable; you can tune later
  const lines = matches.map((m, i) => {
    const header = `[#${i + 1}] (doc=${m.document_id}, chunk=${m.chunk_index})`
    return `${header}\n${m.content}`
  })

  return `\n\n## Source context (uploaded documents)\n${lines.join('\n\n')}\n`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' })
  }

  const { prompt, portfolio_id, use_rag } = req.body as {
    prompt?: string
    portfolio_id?: string | null
    use_rag?: boolean
  }

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt' })
  }

  try {
    // 1) Auth-safe Supabase client bound to cookies/session
    const supabase = getSupabaseServerClient(req, res)
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()

    if (authErr) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // 2) Resolve tenant_id (your helper encapsulates membership lookup)
    const tenant_id = await getTenantIdForUser(supabase)

    // 3) Optional RAG: retrieve relevant chunks for the selected portfolio_id
    let matches: RagMatch[] = []
    const shouldUseRag = Boolean(use_rag) && Boolean(portfolio_id)

    if (shouldUseRag) {
      // 3a) Create query embedding
      const embResp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: prompt,
        }),
      })

      const embJson = await embResp.json()
      if (!embResp.ok) {
        return res.status(embResp.status).json({
          error: embJson?.error?.message || 'Embedding request failed',
          details: embJson,
        })
      }

      const queryEmbedding = embJson?.data?.[0]?.embedding
      if (!Array.isArray(queryEmbedding)) {
        return res.status(500).json({ error: 'Embedding response malformed' })
      }

      // 3b) Call your SQL function (Step 4) to fetch top chunks
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'match_document_chunks',
        {
          p_tenant_id: tenant_id,
          p_portfolio_id: portfolio_id,
          p_query_embedding: queryEmbedding,
          p_match_count: 8,
        }
      )

      if (rpcErr) {
        // Don’t break memo generation; just continue without RAG context
        console.error('RAG match rpc error:', rpcErr)
      } else if (Array.isArray(rpcData)) {
        matches = rpcData
          .map((row: any) => ({
            document_id: row.document_id,
            chunk_index: row.chunk_index,
            content: row.content,
            similarity: row.similarity,
          }))
          .filter((m: RagMatch) => !!m.content)
      }
    }

    const contextBlock = buildContextBlock(matches)

    // 4) Build final prompt (works with or without RAG)
    const finalPrompt =
      `${prompt}\n\n` +
      `Instructions:\n` +
      `- If Source context is provided, use it when relevant.\n` +
      `- When you use it, cite sources like [#1], [#2].\n` +
      `- If the context is insufficient or irrelevant, say so.\n` +
      contextBlock

    // 5) Generate memo (keeps your existing model choice)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an assistant that writes credit risk memoranda.',
          },
          { role: 'user', content: finalPrompt },
        ],
        temperature: 0.7,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      return res.status(response.status).json(data)
    }

    const result = data?.choices?.[0]?.message?.content ?? ''

    return res.status(200).json({
      result,
      rag: {
        used: shouldUseRag,
        matches: matches.map((m, i) => ({
          ref: `#${i + 1}`,
          document_id: m.document_id,
          chunk_index: m.chunk_index,
          similarity: m.similarity ?? null,
        })),
      },
    })
  } catch (error: any) {
    console.error('generate error:', error)
    return res.status(500).json({ error: 'Failed to fetch from OpenAI.' })
  }
}
