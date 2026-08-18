#!/usr/bin/env node
// scripts/create-admin.js
// Creates a staff_admin account directly in the database. This is the ONLY
// way to create an admin account — the public /api/auth/register endpoint
// deliberately refuses to create staff_admin/superadmin users, so privilege
// can never be granted through the API itself.
//
// Usage (local):
//   npm run create-admin -- admin@apextalent.co.ke "a-strong-password"
//
// Usage (on Render):
//   Open your web service in the Render dashboard → Shell tab → run:
//   node scripts/create-admin.js admin@apextalent.co.ke "a-strong-password"

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function main() {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.js <email> <password>');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  try {
    const existing = await pool.query('SELECT id, role FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      console.error(`A user with email ${email} already exists (role: ${existing.rows[0].role}).`);
      console.error('To promote an existing user to staff_admin, update it directly in the database.');
      process.exitCode = 1;
      return;
    }

    const passwordHash = await bcrypt.hash(password, 11);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, is_email_verified)
       VALUES ($1, $2, 'staff_admin', true)
       RETURNING id, email, role, created_at`,
      [email.trim().toLowerCase(), passwordHash]
    );
    console.log('Admin account created:');
    console.log(result.rows[0]);
    console.log('\nLog in at /admin.html with this email and password.');
  } catch (err) {
    console.error('Failed to create admin account:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
