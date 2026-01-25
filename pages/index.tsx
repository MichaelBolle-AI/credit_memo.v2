import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Document, Packer, Paragraph } from 'docx';
import { saveAs } from 'file-saver';
import type { GetServerSideProps } from 'next';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = getSupabaseServerClient(ctx.req as any, ctx.res as any);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  return { props: {} };
};

export default function Home() {
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [date, setDate] = useState('');
  const [memo, setMemo] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'history' | 'portfolio'>('generate');

  const refreshPortfolio = async () => {
    try {
      const res = await fetch('/api/portfolio');
      const json = await res.json();

      // API returns: { portfolio: [...] }
      if (json.portfolio && Array.isArray(json.portfolio)) {
        setPortfolio(json.portfolio);
      } else if (Array.isArray(json)) {
        // fallback if your API returns array directly
        setPortfolio(json);
      } else {
        console.error('Invalid portfolio response:', json);
        setPortfolio([]);
      }
    } catch (err) {
      console.error('Failed to refresh portfolio:', err);
      setPortfolio([]);
    }
  };

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch('/api/history');
        const json = await res.json();

        if (json.history && Array.isArray(json.history)) {
          setHistory(json.history.map((item: any) => item.text));
        } else {
          console.error('Invalid history response:', json);
          setHistory([]);
        }
      } catch (err) {
        console.error('Failed to load memo history:', err);
        setHistory([]);
      }
    }

    loadHistory();
    refreshPortfolio();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMemo('');

    const prompt = `Generate a credit risk memorandum for the following:\nCompany: ${companyName}\nIndustry: ${industry}\nDate: ${date}\nInclude Executive Summary, Business Overview, Financial Analysis, and Risk Assessment.`;

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (res.status === 429) {
        setMemo('Error: Too many requests. Please wait and try again in a moment.');
      } else if (!res.ok) {
        let errorMsg = 'An error occurred.';
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {}
        setMemo('Error: ' + errorMsg);
      } else {
        const data = await res.json();
        const resultText = data.result || 'No memo was generated.';
        setMemo(resultText);

        // Save memo (NO user_id from client)
        await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: resultText }),
        });

        setHistory(prev => [resultText, ...prev]);
      }
    } catch (err) {
      setMemo('Error: Unable to reach the server.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!memo) return;

    const doc = new Document({
      sections: [
        {
          children: memo.split('\n\n').map(paragraph => new Paragraph(paragraph)),
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Credit_Memo_${companyName || 'Company'}.docx`);
  };

  const handlePdfDownload = async () => {
    const element = document.getElementById('memo-content');
    if (!element) return;

    const html2pdf = (await import('html2pdf.js')).default;

    const opt = {
      margin: 10,
      filename: 'credit-memo.pdf',
      image: { type: 'jpeg' as 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm' as 'mm', format: 'a4' as 'a4', orientation: 'portrait' as 'portrait' },
    };

    html2pdf().from(element).set(opt as any).save();
  };

  return (
    <main className="min-h-screen bg-slate-50 font-sans p-6 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6 text-center">AI Credit Memo Generator</h1>

        <div className="flex justify-center mb-6 space-x-4">
          <button
            onClick={() => setActiveTab('generate')}
            className={`px-4 py-2 font-semibold rounded ${
              activeTab === 'generate' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
            }`}
          >
            Generate Memo
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-semibold rounded ${
              activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
            }`}
          >
            Memo History
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`px-4 py-2 font-semibold rounded ${
              activeTab === 'portfolio' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
            }`}
          >
            Portfolio
          </button>
        </div>

        {activeTab === 'generate' && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4 mb-6">
              <input
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400"
                placeholder="Company Symbol (e.g., AAPL)"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                required
              />
              <input
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400"
                placeholder="Industry"
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                required
              />
              <input
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold shadow hover:bg-blue-700 transition"
                disabled={loading}
              >
                {loading ? 'Generating...' : 'Generate'}
              </button>
            </form>

            {companyName && industry && (
              <div className="mb-4 text-right">
                <button
                  className="text-sm px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  onClick={async () => {
                    const response = await fetch('/api/portfolio/add', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: companyName,
                        ticker: companyName,
                        industry,
                        country: 'N/A',
                        lei: 'N/A',
                      }),
                    });

                    if (response.ok) {
                      await refreshPortfolio();
                      alert('Company saved to portfolio!');
                    } else {
                      const err = await response.json();
                      alert('Error saving to portfolio: ' + (err.error || 'Unknown error'));
                    }
                  }}
                >
                  Save to Portfolio
                </button>
              </div>
            )}

            <div id="memo-content" className="prose prose-slate bg-gray-50 rounded-lg p-6 min-h-[160px]">
              {memo ? <ReactMarkdown>{memo}</ReactMarkdown> : 'The generated memo will appear here.'}
            </div>

            {memo && (
              <div className="mt-4 space-x-4">
                <button
                  className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 transition"
                  onClick={handleDownload}
                >
                  Download as Word
                </button>
                <button
                  className="bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700 transition"
                  onClick={handlePdfDownload}
                >
                  Download as PDF
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div className="mt-4">
            {history.length > 0 ? (
              <ul className="space-y-2">
                {history.map((item, index) => (
                  <li
                    key={index}
                    className="p-2 border rounded cursor-pointer hover:bg-gray-100"
                    onClick={() => {
                      setMemo(item);
                      setActiveTab('generate');
                    }}
                  >
                    {item.slice(0, 100)}...
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-gray-500">No memo history available.</p>
            )}
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="mt-4">
            {portfolio.length > 0 ? (
              <ul className="space-y-2">
                {portfolio.map((entry, index) => (
                  <li key={entry.id ?? index} className="p-3 border rounded-lg hover:bg-gray-100">
                    <div
                      className="cursor-pointer"
                      onClick={() => {
                        setCompanyName(entry.name);
                        setIndustry(entry.industry);
                        setActiveTab('generate');
                      }}
                    >
                      <div className="font-semibold">
                        {entry.name} ({entry.ticker})
                      </div>
                      <div className="text-sm text-gray-600">
                        {entry.industry} | {entry.country} | LEI: {entry.lei}
                      </div>
                    </div>

                    <div className="mt-2 text-right">
                      <button
                        className="text-xs text-red-600 hover:underline"
                        onClick={async () => {
                          const confirmDelete = confirm(`Remove ${entry.name} from your portfolio?`);
                          if (!confirmDelete) return;

                          const payload = entry.id ? { id: entry.id } : { lei: entry.lei }; // fallback
                          const response = await fetch('/api/portfolio/remove', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                          });

                          if (response.ok) await refreshPortfolio();
                          else {
                            const err = await response.json().catch(() => ({}));
                            alert('Error removing from portfolio: ' + (err.error || 'Unknown error'));
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-center">No saved companies in your portfolio.</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
