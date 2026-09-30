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
  const keywords = Array.isArray(filters.keywords)
    ? filters.keywords.filter(Boolean).map((keyword) => keyword.toLowerCase().trim())
    : [];

  const results = assets
    .flatMap((asset) => {
      let tags = [];
      let detectedObjects = [];
      try {
        tags = JSON.parse(asset.tags || '[]');
        detectedObjects = JSON.parse(asset.detected_objects || '[]');
      } catch {
        return [];
      }

      if (filters.phase && asset.phase !== filters.phase) return [];
      const searchable = [
        ...tags,
        ...detectedObjects.map((object) => object.category || ''),
        asset.phase,
        asset.pair_id || ''
      ].join(' ').toLowerCase();
      const matchedKeywords = keywords.filter((keyword) => searchable.includes(keyword));
      if (keywords.length > 0 && matchedKeywords.length === 0) return [];

      return [{
        ...asset,
        tags,
        detected_objects: detectedObjects,
        relevance: keywords.length ? matchedKeywords.length / keywords.length : 1
      }];
    })
    .sort((a, b) => b.relevance - a.relevance || a.uploaded_at.localeCompare(b.uploaded_at));

  return NextResponse.json({ filters, results });
}
