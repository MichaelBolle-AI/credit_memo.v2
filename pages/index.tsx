import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Document, Packer, Paragraph } from 'docx';
import { saveAs } from 'file-saver';

export default function Home() {
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [date, setDate] = useState('');
  const [memo, setMemo] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch('/api/history?user_id=demo_user');
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
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMemo('');

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

        await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: data.result,
            user_id: 'demo_user'
          }),
        });

        setHistory(prev => [data.result, ...prev]);
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
      margin: 0.5,
      filename: `Credit_Memo_${companyName || 'Company'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    };

    html2pdf().from(element).set(opt).save();
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

        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-2">Memo History</h2>
            <ul className="space-y-2">
              {history.map((item, index) => (
                <li
                  key={index}
                  className="p-2 border rounded cursor-pointer hover:bg-gray-100"
                  onClick={() => setMemo(item)}
                >
                  {item.slice(0, 100)}...
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
