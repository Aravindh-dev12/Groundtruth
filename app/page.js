'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', location: '', description: '' });
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const [meRes, projectsRes] = await Promise.all([fetch('/api/auth/me'), fetch('/api/projects')]);

    if (projectsRes.status === 401) {
      router.push('/login');
      return;
    }

    const me = await meRes.json();
    const data = await projectsRes.json();
    setUser(me.user);
    setProjects(data.projects || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form)
    });
    setForm({ name: '', location: '', description: '' });
    setCreating(false);
    load();
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="shell">
      <div className="masthead">
        <h1>GroundTruth</h1>
        <span className="tag" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user?.email}
          <button className="btn ghost" onClick={handleLogout} style={{ padding: '5px 10px', fontSize: 12 }}>
            Sign out
          </button>
        </span>
      </div>

      <div className="workspace" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="panel">
          <h2 className="section-title">Projects</h2>
          {loading && <p className="empty-note">Loading&hellip;</p>}
          {!loading && projects.length === 0 && (
            <p className="empty-note">No projects yet. Create the first one to start ingesting field media.</p>
          )}
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="project-row">
              <div>
                <div className="name">{p.name}</div>
                <div className="meta">{p.location || 'no location set'}</div>
              </div>
              <div className="meta">{new Date(p.created_at).toLocaleDateString()}</div>
            </Link>
          ))}
        </div>

        <div className="panel">
          <h2 className="section-title">New project</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Riverbank cleanup, Phase 2"
              />
            </div>
            <div className="field">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Site name or coordinates"
              />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this project is and what success looks like"
              />
            </div>
            <button className="btn" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
