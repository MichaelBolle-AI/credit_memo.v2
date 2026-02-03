// pages/api/docs/upload.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import formidable, { File } from 'formidable'
import fs from 'fs'
import path from 'path'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getTenantIdForUser } from '@/lib/tenant'

export const config = {
  api: {
    bodyParser: false, // required for formidable
  },
}

type UploadResponse =
  | { ok: true; document: any }
  | { ok: false; error: string }

function firstFile(files: formidable.Files): File | null {
  const f = (files.file as File | File[] | undefined)
  if (!f) return null
  return Array.isArray(f) ? f[0] : f
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<UploadResponse>) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const supabase = getSupabaseServerClient(req, res)

  // 1) Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) return res.status(401).json({ ok: false, error: authError.message })
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' })

  // 2) Tenant
  const tenant_id = await getTenantIdForUser(supabase) // should return UUID string
  if (!tenant_id) return res.status(400).json({ ok: false, error: 'No tenant for this user' })

  // 3) Parse multipart form-data
  const form = formidable({ multiples: false, maxFileSize: 25 * 1024 * 1024 }) // 25MB
  const { files } = await new Promise<{ files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err)
      resolve({ files })
    })
  }).catch((e: any) => {
    return res.status(400).json({ ok: false, error: `Upload parse error: ${String(e?.message || e)}` }) as any
  })

  const file = firstFile(files)
  if (!file) return res.status(400).json({ ok: false, error: 'No file provided (field name must be "file")' })

  const originalName = file.originalFilename || 'document'
  const safeName = originalName.replace(/[^\w.\-() ]+/g, '_')
  const ext = path.extname(safeName).toLowerCase()
  const mime_type = file.mimetype || 'application/octet-stream'
  const size_bytes = file.size || 0

  // 4) Upload into tenant folder
  const object_path = `${tenant_id}/${Date.now()}_${safeName}`
  const buffer = fs.readFileSync(file.filepath)

  const { error: uploadError } = await supabase.storage
    .from('tenant-docs')
    .upload(object_path, buffer, { contentType: mime_type, upsert: false })

  if (uploadError) {
    return res.status(500).json({ ok: false, error: uploadError.message })
  }

  // 5) Insert row into documents table
  const { data: docRow, error: dbError } = await supabase
    .from('documents')
    .insert([{
      tenant_id,
      user_id: user.id,
      bucket: 'tenant-docs',
      object_path,
      filename: safeName,
      mime_type,
      size_bytes,
    }])
    .select()
    .single()

  if (dbError) return res.status(500).json({ ok: false, error: dbError.message })

  return res.status(200).json({ ok: true, document: docRow })
}
