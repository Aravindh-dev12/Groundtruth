import { NextResponse } from 'next/server';
import { getUserById, toPublicUser } from '../../../../lib/db';
import { getUserIdFromRequest } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(request) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ user: null });

  const user = getUserById(userId);
  return NextResponse.json({ user: toPublicUser(user) });
}
