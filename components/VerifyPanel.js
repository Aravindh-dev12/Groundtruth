'use client';

import { useState } from 'react';

const VERDICT_LABEL = {
  supported: 'Supported by evidence',
  partial: 'Partially supported',
  insufficient_evidence: 'Insufficient evidence'
};

export default function VerifyPanel({ projectId, verifications, onVerified }) {
  const [claimText, setClaimText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!claimText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, claim_text: claimText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setClaimText('');
      onVerified?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="claim">Claim to verify</label>
          <textarea
            id="claim"
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
            placeholder="e.g. We planted 500 mangrove saplings across the site this quarter."
          />
        </div>
        {error && <p style={{ color: 'var(--unverified)', fontSize: 13 }}>{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Cross-checking…' : 'Cross-check against evidence'}
        </button>
      </form>

      {verifications.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {verifications.map((v) => (
            <div key={v.id} className="panel" style={{ marginBottom: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{v.claim_text}</strong>
                <span className={`badge ${v.verdict}`}>{VERDICT_LABEL[v.verdict] || v.verdict}</span>
              </div>
              <p className="empty-note" style={{ marginTop: 6, marginBottom: 0 }}>{v.confidence}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
