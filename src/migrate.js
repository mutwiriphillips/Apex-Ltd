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

async function alreadyApplied(client) {
  const res = await client.query(`SELECT to_regclass('public.players') AS exists`);
  return res.rows[0].exists !== null;
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('[migrate] Checking schema state...');
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
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
