import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [date, setDate] = useState('');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMemo(''); // Clear previous memo

    const prompt = `Generate a credit risk memorandum for the following:
Company: ${companyName}
Industry: ${industry}
Date: ${date}
Include Executive Summary, Business Overview, Financial Analysis, and Risk Assessment.`;

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
        setMemo(data.result || 'No memo was generated.');
      }
    } catch (err) {
      setMemo('Error: Unable to reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 font-sans p-6 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6 text-center">AI Credit Memo Generator</h1>
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <input
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400"
            placeholder="Company Name"
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
        <div className="prose prose-slate bg-gray-50 rounded-lg p-6 min-h-[160px]">
          {memo ? <ReactMarkdown>{memo}</ReactMarkdown> : 'The generated memo will appear here.'}
        </div>
      </div>
    </main>
  );
}
