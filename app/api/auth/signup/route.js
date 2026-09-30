import { NextResponse } from 'next/server';
import { createUser, getUserByEmail, toPublicUser } from '../../../../lib/db';
import { hashPassword, createSessionToken, isValidEmail, SESSION_COOKIE } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request) {
  const { email, password } = await request.json();

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  if (getUserByEmail(email)) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);
  const user = createUser({ email, password_hash: hash, password_salt: salt });
  const token = createSessionToken(user.id);

  const res = NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  });
  return res;
}
