import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Document, Packer, Paragraph } from 'docx'
import { saveAs } from 'file-saver'

type PortfolioEntry = {
  id?: string
  name: string
  ticker: string
  industry: string
  country?: string
  lei?: string
}

type DocEntry = {
  id: string
  filename?: string
  name?: string
  mime_type?: string
  size_bytes?: number
  created_at?: string
}

export default function Home() {
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [date, setDate] = useState('')
  const [memo, setMemo] = useState('')
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([])
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [uploading, setUploading] = useState(false)
  const [ingestingId, setIngestingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] =
    useState<'generate' | 'history' | 'portfolio'>('generate')

  /* ---------------- API helpers ---------------- */

  async function refreshPortfolio() {
    try {
      const r = await fetch('/api/portfolio')
      const j = await r.json().catch(() => ({}))
      const arr =
        (Array.isArray(j.portfolio) && j.portfolio) ||
        (Array.isArray(j.data) && j.data) ||
        (Array.isArray(j) && j) ||
        []
      setPortfolio(arr)
    } catch (e) {
      console.error('Failed to refresh portfolio:', e)
      setPortfolio([])
    }
  }

  async function loadHistory() {
    try {
      const r = await fetch('/api/history')
      const j = await r.json().catch(() => ({}))
      const items = Array.isArray(j.history) ? j.history : []
      setHistory(items.map((h: any) => h.text).filter(Boolean))
    } catch (e) {
      console.error('Failed to load history:', e)
      setHistory([])
    }
  }

  async function refreshDocs() {
    try {
      const r = await fetch('/api/docs/lists')
      const j = await r.json().catch(() => ({}))

      const docsArr =
        (Array.isArray(j.documents) && j.documents) ||
        (Array.isArray(j.data) && j.data) ||
        (Array.isArray(j) && j) ||
        []

      setDocs(docsArr)
    } catch (e) {
      console.error('Failed to load documents:', e)
      setDocs([])
    }
  }

  // Load initial data once
  useEffect(() => {
    loadHistory()
    // portfolio/docs are only needed for the Portfolio tab, but loading them once here is harmless
    refreshPortfolio()
    refreshDocs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Also refresh portfolio/docs whenever user opens Portfolio tab
  useEffect(() => {
    if (activeTab === 'portfolio') {
      refreshPortfolio()
      refreshDocs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

/* ---------------- Generate memo ---------------- */

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)
  setMemo('')

  const prompt = `Generate a credit risk memorandum for the following:
Company: ${companyName}
Industry: ${industry}
Date: ${date}
Include Executive Summary, Business Overview, Financial Analysis, and Risk Assessment.`

  try {
const r = await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt,
    portfolio_id: selectedPortfolioId ?? null,
    use_rag: Boolean(selectedPortfolioId),
  }),
})

const j = await r.json().catch(() => ({}))

    if (!r.ok) {
      setMemo('Error: ' + (j.error || 'Request failed'))
      return
    }

    const text = j.result || 'No memo generated.'
    setMemo(text)

    // Save memo server-side (auth-safe; no user_id from client)
    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {})

    setHistory(prev => [text, ...prev])
  } catch (e) {
    setMemo('Error: Unable to reach the server.')
  } finally {
    setLoading(false)
  }
}

  /* ---------------- Portfolio: add/remove ---------------- */

  async function addToPortfolio() {
    if (!companyName || !industry) return
    try {
      const r = await fetch('/api/portfolio/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // auth-safe: do NOT send user_id; server derives user + tenant from cookies
        body: JSON.stringify({
          name: companyName,
          ticker: companyName,
          industry,
          country: 'N/A',
          lei: 'N/A',
        }),
      })

      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        alert('Error saving to portfolio: ' + (j.error || 'Unknown error'))
        return
      }

      alert('Company saved to portfolio ✅')
      await refreshPortfolio()
    } catch (e) {
      alert('Error saving to portfolio: Unable to reach the server.')
    }
  }

  async function removeFromPortfolio(entry: PortfolioEntry) {
    const confirmDelete = confirm(`Remove ${entry.name} from your portfolio?`)
    if (!confirmDelete) return

    try {
      const payload = entry.id ? { id: entry.id } : { lei: entry.lei } // fallback
      const r = await fetch('/api/portfolio/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        alert('Error removing from portfolio: ' + (j.error || 'Unknown error'))
        return
      }

      await refreshPortfolio()
    } catch (e) {
      alert('Error removing from portfolio: Unable to reach the server.')
    }
  }

  /* ---------------- Downloads ---------------- */

  async function downloadWord() {
    if (!memo) return
    const doc = new Document({
      sections: [
        {
          children: memo.split('\n\n').map(p => new Paragraph(p)),
        },
      ],
    })
    const blob = await Packer.toBlob(doc)
    saveAs(blob, `Credit_Memo_${companyName || 'Company'}.docx`)
  }

  async function downloadPdf() {
    if (!memo) return
    const el = document.getElementById('memo-content')
    if (!el) return

    const html2pdf = (await import('html2pdf.js')).default
    html2pdf()
      .from(el)
      .set({
        margin: 10,
        filename: 'credit-memo.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      } as any)
      .save()
  }

  /* ---------------- Documents: upload + ingest ---------------- */

  async function handleDocUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)

      const r = await fetch('/api/docs/upload', {
        method: 'POST',
        body: form,
      })

      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        alert('Upload failed: ' + (j.error || 'Unknown error'))
        return
      }

      alert('Uploaded ✅')
      await refreshDocs()
    } finally {
      setUploading(false)
    }
  }

async function ingestDoc(document_id: string) {
  if (!selectedPortfolioId) {
    alert('Select a company in Portfolio first (so we know where to attach the document).')
    return
  }

  setIngestingId(document_id)
  try {
    const r = await fetch('/api/docs/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_id,                 // ✅ use the parameter
        portfolio_id: selectedPortfolioId,
      }),
    })

    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) {
      alert('Ingest failed: ' + (j.error || 'Unknown error'))
      return
    }

    alert(`Ingested ✅ (${j.chunks_inserted} chunks)`)
  } finally {
    setIngestingId(null)
  }
}

  /* ---------------- UI ---------------- */

  return (
    <main className="min-h-screen bg-slate-50 p-6 flex justify-center">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow p-8">
        <h1 className="text-3xl font-bold text-center mb-6">
          AI Credit Memo Generator
        </h1>

        {/* Tabs */}
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={() => setActiveTab('generate')}
            className={`px-4 py-2 rounded font-semibold ${
              activeTab === 'generate'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800'
            }`}
          >
            Generate
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded font-semibold ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800'
            }`}
          >
            History
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`px-4 py-2 rounded font-semibold ${
              activeTab === 'portfolio'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800'
            }`}
          >
            Portfolio
          </button>
        </div>

        {/* Generate */}
        {activeTab === 'generate' && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4 mb-4">
              <input
                className="w-full p-2 border rounded"
                placeholder="Company (e.g., Lufthansa)"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                required
              />
              <input
                className="w-full p-2 border rounded"
                placeholder="Industry"
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                required
              />
              <input
                className="w-full p-2 border rounded"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-60"
              >
                {loading ? 'Generating…' : 'Generate'}
              </button>
            </form>

            {/* Save to Portfolio (restored) */}
            {companyName && industry && (
              <div className="mb-4 text-right">
                <button
                  className="text-sm px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-60"
                  disabled={loading}
                  onClick={addToPortfolio}
                >
                  Save to Portfolio
                </button>
              </div>
            )}

            <div
              id="memo-content"
              className="prose bg-gray-50 p-4 rounded min-h-[160px]"
            >
              {memo ? <ReactMarkdown>{memo}</ReactMarkdown> : 'No memo yet.'}
            </div>

            {memo && (
              <div className="mt-4 flex gap-4">
                <button
                  className="bg-green-600 text-white px-4 py-2 rounded"
                  onClick={downloadWord}
                >
                  Download Word
                </button>
                <button
                  className="bg-red-600 text-white px-4 py-2 rounded"
                  onClick={downloadPdf}
                >
                  Download PDF
                </button>
              </div>
            )}
          </>
        )}

        {/* History */}
        {activeTab === 'history' && (
          <div>
            {history.length === 0 ? (
              <p className="text-gray-500 text-center">No history</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h, i) => (
                  <li
                    key={i}
                    className="p-2 border rounded cursor-pointer hover:bg-gray-100"
                    onClick={() => {
                      setMemo(h)
                      setActiveTab('generate')
                    }}
                  >
                    {h.slice(0, 140)}…
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Portfolio + Docs */}
        {activeTab === 'portfolio' && (
          <div className="space-y-8">
            {/* Portfolio */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">Portfolio</h2>
                <button
                  className="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                  onClick={refreshPortfolio}
                >
                  Refresh
                </button>
              </div>

              {portfolio.length === 0 ? (
                <p className="text-gray-500 text-center">No portfolio items</p>
              ) : (
                <ul className="space-y-2">
                  {portfolio.map((p, idx) => (
                    <li
                      key={p.id ?? `${p.lei ?? 'x'}-${idx}`}
                      className="p-3 border rounded hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div
                          className="cursor-pointer"
onClick={() => {
  setSelectedPortfolioId(p.id)
  setCompanyName(p.name)
  setIndustry(p.industry)
  setActiveTab('generate')
}}
                        >
                          <div className="font-semibold">
                            {p.name} ({p.ticker})
                          </div>
                          <div className="text-sm text-gray-600">
                            {p.industry}
                            {p.country ? ` | ${p.country}` : ''}
                            {p.lei ? ` | LEI: ${p.lei}` : ''}
                          </div>
                        </div>

                        <button
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => removeFromPortfolio(p)}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Documents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">Documents</h2>
                <button
                  className="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                  onClick={refreshDocs}
                >
                  Refresh
                </button>
              </div>

              {/* Upload */}
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="file"
                  accept=".pdf"
                  disabled={uploading}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleDocUpload(f)
                    e.currentTarget.value = ''
                  }}
                />
                {uploading && (
                  <span className="text-sm text-gray-600">Uploading…</span>
                )}
              </div>

              {/* Docs list */}
              {docs.length === 0 ? (
                <p className="text-gray-500 text-center">
                  No documents uploaded yet
                </p>
              ) : (
                <ul className="space-y-2">
                  {docs.map(d => (
                    <li
                      key={d.id}
                      className="p-3 border rounded flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="font-medium break-words">
                          {d.filename || d.name || '(unnamed file)'}
                        </div>
                        <div className="text-xs text-gray-600">
                          {d.mime_type || 'application/pdf'}
                          {' • '}
                          {Math.round((d.size_bytes || 0) / 1024)} KB
                        </div>
                      </div>

                      <button
                        className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        disabled={ingestingId === d.id}
                        onClick={() => ingestDoc(d.id)}
                      >
                        {ingestingId === d.id ? 'Ingesting…' : 'Ingest'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
