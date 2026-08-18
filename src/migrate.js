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
const MAX_CONNECT_ATTEMPTS = 8;
const RETRY_DELAY_MS = 4000;

async function alreadyApplied(client) {
  const res = await client.query(`SELECT to_regclass('public.players') AS exists`);
  return res.rows[0].exists !== null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry connecting a few times before giving up. This covers the case where
// a database was just provisioned (e.g. the very first Blueprint deploy) and
// its internal DNS hostname hasn't finished propagating yet, which otherwise
// surfaces as a transient ENOTFOUND/ECONNREFUSED on the first deploy only.
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
    console.error(
      '[migrate] If this is ENOTFOUND on a dpg-... hostname, check that the ' +
      'web service and database are in the SAME Render region (see render.yaml).'
    );
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

run();
