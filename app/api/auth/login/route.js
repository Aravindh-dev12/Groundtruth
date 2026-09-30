import { NextResponse } from 'next/server';
import { getUserByEmail, toPublicUser } from '../../../../lib/db';
import { verifyPassword, createSessionToken, SESSION_COOKIE } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = getUserByEmail(email);
  // Deliberately identical error for "no such user" and "wrong password" --
  // distinguishing them lets an attacker enumerate valid emails.
  const invalid = () => NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  if (!user) return invalid();
  if (!verifyPassword(password, user.password_hash, user.password_salt)) return invalid();

  const token = createSessionToken(user.id);
  const res = NextResponse.json({ user: toPublicUser(user) });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  });
  return res;
}
