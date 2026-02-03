// pages/api/docs/ingest.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getTenantIdForUser } from '@/lib/tenant'

function findFirstFunction(obj: any, depth = 0): any | null {
  if (typeof obj === 'function') return obj
  if (!obj || typeof obj !== 'object') return null
  if (depth > 6) return null

  for (const key of Object.keys(obj)) {
    const found = findFirstFunction(obj[key], depth + 1)
    if (found) return found
  }
  return null
}

function getPdfParseFromRequire(): (buffer: Buffer) => Promise<{ text?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod: any = require('pdf-parse')

  const fn = findFirstFunction(mod) ?? findFirstFunction(mod?.default)
  if (typeof fn !== 'function') {
    console.error('pdf-parse require() shape keys:', Object.keys(mod || {}))
    console.error('pdf-parse require() raw:', mod)
    throw new Error('pdf-parse module did not expose a callable function (v2 export shape)')
  }

  return fn
}


type Resp =
  | { ok: true; document_id: string; chunks_inserted: number }
  | { ok: false; error: string }

// Keep OpenAI client (same functionality)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * pdf-parse interop helper:
 * Next/Turbopack + Windows sometimes returns different shapes:
 * - function
 * - { default: fn }
 * - { default: { default: fn } }
 * - { pdfParse: fn }
 */
async function getPdfParseFn(): Promise<(buffer: Buffer) => Promise<{ text?: string }>> {
  const mod: any = await import('pdf-parse')

  const candidates = [
    mod,
    mod?.default,
    mod?.default?.default,
    mod?.pdfParse,
  ]

  for (const c of candidates) {
    if (typeof c === 'function') return c
  }

  console.error('pdf-parse import shape:', mod)
  throw new Error('pdf-parse module did not expose a callable function')
}

function chunkText(text: string, maxChars = 1200): string[] {
  // Basic cleanup
  const clean = text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Prefer paragraph chunks
  const paras = clean.split('\n\n').map(s => s.trim()).filter(Boolean)

  const chunks: string[] = []
  for (const p of paras) {
    if (p.length <= maxChars) {
      chunks.push(p)
      continue
    }

    // If paragraph is huge, split by sentences as fallback
    const sentences = p.split(/(?<=[.!?])\s+/)
    let buf = ''
    for (const s of sentences) {
      if ((buf + ' ' + s).trim().length > maxChars) {
        if (buf.trim()) chunks.push(buf.trim())
        buf = s
      } else {
        buf = (buf + ' ' + s).trim()
      }
    }
    if (buf.trim()) chunks.push(buf.trim())
  }

  // Final guard
  return chunks.filter(c => c.length >= 30).slice(0, 3000) // avoid insane PDFs
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  try {
    const supabase = getSupabaseServerClient(req, res)

    // 1) Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) return res.status(401).json({ ok: false, error: authError.message })
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' })

    // 2) Tenant
    const tenant_id = await getTenantIdForUser(supabase)
    if (!tenant_id) return res.status(400).json({ ok: false, error: 'No tenant for this user' })

    // 3) Read input
    const { document_id, portfolio_id } = req.body ?? {}
    if (!document_id) return res.status(400).json({ ok: false, error: 'Missing document_id' })

    // 4) Fetch document metadata (and ensure tenant match)
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .eq('tenant_id', tenant_id)
      .single()

    if (docErr || !doc) {
      return res.status(404).json({ ok: false, error: docErr?.message || 'Document not found' })
    }

// If frontend provided portfolio_id, persist it onto the document (one-time link)
if (portfolio_id && !doc.portfolio_id) {
  const { error: updErr } = await supabase
    .from('documents')
    .update({ portfolio_id })
    .eq('id', document_id)
    .eq('tenant_id', tenant_id)

  if (updErr) {
    return res.status(500).json({ ok: false, error: updErr.message })
  }

  // keep local copy updated so below uses correct value
  doc.portfolio_id = portfolio_id
}

    // 5) Download file from Storage
    const { data: fileData, error: dlErr } = await supabase
      .storage
      .from(doc.bucket)
      .download(doc.object_path)

    if (dlErr || !fileData) {
      return res.status(500).json({ ok: false, error: dlErr?.message || 'Failed to download file' })
    }

    const ab = await fileData.arrayBuffer()
    const buffer = Buffer.from(ab)

   // 6) Extract text (PDF) — use runtime require() for pdf-parse (most reliable under Next 16 + Windows)
let pdfParseAny: any
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  pdfParseAny = require('pdf-parse')
} catch (e) {
  return res.status(500).json({ ok: false, error: 'pdf-parse is not installed or cannot be required' } as any)
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

const parsed = await pdfParse(buffer)
const fullText = (parsed.text || '').trim()


    // 7) Chunk
    const chunks = chunkText(fullText, 1200)
    if (chunks.length === 0) return res.status(400).json({ ok: false, error: 'No usable chunks after splitting' })

    // 8) (Re)ingest: delete old chunks for this document (optional but recommended)
    const { error: delErr } = await supabase
      .from('document_chunks')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('document_id', document_id)

    if (delErr) {
      return res.status(500).json({ ok: false, error: `Failed to clear existing chunks: ${delErr.message}` })
    }

    // 9) Create embeddings in batches
    const batchSize = 50
    let inserted = 0

    const effectivePortfolioId = portfolio_id ?? doc.portfolio_id ?? null

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)

      const emb = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      })

      const rows = batch.map((content, j) => ({
        tenant_id,
        document_id,
        portfolio_id: effectivePortfolioId,
        chunk_index: i + j,
        content,
        embedding_vector: emb.data[j].embedding,
      }))

      const { error: insErr } = await supabase.from('document_chunks').insert(rows)

      if (insErr) {
        return res
          .status(500)
          .json({ ok: false, error: `Chunk insert failed: ${insErr.message}` })
      }

      inserted += rows.length
    }

    return res
      .status(200)
      .json({ ok: true, document_id, chunks_inserted: inserted })
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message ? String(e.message) : String(e) })
  }
}
