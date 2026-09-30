// lib/receipts.js
//
// Append-only, signed provenance chain. Every ingest / verification / report
// action writes one receipt that hashes its own input+output and links to
// the previous receipt in the same project's chain -- so tampering with (or
// deleting) any past record breaks every signature after it, and that break
// is cheaply detectable without needing a blockchain.
//
// This is a lightweight stand-in for full C2PA/Content Credentials, which
// Cloudinary supports in beta for images but currently gates behind a
// request-access program. Swap this ledger for Cloudinary-native C2PA
// signing when/if that access is granted -- the receipt shape here
// (actor, action, input/output hash, timestamp, chain link) maps directly
// onto a C2PA manifest's assertions if you make that move later.

import crypto from 'crypto';
import { insertReceipt, lastReceiptForProject, listReceiptsByProject, newId, nowIso } from './db';

function getSecret() {
  const secret = process.env.RECEIPT_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'RECEIPT_SIGNING_SECRET is missing or too short. Set a long random value in .env.local -- ' +
        "see .env.example for how to generate one. Refusing to sign receipts with a weak secret."
    );
  }
  return secret;
}

export function hashPayload(payload) {
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

function sign(payloadHash, prevHash) {
  const secret = getSecret();
  return crypto
    .createHmac('sha256', secret)
    .update(`${payloadHash}:${prevHash || 'genesis'}`)
    .digest('hex');
}

/**
 * Write one receipt into a project's chain.
 * @param {object} opts
 * @param {string} opts.project_id
 * @param {string} [opts.asset_id]
 * @param {string} opts.action   'ingest' | 'verify' | 'report_generated'
 * @param {string} opts.actor    e.g. 'system:content-analysis', 'user:<id>', 'claude:report-generator'
 * @param {object} opts.input    whatever went into the action (kept out of the row itself, only hashed)
 * @param {object} opts.output   whatever came out of the action
 */
export function appendReceipt({ project_id, asset_id, action, actor, input, output }) {
  const prev = lastReceiptForProject(project_id);
  const payloadHash = hashPayload({ action, actor, input, output, ts: nowIso() });
  const signature = sign(payloadHash, prev ? prev.signature : null);

  return insertReceipt({
    id: newId('rcpt'),
    project_id,
    asset_id: asset_id || null,
    action,
    actor,
    payload_hash: payloadHash,
    prev_hash: prev ? prev.signature : null,
    signature,
    created_at: nowIso()
  });
}

/**
 * Walk a project's full chain and confirm every link's signature is
 * consistent with the one before it. Does NOT re-derive payload_hash from
 * original input/output (those aren't stored, by design -- only their
 * hash is) -- it confirms the chain of signatures itself hasn't been
 * altered or had entries removed/reordered.
 */
export function verifyChain(projectId) {
  const receipts = listReceiptsByProject(projectId);
  let prevSignature = null;

  for (const r of receipts) {
    const expected = sign(r.payload_hash, prevSignature);
    if (expected !== r.signature) {
      return { valid: false, brokenAt: r.id, totalReceipts: receipts.length };
    }
    if ((r.prev_hash || null) !== (prevSignature || null)) {
      return { valid: false, brokenAt: r.id, totalReceipts: receipts.length };
    }
    prevSignature = r.signature;
  }

  return { valid: true, brokenAt: null, totalReceipts: receipts.length };
}
