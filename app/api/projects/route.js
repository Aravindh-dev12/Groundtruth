import { NextResponse } from 'next/server';
import { createProject, listProjectsByOwner } from '../../../lib/db';

export const runtime = 'nodejs';
const PUBLIC_WORKSPACE = 'public-workspace';

export async function GET() {
  return NextResponse.json({ projects: listProjectsByOwner(PUBLIC_WORKSPACE) });
}

export async function POST(request) {
  const body = await request.json();
  if (!body.name || !body.name.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const project = createProject({ owner_id: PUBLIC_WORKSPACE, name: body.name.trim(), description: body.description || '', location: body.location || '' });
  return NextResponse.json({ project }, { status: 201 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Use the project workspace to update evidence.' }, { status: 405 });
}

// Public workspaces intentionally use a stable owner key; no sign-in or credentials are required.
