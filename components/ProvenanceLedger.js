'use client';

import { useEffect, useState, useCallback } from 'react';

export default function ProvenanceLedger({ projectId, refreshKey }) {
  const [receipts, setReceipts] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/receipts/${projectId}`);
    const data = await res.json();
    setReceipts(data.receipts || []);
    setIntegrity(data.integrity || null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div>
      {integrity && (
        <div className="integrity-line">
          <span className={`integrity-dot ${integrity.valid ? 'ok' : 'broken'}`} />
          {integrity.valid
            ? `Chain intact — ${integrity.totalReceipts} signed receipt(s)`
            : `Chain broken at ${integrity.brokenAt}`}
        </div>
      )}

      {loading && <p className="empty-note">Loading ledger&hellip;</p>}
      {!loading && receipts.length === 0 && (
        <p className="empty-note">No activity recorded yet. Every upload, verification, and report
          generates a signed entry here.</p>
      )}

      {receipts.map((r, i) => (
        <div key={r.id} className="ledger-entry">
          <span className="n">{String(i + 1).padStart(2, '0')}</span>
          <div className="body">
            <div className="action">{r.action}</div>
            <div className="empty-note">{r.actor} &middot; {new Date(r.created_at).toLocaleString()}</div>
            <div className="hash">{r.signature.slice(0, 24)}&hellip;</div>
          </div>
        </div>
      ))}
    </div>
  );
}
