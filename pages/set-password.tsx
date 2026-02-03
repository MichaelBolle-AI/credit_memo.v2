import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

export default function SetPassword() {
  const router = useRouter()
  const supabase = supabaseBrowser()

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) router.replace('/login')
    })()
  }, [router, supabase])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (pw1.length < 8) return setError('Password must be at least 8 characters.')
    if (pw1 !== pw2) return setError('Passwords do not match.')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setLoading(false)

    if (error) return setError(error.message)
    router.replace('/')
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Set your password</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full p-3 border border-slate-300 rounded-lg"
            placeholder="New password"
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            required
          />
          <input
            className="w-full p-3 border border-slate-300 rounded-lg"
            placeholder="Confirm new password"
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold shadow hover:bg-blue-700 transition"
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </div>
    </main>
  )
}
