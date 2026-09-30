// lib/db.js
//
// Persistence layer. SQLite via better-sqlite3: zero-config, synchronous,
// fine for local dev and small single-instance deployments.
//
// PRODUCTION NOTE: on stateless/serverless hosts (Vercel, most FaaS) the
// filesystem is ephemeral -- this file will be wiped between deploys and
// isn't shared across instances. Before deploying there, swap this module
// for a hosted Postgres client (Neon/Supabase/RDS) with the same exported
// function shapes; nothing outside this file needs to change.
//
// SCHEMA CHANGES: tables use CREATE TABLE IF NOT EXISTS, so a fresh
// database gets the current schema automatically. If you already have a
// running database from an earlier version of this schema (e.g. before
// the `users`/`owner_id` columns existed), IF NOT EXISTS will NOT
// retrofit new columns onto an existing table -- you'd need a real
// migration tool (drizzle-kit, node-pg-migrate, or hand-rolled ALTER
// TABLE statements) once this has real data in it. For a first deploy
// with an empty database, this is a non-issue.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = process.env.DATABASE_PATH || './data/groundtruth.db';

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let _db = null;

export function getDb() {
  if (_db) return _db;

  ensureDir(DB_PATH);
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, created_at)
    VALUES ('public-workspace', 'public@groundtruth.local', 'disabled', 'disabled', datetime('now'));

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      public_id TEXT NOT NULL,
      secure_url TEXT NOT NULL,
      resource_type TEXT NOT NULL DEFAULT 'image',
      phase TEXT NOT NULL DEFAULT 'unspecified', -- 'before' | 'after' | 'unspecified'
      pair_id TEXT,                               -- links a before/after pair together
      tags TEXT,                                  -- JSON array
      detected_objects TEXT,                      -- JSON array of {category, count, avg_confidence}
      geo TEXT,                                   -- JSON {lat, lng} if EXIF had it
      captured_at TEXT,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      claim_text TEXT NOT NULL,
      parsed_quantity REAL,
      parsed_subject TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES claims(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      verdict TEXT NOT NULL,          -- 'supported' | 'partial' | 'insufficient_evidence'
      detected_total REAL NOT NULL,
      claimed_quantity REAL,
      supporting_assets TEXT,         -- JSON array of asset ids + per-asset counts
      confidence TEXT,                -- short human-readable explanation
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      asset_id TEXT,
      action TEXT NOT NULL,           -- 'ingest' | 'verify' | 'report_generated'
      actor TEXT NOT NULL,            -- who/what performed the action
      payload_hash TEXT NOT NULL,     -- sha256 of the action's input+output
      prev_hash TEXT,                 -- hash of the previous receipt in this project's chain
      signature TEXT NOT NULL,        -- HMAC-SHA256(payload_hash + prev_hash, secret)
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_project ON receipts(project_id, created_at);
  `);

  return _db;
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function nowIso() {
  return new Date().toISOString();
}

// --- Users ---

export function createUser({ email, password_hash, password_salt }) {
  const db = getDb();
  const id = newId('user');
  db.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, email.toLowerCase().trim(), password_hash, password_salt, nowIso());
  return getUserById(id);
}

export function getUserByEmail(email) {
  const db = getDb();
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase().trim());
}

export function getUserById(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

export function toPublicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, created_at: user.created_at };
}

// --- Projects ---

export function createProject({ owner_id, name, description, location }) {
  const db = getDb();
  const id = newId('proj');
  db.prepare(
    `INSERT INTO projects (id, owner_id, name, description, location, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, owner_id, name, description || null, location || null, nowIso());
  return getProject(id);
}

export function listProjectsByOwner(ownerId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC`).all(ownerId);
}

export function getProject(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
}

// --- Assets ---

export function createAsset(asset) {
  const db = getDb();
  const id = newId('asset');
  db.prepare(
    `INSERT INTO assets
      (id, project_id, public_id, secure_url, resource_type, phase, pair_id, tags, detected_objects, geo, captured_at, uploaded_at)
     VALUES (@id, @project_id, @public_id, @secure_url, @resource_type, @phase, @pair_id, @tags, @detected_objects, @geo, @captured_at, @uploaded_at)`
  ).run({
    id,
    project_id: asset.project_id,
    public_id: asset.public_id,
    secure_url: asset.secure_url,
    resource_type: asset.resource_type || 'image',
    phase: asset.phase || 'unspecified',
    pair_id: asset.pair_id || null,
    tags: JSON.stringify(asset.tags || []),
    detected_objects: JSON.stringify(asset.detected_objects || []),
    geo: asset.geo ? JSON.stringify(asset.geo) : null,
    captured_at: asset.captured_at || null,
    uploaded_at: nowIso()
  });
  return getAsset(id);
}

export function getAsset(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM assets WHERE id = ?`).get(id);
}

export function listAssetsByProject(projectId) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM assets WHERE project_id = ? ORDER BY uploaded_at ASC`)
    .all(projectId);
}

// --- Claims + verifications ---

export function createClaim({ project_id, claim_text, parsed_quantity, parsed_subject }) {
  const db = getDb();
  const id = newId('claim');
  db.prepare(
    `INSERT INTO claims (id, project_id, claim_text, parsed_quantity, parsed_subject, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, project_id, claim_text, parsed_quantity ?? null, parsed_subject || null, nowIso());
  return db.prepare(`SELECT * FROM claims WHERE id = ?`).get(id);
}

export function createVerification(v) {
  const db = getDb();
  const id = newId('verif');
  db.prepare(
    `INSERT INTO verifications
      (id, claim_id, project_id, verdict, detected_total, claimed_quantity, supporting_assets, confidence, created_at)
     VALUES (@id, @claim_id, @project_id, @verdict, @detected_total, @claimed_quantity, @supporting_assets, @confidence, @created_at)`
  ).run({
    id,
    claim_id: v.claim_id,
    project_id: v.project_id,
    verdict: v.verdict,
    detected_total: v.detected_total,
    claimed_quantity: v.claimed_quantity ?? null,
    supporting_assets: JSON.stringify(v.supporting_assets || []),
    confidence: v.confidence || null,
    created_at: nowIso()
  });
  return db.prepare(`SELECT * FROM verifications WHERE id = ?`).get(id);
}

export function listVerificationsByProject(projectId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT v.*, c.claim_text FROM verifications v
       JOIN claims c ON c.id = v.claim_id
       WHERE v.project_id = ? ORDER BY v.created_at DESC`
    )
    .all(projectId);
}

// --- Receipts (see lib/receipts.js for signing logic) ---

export function insertReceipt(row) {
  const db = getDb();
  db.prepare(
    `INSERT INTO receipts (id, project_id, asset_id, action, actor, payload_hash, prev_hash, signature, created_at)
     VALUES (@id, @project_id, @asset_id, @action, @actor, @payload_hash, @prev_hash, @signature, @created_at)`
  ).run(row);
  return row;
}

export function lastReceiptForProject(projectId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM receipts WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`
    )
    .get(projectId);
}

export function listReceiptsByProject(projectId) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM receipts WHERE project_id = ? ORDER BY created_at ASC, rowid ASC`)
    .all(projectId);
}
