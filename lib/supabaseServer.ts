// lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs'
import type { NextApiRequest, NextApiResponse } from 'next'

export function getSupabaseServerClient(req: NextApiRequest, res: NextApiResponse) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)')
  if (!supabaseAnonKey)
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY)'
    )

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return req.cookies[name]
      },
      set(name: string, value: string, options: CookieOptions) {
        res.setHeader('Set-Cookie', serializeCookie(name, value, options))
      },
      remove(name: string, options: CookieOptions) {
        res.setHeader('Set-Cookie', serializeCookie(name, '', { ...options, maxAge: 0 }))
      },
    },
  })
}

/**
 * Minimal cookie serializer (avoids adding another dependency).
 * Works for Supabase auth cookies in pages/api routes.
 */
function serializeCookie(name: string, value: string, options: CookieOptions) {
  const opt = options ?? {}
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]

  if (opt.maxAge !== undefined) parts.push(`Max-Age=${opt.maxAge}`)
  if (opt.domain) parts.push(`Domain=${opt.domain}`)
  if (opt.path) parts.push(`Path=${opt.path}`)
  if (opt.expires) parts.push(`Expires=${opt.expires.toUTCString()}`)
  if (opt.httpOnly) parts.push('HttpOnly')
  if (opt.secure) parts.push('Secure')
  if (opt.sameSite) parts.push(`SameSite=${opt.sameSite}`)

  return parts.join('; ')
}
