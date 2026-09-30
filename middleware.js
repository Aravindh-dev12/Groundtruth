// middleware.js
//
// Next.js middleware runs on the Edge runtime, which does NOT have
// Node's `crypto` module -- so session verification here is written
// against Web Crypto (SubtleCrypto) instead of the Node-native version
// used in lib/auth.js. Both implement plain HMAC-SHA256 over the same
// "<userId>.<expiry>" string, so a token signed by lib/auth.js (in an
// API route, Node runtime) verifies correctly here.
//
// This protects PAGES (redirects to /login). API routes still do their
// own auth check independently (lib/auth.js's getUserIdFromRequest) --
// don't rely on middleware alone to protect them, since middleware
// matcher config is easy to get subtly wrong and API routes should fail
// closed on their own.

import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'gt_session';
const encoder = new TextEncoder();

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function verifySessionToken(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiry, signatureHex] = parts;
  if (!userId || !expiry || Date.now() > Number(expiry)) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      hexToBytes(signatureHex),
      encoder.encode(`${userId}.${expiry}`)
    );
    return valid ? userId : null;
  } catch {
    return null;
  }
}

export async function middleware(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = await verifySessionToken(token, process.env.SESSION_SECRET);

  const { pathname } = request.nextUrl;
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');

  if (!userId && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (userId && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/projects/:path*', '/login', '/signup']
};
