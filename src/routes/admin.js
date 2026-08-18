// src/routes/admin.js
// Every route in this file is protected by requireAuth + requireRole
// (mounted in server.js) — only staff_admin / superadmin accounts, created
// exclusively via `npm run create-admin`, can reach these endpoints.

const express = require('express');
const { pool } = require('../db');

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

module.exports = router;
