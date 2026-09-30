import { NextResponse } from 'next/server';
import { getProject, listReceiptsByProject } from '../../../../lib/db';
import { verifyChain } from '../../../../lib/receipts';
import { getUserIdFromRequest } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const project = getProject(params.projectId);
  if (!project || project.owner_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const receipts = listReceiptsByProject(params.projectId);
  const integrity = verifyChain(params.projectId);

  return NextResponse.json({ receipts, integrity });
}
