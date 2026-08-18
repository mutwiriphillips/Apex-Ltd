// src/migrate.js
// Idempotent migration runner. Runs once on every deploy (via `npm start`,
// see package.json) and is safe to run repeatedly: it checks whether the
// schema has already been applied before doing anything.
//
// This intentionally does NOT use a full migration framework (Flyway,
// Sqitch, etc.) to keep the initial deployable footprint small. Before this
// project outgrows a single schema file, replace this with a proper
// migration tool — see the Database Design Document, Section 7.

const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MAX_CONNECT_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

async function alreadyApplied(client) {
  const res = await client.query(`SELECT to_regclass('public.players') AS exists`);
  return res.rows[0].exists !== null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printRegionMismatchHelp(hostname) {
  console.error('');
  console.error('[migrate] ─────────────────────────────────────────────────────────────');
  console.error(`[migrate] Could not resolve database host "${hostname}".`);
  console.error('[migrate] This is almost always a REGION MISMATCH between your web');
  console.error('[migrate] service and database. Render internal hostnames (dpg-...)');
  console.error('[migrate] only resolve to services in the SAME region — and Render');
  console.error('[migrate] does not support changing a resource\'s region after it is');
  console.error('[migrate] created (docs.render.com/regions). Updating render.yaml alone');
  console.error('[migrate] will NOT fix an already-created service or database.');
  console.error('[migrate]');
  console.error('[migrate] Fix option A (fastest, no deletion): in the Render dashboard,');
  console.error('[migrate] open your database → Connections tab → copy the "External');
  console.error('[migrate] Database URL" → set it as your web service\'s DATABASE_URL');
  console.error('[migrate] env var (overriding the auto-injected internal one) → redeploy.');
  console.error('[migrate]');
  console.error('[migrate] Fix option B (proper long-term fix): delete BOTH the existing');
  console.error('[migrate] web service and database in the Render dashboard, then run');
  console.error('[migrate] New → Blueprint again from your repo so both are created');
  console.error('[migrate] together, fresh, in the same region.');
  console.error('[migrate] See README.md → Troubleshooting for full steps.');
  console.error('[migrate] ─────────────────────────────────────────────────────────────');
  console.error('');
}

// Retry connecting a few times before giving up. This covers only the case
// where a database was just provisioned moments ago and its DNS hasn't
// finished propagating yet. It will NOT help a genuine region mismatch —
// that hostname simply never resolves, retries or not — so we cap retries
// low and print explicit remediation steps once they're exhausted.
async function connectWithRetry() {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      const client = await pool.connect();
      return client;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[migrate] Database connection attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed ` +
        `(${err.code || err.message}). Retrying in ${RETRY_DELAY_MS / 1000}s...`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

async function run() {
  let client;
  try {
    client = await connectWithRetry();
    console.log('[migrate] Connected. Checking schema state...');
    if (await alreadyApplied(client)) {
      console.log('[migrate] Schema already present — skipping migration.');
      return;
    }

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.warn('[migrate] No migration files found in /migrations.');
      return;
    }

    for (const file of files) {
      const full = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(full, 'utf8');
      console.log(`[migrate] Applying ${file}...`);
      await client.query(sql);
      console.log(`[migrate] Applied ${file}.`);
    }

    console.log('[migrate] Migration complete.');
  } catch (err) {
    console.error('[migrate] Migration failed:', err.message);
    if (err.code === 'ENOTFOUND') {
      printRegionMismatchHelp(err.hostname || 'unknown host');
    }
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

run();
