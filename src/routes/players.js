// src/routes/players.js
const express = require('express');
const { pool } = require('../db');
const {
  getSportId, findOrCreateCounty, findOrCreateClub, findOrCreateDivision, HttpError,
} = require('../helpers');

const router = express.Router();

const VALID_SPORTS = ['Football', 'Rugby', 'Basketball', 'E-Football'];

// GET /api/players?sport=Football&q=kip&county=Nairobi
// Public directory read — always goes through the v_public_player_directory
// view, never the players table directly (see Database Design Document, 4.5).
router.get('/', async (req, res, next) => {
  try {
    const { sport, q, county } = req.query;
    const clauses = [];
    const params = [];

    if (sport && VALID_SPORTS.includes(sport)) {
      params.push(sport);
      clauses.push(`sport = $${params.length}`);
    }
    if (county) {
      params.push(`%${county}%`);
      clauses.push(`county ILIKE $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      clauses.push(`(full_name ILIKE $${idx} OR club ILIKE $${idx} OR county ILIKE $${idx})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT id, full_name, sport, primary_position, county, club, division,
              verification_status, bio, created_at
       FROM v_public_player_directory
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
      params
    );
    res.json({ players: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/players/:id — single profile (public-safe fields only)
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, sport, primary_position, county, club, division,
              verification_status, bio, created_at
       FROM v_public_player_directory
       WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found or not publicly visible.' });
    }
    res.json({ player: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/players — register a new player.
// If age < 18, guardianName/guardianRelationship/guardianContact and
// guardianConsent=true are required; a guardian record and two consent
// records (registration, highlight_publication) are created in the same
// transaction so a minor is never left half-registered.
router.post('/', async (req, res, next) => {
  const {
    fullName, dateOfBirth, sport, position, club, county, division, bio,
    guardianName, guardianRelationship, guardianContact, guardianConsent,
  } = req.body;

  if (!fullName || !dateOfBirth || !sport) {
    return res.status(400).json({ error: 'fullName, dateOfBirth, and sport are required.' });
  }
  if (!VALID_SPORTS.includes(sport)) {
    return res.status(400).json({ error: `sport must be one of ${VALID_SPORTS.join(', ')}.` });
  }

  const age = Math.floor(
    (Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000)
  );
  const isMinor = age < 18;

  if (isMinor && (!guardianName || !guardianConsent)) {
    return res.status(400).json({
      error: 'This player is under 18. guardianName and guardianConsent=true are required.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sportId = await getSportId(client, sport);
    const countyId = await findOrCreateCounty(client, county);
    const clubId = await findOrCreateClub(client, club, sportId, countyId);
    const divisionId = await findOrCreateDivision(client, division, sportId);

    const playerRes = await client.query(
      `INSERT INTO players
         (full_name, date_of_birth, sport_id, primary_position, county_id,
          current_club_id, current_division_id, bio, profile_visibility)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, 'public')
       RETURNING id, full_name, is_minor, verification_status, created_at`,
      [fullName.trim(), dateOfBirth, sportId, (position || '').trim(), countyId,
       clubId, divisionId, (bio || '').trim()]
    );
    const player = playerRes.rows[0];

    if (isMinor) {
      await client.query(
        `INSERT INTO guardians (player_id, full_name, relationship, phone)
         VALUES ($1,$2,$3,$4)`,
        [player.id, guardianName.trim(), (guardianRelationship || 'Parent/Guardian').trim(),
         (guardianContact || '').trim()]
      );
      await client.query(
        `INSERT INTO consents (player_id, consent_type, granted_by)
         VALUES ($1,'registration','guardian'), ($1,'highlight_publication','guardian')`,
        [player.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ player });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
