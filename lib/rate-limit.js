// lib/rate-limit.js
//
// In-memory sliding-window rate limiter, keyed per user, guarding the
// endpoints that spend money on external APIs (Cloudinary add-ons,
// Anthropic calls).
//
// PRODUCTION NOTE: this Map lives in one Node process's memory. Fine for
// a single instance; if you ever run multiple instances behind a load
// balancer, each instance enforces its own independent limit rather than
// a shared one. Swap for Upstash/Redis-backed rate limiting before that
// matters to you.

const buckets = new Map();

/**
 * @param {string} key         Unique key, e.g. `${userId}:upload`
 * @param {object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.max
 * @returns {{ allowed: boolean, remaining: number }}
 */
export function checkRateLimit(key, { windowMs, max }) {
  const now = Date.now();
  const existing = buckets.get(key) || [];
  const recent = existing.filter((ts) => now - ts < windowMs);
  recent.push(now);
  buckets.set(key, recent);

  return {
    allowed: recent.length <= max,
    remaining: Math.max(0, max - recent.length)
  };
}

export const LIMITS = {
  upload: { windowMs: 10 * 60 * 1000, max: 30 }, // 30 uploads / 10 min
  verify: { windowMs: 10 * 60 * 1000, max: 15 }, // 15 verifications / 10 min
  report: { windowMs: 10 * 60 * 1000, max: 8 } // 8 report generations / 10 min
};
