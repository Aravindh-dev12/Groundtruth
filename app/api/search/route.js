import { NextResponse } from 'next/server';
import { getProject, listAssetsByProject } from '../../../lib/db';
import { parseSearchQuery } from '../../../lib/claude';
import { getUserIdFromRequest } from '../../../lib/auth';

export const runtime = 'nodejs';

// Not vector-embedding semantic search -- see README "Honest limitations".
// This turns a natural-language query into literal keyword filters via
// Claude, then matches those against stored tags/detected-object
// categories/phase. Good enough for "find the cleanup photos with people
// in them" without the user knowing the exact tag string; not a
// substitute for real embedding search over a large library.
export async function POST(request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { project_id, query } = await request.json();
  if (!project_id || !query || !query.trim()) {
    return NextResponse.json({ error: 'project_id and query are required' }, { status: 400 });
  }

  const project = getProject(project_id);
  if (!project || project.owner_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let filters;
  try {
    filters = await parseSearchQuery(query);
  } catch (err) {
    return NextResponse.json({ error: `Search parsing failed: ${err.message}` }, { status: 502 });
  }

  const assets = listAssetsByProject(project_id);
  const keywords = filters.keywords.map((k) => k.toLowerCase());

  const matches = assets.filter((a) => {
    if (filters.phase && a.phase !== filters.phase) return false;
    if (keywords.length === 0) return true;

    const tags = JSON.parse(a.tags || '[]').map((t) => t.toLowerCase());
    const categories = JSON.parse(a.detected_objects || '[]').map((d) => (d.category || '').toLowerCase());
    const haystack = [...tags, ...categories, a.phase, a.pair_id || ''].join(' ');

    return keywords.some((k) => haystack.includes(k));
  });

  return NextResponse.json({
    filters,
    results: matches.map((a) => ({
      ...a,
      tags: JSON.parse(a.tags || '[]'),
      detected_objects: JSON.parse(a.detected_objects || '[]')
    }))
  });
}
