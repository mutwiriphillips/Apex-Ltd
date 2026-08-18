// src/routes/auth.js
const express = require('express');
const { pool } = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../auth');

const router = express.Router();

// Roles the public registration endpoint is allowed to create. staff_admin
// and superadmin are deliberately excluded — those are provisioned only via
// `npm run create-admin` (see scripts/create-admin.js), so privilege can
// never be self-granted through the API. `agent` is also excluded for now:
// agent accounts should be created by an admin once FIFA licence details
// are verified (see Business Plan, Section 4.4 and 9.2).
const PUBLIC_ROLES = ['player', 'guardian', 'scout', 'sponsor', 'club_admin'];

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const chosenRole = role && PUBLIC_ROLES.includes(role) ? role : 'player';

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [email.trim().toLowerCase(), passwordHash, chosenRole]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    const result = await pool.query(
      'SELECT id, email, role, password_hash, is_active FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const token = signToken(user);
    res.json({ user: { id: user.id, email: user.email, role: user.role }, token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
