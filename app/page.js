'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const signals = [
  { label: 'Evidence coverage', value: '82%', trend: '+14%', tone: 'good' },
  { label: 'Claims ready', value: '24', trend: '+6 this week', tone: 'blue' },
  { label: 'Needs review', value: '07', trend: '3 high priority', tone: 'warn' }
];

const suggestedWork = [
  ['Evidence gaps', 'Find claims with no supporting media', '12 claims'],
  ['Impact story', 'Draft a funder-ready narrative from this quarter', '18 sources'],
  ['Quality scan', 'Detect duplicates, weak metadata, and contradictions', 'Run scan']
];

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', location: '', description: '' });

  async function load() {
    setLoading(true);
    const response = await fetch('/api/projects');
    const data = await response.json();
    setProjects(data.projects || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
    setForm({ name: '', location: '', description: '' });
    setCreating(false);
    load();
  }

  const filteredProjects = projects.filter((project) => `${project.name} ${project.location || ''}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">G</span><span>GroundTruth</span></div>
        <div className="workspace-label">WORKSPACE <span>PUBLIC</span></div>
        <nav className="nav-list" aria-label="Primary navigation">
          <a className="nav-item active" href="#overview"><span>◈</span> Intelligence hub</a>
          <a className="nav-item" href="#projects"><span>□</span> Evidence library <b>{projects.length}</b></a>
          <a className="nav-item" href="#reports"><span>↗</span> Reports</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-status"><span className="status-dot" /> AI analyst online<div>Continuously checking your evidence</div></div>
          <div className="privacy-note">No account required.<br />Your workspace stays on this device.</div>
        </div>
      </aside>

      <section className="main-content" id="overview">
        <header className="topbar"><div><span className="eyebrow">FIELD INTELLIGENCE / 01</span><h1>Make every claim defensible.</h1></div><button className="ghost-btn" type="button">Export workspace <span>↓</span></button></header>
        <div className="command-bar"><span className="command-icon">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask GroundTruth anything about your evidence…" /><kbd>⌘ K</kbd></div>

        <section className="signal-grid" aria-label="Workspace signals">
          {signals.map((signal) => <article className="signal-card" key={signal.label}><div className="signal-label">{signal.label}<span className={`signal-dot ${signal.tone}`} /></div><div className="signal-value">{signal.value}</div><div className="signal-trend">{signal.trend}</div></article>)}
        </section>

        <div className="content-grid">
          <section className="panel project-panel" id="projects"><div className="panel-heading"><div><span className="eyebrow">ACTIVE PROJECTS</span><h2>Evidence workspace</h2></div><span className="count-pill">{projects.length || '0'} projects</span></div>
            {loading && <p className="empty-note">Loading workspace…</p>}
            {!loading && filteredProjects.length === 0 && <div className="empty-state"><div className="empty-icon">＋</div><div><strong>Start your first evidence workspace</strong><p>Bring in field media and let GroundTruth map what is proven, missing, or contradictory.</p></div></div>}
            {filteredProjects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="project-card"><div className="project-avatar">{project.name.slice(0, 1).toUpperCase()}</div><div className="project-info"><strong>{project.name}</strong><span>{project.location || 'Location not set'}</span></div><div className="project-score"><span>Evidence score</span><strong>—</strong></div><span className="arrow">→</span></Link>)}
          </section>

          <section className="panel analyst-panel"><div className="panel-heading"><div><span className="eyebrow">ANALYST QUEUE</span><h2>Suggested next moves</h2></div><span className="pulse">● live</span></div><div className="suggestions">{suggestedWork.map(([title, copy, meta], index) => <button className="suggestion" key={title} type="button"><span className="suggestion-number">0{index + 1}</span><span><strong>{title}</strong><small>{copy}</small></span><em>{meta}</em></button>)}</div><div className="analyst-callout"><span className="spark">✦</span><div><strong>Your analyst is ready</strong><p>Upload media or describe a reporting question to begin.</p></div></div></section>
        </div>

        <section className="panel create-panel" id="reports"><div><span className="eyebrow">NEW WORKSPACE</span><h2>Turn field work into trusted intelligence.</h2><p>GroundTruth connects media, claims, and reports in one auditable trail.</p></div><form onSubmit={handleCreate} className="create-form"><input aria-label="Project name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Project name" /><input aria-label="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Location or site" /><button className="primary-btn" disabled={creating}>{creating ? 'Creating…' : 'Create workspace'} <span>→</span></button></form></section>
        <footer className="footer"><span>GROUNDTRUTH ENGINE v0.2</span><span>Evidence first · AI assisted · Human accountable</span></footer>
      </section>
    </main>
  );
}
