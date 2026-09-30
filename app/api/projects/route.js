import { NextResponse } from 'next/server';
import { createProject, listProjectsByOwner } from '../../../lib/db';
import { getUserIdFromRequest } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  return NextResponse.json({ projects: listProjectsByOwner(userId) });
}

export async function POST(request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const project = createProject({
    owner_id: userId,
    name: body.name.trim(),
    description: body.description || '',
    location: body.location || ''
  });

  return NextResponse.json({ project }, { status: 201 });
}
