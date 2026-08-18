// src/db.js
// Single shared PostgreSQL connection pool, used by the migration runner
// and every route module. Render injects DATABASE_URL automatically when
// the web service is linked to a Render PostgreSQL instance (see render.yaml).

require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    'FATAL: DATABASE_URL is not set. On Render this is injected automatically ' +
    'when the web service is linked to a database in render.yaml. Locally, ' +
    'copy .env.example to .env and set it to your local Postgres connection string.'
  );
  process.exit(1);
}

// Render's managed Postgres requires SSL; local development typically does not.
const useSSL = process.env.PGSSL !== 'disable';

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = { pool };
