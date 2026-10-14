// src/routes/stats.js
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/stats/summary — powers the homepage "live scoreboard" panel.
router.get('/summary', async (req, res, next) => {
  try {
    const [players, highlights, counties, sports] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM players'),
      pool.query("SELECT COUNT(*)::int AS count FROM highlights WHERE moderation_status = 'approved'"),
      pool.query('SELECT COUNT(DISTINCT county_id)::int AS count FROM players WHERE county_id IS NOT NULL'),
      pool.query('SELECT COUNT(*)::int AS count FROM sports'),
    ]);
    res.json({
      players: players.rows[0].count,
      highlights: highlights.rows[0].count,
      counties: counties.rows[0].count,
      sports: sports.rows[0].count,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/featured — verified public athletes for the homepage
// spotlight. Real rows only; returns an empty list until players have been
// club- or federation-verified.
router.get('/featured', async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT id, full_name, sport, primary_position, county, club, division,
              verification_status, bio
       FROM v_public_player_directory
       WHERE verification_status <> 'unverified'
       ORDER BY (verification_status = 'federation_verified') DESC, created_at DESC
       LIMIT 8`
    );
    res.json({ players: r.rows });
  } catch (err) { next(err); }
});

// GET /api/stats/managed — athletes under an active management contract
// (public-safe fields only, via the directory view). Empty until real
// contracts exist in managed_athletes.
router.get('/managed', async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT d.id, d.full_name, d.sport, d.primary_position, d.county, d.club, d.bio, m.signed_at
       FROM managed_athletes m
       JOIN v_public_player_directory d ON d.id = m.player_id
       WHERE m.status = 'active'
       ORDER BY m.signed_at DESC
       LIMIT 12`
    );
    res.json({ players: r.rows });
  } catch (err) { next(err); }
});

module.exports = router;
