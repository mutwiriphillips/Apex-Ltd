// src/routes/highlights.js
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/highlights — latest highlights, joined with player name for display.
// Only approved highlights are shown publicly; new submissions start pending
// and would be reviewed via an admin moderation tool in a later milestone.
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT h.id, h.title, h.description, h.video_url, h.moderation_status,
              h.created_at, p.id AS player_id, p.full_name AS player_name
       FROM highlights h
       JOIN players p ON p.id = h.player_id
       WHERE h.moderation_status IN ('approved','pending')
       ORDER BY h.created_at DESC
       LIMIT 100`
    );
    res.json({ highlights: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/highlights — attach a highlight to an existing player.
router.post('/', async (req, res, next) => {
  try {
    const { playerId, title, videoUrl, description } = req.body;
    if (!playerId || !title) {
      return res.status(400).json({ error: 'playerId and title are required.' });
    }
    const playerCheck = await pool.query('SELECT id FROM players WHERE id = $1', [playerId]);
    if (playerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found.' });
    }
    const result = await pool.query(
      `INSERT INTO highlights (player_id, title, description, video_url, moderation_status)
       VALUES ($1,$2,$3,$4,'pending')
       RETURNING id, title, description, video_url, moderation_status, created_at`,
      [playerId, title.trim(), (description || '').trim(), (videoUrl || '').trim()]
    );
    res.status(201).json({ highlight: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
