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

module.exports = router;
