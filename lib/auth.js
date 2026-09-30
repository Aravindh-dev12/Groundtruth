// lib/auth.js
//
// Password hashing (scrypt, Node built-in, no extra dependency) and
// signed session tokens (HMAC-SHA256, same pattern as the provenance
// ledger in lib/receipts.js). Sessions are stateless: everything needed
// to verify one is in the token itself plus SESSION_SECRET, so there's
// no session table to manage or expire server-side.
//
// Token shape: "<userId>.<expiryMs>.<hex signature>"
// Signed over the string "<userId>.<expiryMs>".
//
// This same construction is re-verified in middleware.js using
// SubtleCrypto instead of Node's crypto module, because Next.js
// middleware runs on the Edge runtime, which doesn't have Node's
// `crypto` module. Both produce/verify standard HMAC-SHA256 over the
// same bytes, so tokens signed here verify correctly there.

import crypto from 'crypto';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const SESSION_COOKIE = 'gt_session';

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'SESSION_SECRET is missing or too short. Set a long random value in .env.local -- ' +
        'generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return secret;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

export function createSessionToken(userId) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(`${userId}.${expiry}`)
    .digest('hex');
  return `${userId}.${expiry}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiry, signature] = parts;

  if (!userId || !expiry || Date.now() > Number(expiry)) return null;

  const expected = crypto.createHmac('sha256', getSecret()).update(`${userId}.${expiry}`).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return userId;
}

/**
 * Read and verify the session cookie from a Next.js Request object
 * (works in Route Handlers running on the Node runtime).
 */
export function getUserIdFromRequest(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
