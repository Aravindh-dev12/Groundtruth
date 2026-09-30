'use client';

import { useState } from 'react';

export default function ReportPanel({ projectId }) {
  const [markdown, setMarkdown] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Report generation failed');
      setMarkdown(data.markdown);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn" onClick={generate} disabled={busy}>
        {busy ? 'Drafting…' : markdown ? 'Regenerate report' : 'Generate impact report'}
      </button>
      {error && <p style={{ color: 'var(--unverified)', fontSize: 13, marginTop: 8 }}>{error}</p>}
      {markdown && <div className="report-output" style={{ marginTop: 14 }}>{markdown}</div>}
    </div>
  );
}
