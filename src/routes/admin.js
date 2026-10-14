// src/routes/admin.js
// Every route in this file is protected by requireAuth + requireRole
// (mounted in server.js) — only staff_admin / superadmin accounts can reach
// these endpoints. Managing ADMIN accounts (creating, promoting, demoting,
// suspending, resetting) is further restricted to superadmin.

const express = require('express');
const { pool } = require('../db');
const { hashPassword } = require('../auth');

const router = express.Router();

// GET /api/admin/highlights/pending
router.get('/highlights/pending', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT h.id, h.title, h.description, h.video_url, h.created_at,
              p.id AS player_id, p.full_name AS player_name, p.is_minor
       FROM highlights h
       JOIN players p ON p.id = h.player_id
       WHERE h.moderation_status = 'pending'
       ORDER BY h.created_at ASC`
    );
    res.json({ highlights: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/highlights/:id/approve
router.post('/highlights/:id/approve', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE highlights
       SET moderation_status = 'approved', moderated_by = $2, moderated_at = now()
       WHERE id = $1
       RETURNING id, title, moderation_status`,
      [req.params.id, req.user.sub]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Highlight not found.' });
    }
    res.json({ highlight: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/highlights/:id/reject
router.post('/highlights/:id/reject', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE highlights
       SET moderation_status = 'rejected', moderated_by = $2, moderated_at = now()
       WHERE id = $1
       RETURNING id, title, moderation_status`,
      [req.params.id, req.user.sub]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Highlight not found.' });
    }
    res.json({ highlight: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/players/unverified
router.get('/players/unverified', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.full_name, s.name AS sport, p.county_id, c.name AS county,
              p.is_minor, p.created_at
       FROM players p
       JOIN sports s ON s.id = p.sport_id
       LEFT JOIN counties c ON c.id = p.county_id
       WHERE p.verification_status = 'unverified'
       ORDER BY p.created_at ASC
       LIMIT 200`
    );
    res.json({ players: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/players/:id/verify   body: { entityType: 'club' | 'federation', notes? }
router.post('/players/:id/verify', async (req, res, next) => {
  const { entityType, notes } = req.body;
  if (!['club', 'federation'].includes(entityType)) {
    return res.status(400).json({ error: "entityType must be 'club' or 'federation'." });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const newStatus = entityType === 'federation' ? 'federation_verified' : 'club_verified';
    const playerRes = await client.query(
      `UPDATE players SET verification_status = $2 WHERE id = $1
       RETURNING id, full_name, verification_status`,
      [req.params.id, newStatus]
    );
    if (playerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Player not found.' });
    }
    await client.query(
      `INSERT INTO verifications (player_id, verified_entity_type, verifier_user_id, verification_notes, status)
       VALUES ($1, $2, $3, $4, 'approved')`,
      [req.params.id, entityType, req.user.sub, (notes || '').trim()]
    );
    await client.query('COMMIT');
    res.json({ player: playerRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/admin/leads — sponsor/scout leads inbox
router.get('/leads', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, organization_name, lead_type, contact_email, message, status, created_at
       FROM sponsor_leads
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json({ leads: result.rows });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// SIGN-IN / ACCOUNT MANAGEMENT
// =====================================================================

const ALL_ROLES = ['player', 'guardian', 'scout', 'sponsor', 'club_admin', 'agent', 'staff_admin', 'superadmin'];
const ADMIN_ROLES = ['staff_admin', 'superadmin'];
const isAdminRole = (r) => ADMIN_ROLES.includes(r);

function badRequest(res, msg) { return res.status(400).json({ error: msg }); }

// Staff may manage non-admin accounts; touching an admin account (or
// granting an admin role) needs superadmin. Nobody may act on themselves
// for suspend / role change, so an admin can't lock themselves out.
function canManage(actor, target, newRole) {
  if (actor.role === 'superadmin') return true;
  if (isAdminRole(target.role)) return false;
  if (newRole && isAdminRole(newRole)) return false;
  return true;
}

async function activeSuperadminCountExcluding(client, id) {
  const r = await client.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'superadmin' AND is_active AND id <> $1", [id]);
  return r.rows[0].n;
}

// GET /api/admin/users?q=&role=&status=active|suspended
router.get('/users', async (req, res, next) => {
  try {
    const { q, role, status } = req.query;
    const clauses = [];
    const params = [];
    if (q) { params.push(`%${String(q).trim()}%`); clauses.push(`(email ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
    if (role && ALL_ROLES.includes(role)) { params.push(role); clauses.push(`role = $${params.length}`); }
    if (status === 'active') clauses.push('is_active');
    if (status === 'suspended') clauses.push('NOT is_active');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [list, summary] = await Promise.all([
      pool.query(
        `SELECT id, email, phone, role, is_active, is_email_verified, last_login_at, created_at
         FROM users ${where} ORDER BY created_at DESC LIMIT 200`, params),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE is_active)::int AS active,
                COUNT(*) FILTER (WHERE NOT is_active)::int AS suspended,
                COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_7d
         FROM users`),
    ]);
    res.json({ users: list.rows, summary: summary.rows[0], you: req.user.sub });
  } catch (err) { next(err); }
});

// POST /api/admin/users — superadmin creates an account (any role, incl. admins)
router.post('/users', async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only a superadmin can create accounts from the admin panel.' });
    }
    const { email, password, role } = req.body;
    if (!email || !password) return badRequest(res, 'email and password are required.');
    if (String(password).length < 8) return badRequest(res, 'Password must be at least 8 characters.');
    if (!ALL_ROLES.includes(role)) return badRequest(res, 'Choose a valid role.');
    const clean = String(email).trim().toLowerCase();
    const dup = await pool.query('SELECT 1 FROM users WHERE email = $1', [clean]);
    if (dup.rows.length) return res.status(409).json({ error: 'An account with that email already exists.' });
    const hash = await hashPassword(password);
    const r = await pool.query(
      `INSERT INTO users (email, password_hash, role, is_email_verified)
       VALUES ($1, $2, $3, true) RETURNING id, email, role, is_active, created_at`,
      [clean, hash, role]);
    console.log(`[admin-audit] ${req.user.email} created ${role} account ${clean}`);
    res.status(201).json({ user: r.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id   body: { is_active?: boolean, role?: string }
router.patch('/users/:id', async (req, res, next) => {
  const { is_active, role } = req.body;
  if (is_active === undefined && role === undefined) return badRequest(res, 'Nothing to update.');
  if (role !== undefined && !ALL_ROLES.includes(role)) return badRequest(res, 'Invalid role.');
  if (is_active !== undefined && typeof is_active !== 'boolean') return badRequest(res, 'is_active must be true or false.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query('SELECT id, email, role, is_active FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!t.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'User not found.' }); }
    const target = t.rows[0];
    if (target.id === req.user.sub) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "You can't suspend or change the role of your own account." });
    }
    if (!canManage(req.user, target, role)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only a superadmin can manage admin accounts or grant admin roles.' });
    }
    const losingSuper = target.role === 'superadmin' &&
      ((role !== undefined && role !== 'superadmin') || is_active === false);
    if (losingSuper && (await activeSuperadminCountExcluding(client, target.id)) === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That would leave no active superadmin. Promote another one first.' });
    }
    const r = await client.query(
      `UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active)
       WHERE id = $1 RETURNING id, email, role, is_active`,
      [target.id, role ?? null, is_active ?? null]);
    await client.query('COMMIT');
    console.log(`[admin-audit] ${req.user.email} updated ${target.email}: ` +
      `${role !== undefined ? `role ${target.role}->${role} ` : ''}${is_active !== undefined ? `active ${target.is_active}->${is_active}` : ''}`);
    res.json({ user: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

// POST /api/admin/users/:id/reset-password   body: { password }
router.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || String(password).length < 8) return badRequest(res, 'Password must be at least 8 characters.');
    const t = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [req.params.id]);
    if (!t.rows.length) return res.status(404).json({ error: 'User not found.' });
    const target = t.rows[0];
    if (target.id !== req.user.sub && !canManage(req.user, target)) {
      return res.status(403).json({ error: 'Only a superadmin can reset an admin password.' });
    }
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [target.id, await hashPassword(password)]);
    console.log(`[admin-audit] ${req.user.email} reset password for ${target.email}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
