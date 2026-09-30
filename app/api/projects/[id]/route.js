import { NextResponse } from 'next/server';
import { getProject, listAssetsByProject, listVerificationsByProject } from '../../../../lib/db';
import { getUserIdFromRequest } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const project = getProject(params.id);
  // Same response for "doesn't exist" and "exists but isn't yours" --
  // otherwise this endpoint would let anyone probe which project ids are
  // real.
  if (!project || project.owner_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const assets = listAssetsByProject(params.id).map((a) => ({
    ...a,
    tags: JSON.parse(a.tags || '[]'),
    detected_objects: JSON.parse(a.detected_objects || '[]'),
    geo: a.geo ? JSON.parse(a.geo) : null
  }));

  const verifications = listVerificationsByProject(params.id).map((v) => ({
    ...v,
    supporting_assets: JSON.parse(v.supporting_assets || '[]')
  }));

  return NextResponse.json({ project, assets, verifications });
}
