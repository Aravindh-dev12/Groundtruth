'use client';

import { useState } from 'react';

export default function UploadZone({ projectId, onUploaded }) {
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState('before');
  const [pairId, setPairId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('project_id', projectId);
    fd.append('phase', phase);
    if (pairId.trim()) fd.append('pair_id', pairId.trim());

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setFile(null);
      onUploaded?.(data.asset);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="file">Field photo or video</label>
        <input
          id="file"
          type="file"
          accept="image/*,video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>
      <div className="field">
        <label htmlFor="phase">Phase</label>
        <select id="phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
          <option value="before">Before</option>
          <option value="after">After</option>
          <option value="unspecified">Unspecified</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="pairId">Pair ID (optional — links a before/after pair)</label>
        <input
          id="pairId"
          type="text"
          value={pairId}
          onChange={(e) => setPairId(e.target.value)}
          placeholder="e.g. plot-4"
        />
      </div>
      {error && <p style={{ color: 'var(--unverified)', fontSize: 13 }}>{error}</p>}
      <button className="btn" type="submit" disabled={!file || busy}>
        {busy ? 'Uploading & analyzing…' : 'Upload'}
      </button>
    </form>
  );
}
