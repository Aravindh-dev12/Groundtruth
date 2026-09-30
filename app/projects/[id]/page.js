'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import UploadZone from '../../../components/UploadZone';
import Gallery from '../../../components/Gallery';
import BeforeAfterSlider from '../../../components/BeforeAfterSlider';
import VerifyPanel from '../../../components/VerifyPanel';
import ReportPanel from '../../../components/ReportPanel';
import ProvenanceLedger from '../../../components/ProvenanceLedger';

export default function ProjectWorkspace({ params }) {
  const { id } = params;
  const [data, setData] = useState(null);
  const [ledgerKey, setLedgerKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = no active search
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) setData(await res.json());
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function runSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: id, query: searchQuery })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Search failed');
      setSearchResults(result.results);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
  }

  if (!data) {
    return (
      <div className="shell">
        <p className="empty-note">Loading project&hellip;</p>
      </div>
    );
  }

  const { project, assets, verifications } = data;
  const visibleAssets = searchResults ?? assets;

  function bump() {
    load();
    setLedgerKey((k) => k + 1);
  }

  return (
    <div className="shell">
      <div className="masthead">
        <div>
          <Link href="/" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            &larr; All projects
          </Link>
          <h1 style={{ marginTop: 4 }}>{project.name}</h1>
        </div>
        <span className="tag">{project.location || 'no location set'}</span>
      </div>

      <div className="workspace">
        <div>
          <div className="panel">
            <h2 className="section-title">Ingest field media</h2>
            <UploadZone projectId={id} onUploaded={bump} />
          </div>
          <div className="panel">
            <h2 className="section-title">
              Media library ({visibleAssets.length}
              {searchResults ? ` of ${assets.length}` : ''})
            </h2>
            <form onSubmit={runSearch}>
              <div className="field">
                <label htmlFor="search">Search (plain language — Claude infers matching tags)</label>
                <input
                  id="search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. after photos with people cleaning up debris"
                />
              </div>
              {searchError && <p style={{ color: 'var(--unverified)', fontSize: 13 }}>{searchError}</p>}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button className="btn" type="submit" disabled={searching}>
                  {searching ? 'Searching…' : 'Search'}
                </button>
                {searchResults && (
                  <button type="button" className="btn ghost" onClick={clearSearch}>
                    Clear
                  </button>
                )}
              </div>
            </form>
            <Gallery assets={visibleAssets} />
          </div>
        </div>

        <div>
          <div className="panel">
            <h2 className="section-title">Before / after</h2>
            <BeforeAfterSlider assets={assets} />
          </div>
          <div className="panel">
            <h2 className="section-title">Verify a claim</h2>
            <VerifyPanel projectId={id} verifications={verifications} onVerified={bump} />
          </div>
          <div className="panel">
            <h2 className="section-title">Impact report</h2>
            <ReportPanel projectId={id} />
          </div>
        </div>

        <div>
          <div className="panel">
            <h2 className="section-title">Provenance ledger</h2>
            <ProvenanceLedger projectId={id} refreshKey={ledgerKey} />
          </div>
        </div>
      </div>
    </div>
  );
}
