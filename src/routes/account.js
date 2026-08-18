// src/routes/account.js
// Self-service routes for logged-in players and guardians to view and
// manage the profile(s) they own. Mounted at /api/account, behind
// requireAuth (see server.js) — every route here assumes req.user exists.
//
// Ownership model:
//   - An adult player's own account owns their players row directly
//     (players.user_id = req.user.sub).
//   - A guardian's account owns one or more players rows indirectly,
//     through guardians.user_id = req.user.sub (guardians.player_id links
//     to the specific child).
// Both are set up automatically by POST /api/players when the caller is
// logged in at the time of registration — see src/routes/players.js.

const express = require('express');
const { pool } = require('../db');
const { findOrCreateCounty, findOrCreateClub, findOrCreateDivision } = require('../helpers');

const router = express.Router();

async function findOwnedPlayer(playerId, user) {
  if (user.role === 'player') {
    const res = await pool.query(
      `SELECT p.id FROM players p WHERE p.id = $1 AND p.user_id = $2`,
      [playerId, user.sub]
    );
    return res.rows.length > 0;
  }
  if (user.role === 'guardian') {
    const res = await pool.query(
      `SELECT g.id FROM guardians g WHERE g.player_id = $1 AND g.user_id = $2`,
      [playerId, user.sub]
    );
    return res.rows.length > 0;
  }
  return false;
}

// GET /api/account/me — the logged-in user's account info plus whatever
// player profile(s) they own, so the frontend can render the right
// dashboard state in one call.
router.get('/me', async (req, res, next) => {
  try {
    const userRes = await pool.query(
      'SELECT id, email, role, created_at, last_login_at FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    const user = userRes.rows[0];

    if (user.role === 'player') {
      const playerRes = await pool.query(
        `SELECT p.id, p.full_name, p.date_of_birth, p.is_minor, p.primary_position,
                p.bio, p.verification_status, p.profile_visibility,
                s.name AS sport, c.name AS county, cl.name AS club, d.name AS division
         FROM players p
         JOIN sports s ON s.id = p.sport_id
         LEFT JOIN counties c ON c.id = p.county_id
         LEFT JOIN clubs cl ON cl.id = p.current_club_id
         LEFT JOIN divisions d ON d.id = p.current_division_id
         WHERE p.user_id = $1`,
        [req.user.sub]
      );
      return res.json({ user, player: playerRes.rows[0] || null });
    }

    if (user.role === 'guardian') {
      const playersRes = await pool.query(
        `SELECT p.id, p.full_name, p.date_of_birth, p.is_minor, p.primary_position,
                p.bio, p.verification_status, p.profile_visibility,
                s.name AS sport, c.name AS county, cl.name AS club, d.name AS division,
                EXISTS (
                  SELECT 1 FROM consents co
                  WHERE co.player_id = p.id AND co.consent_type = 'highlight_publication'
                    AND co.granted_by = 'guardian' AND co.revoked_at IS NULL
                ) AS public_consent_active
         FROM guardians g
         JOIN players p ON p.id = g.player_id
         JOIN sports s ON s.id = p.sport_id
         LEFT JOIN counties c ON c.id = p.county_id
         LEFT JOIN clubs cl ON cl.id = p.current_club_id
         LEFT JOIN divisions d ON d.id = p.current_division_id
         WHERE g.user_id = $1
         ORDER BY p.created_at DESC`,
        [req.user.sub]
      );
      return res.json({ user, players: playersRes.rows });
    }

    // scout/sponsor/club_admin/staff_admin/superadmin — no player-profile
    // concept for this account type.
    res.json({ user, player: null });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/account/players/:id — edit a profile the caller owns.
// Deliberately does NOT allow changing fullName, dateOfBirth, or sport
// through self-service — those go through admin/staff if they ever need
// correcting, to avoid a player quietly rewriting their own identity or
// age after verification.
router.patch('/players/:id', async (req, res, next) => {
  try {
    const owns = await findOwnedPlayer(req.params.id, req.user);
    if (!owns) {
      return res.status(403).json({ error: 'You do not have permission to edit this profile.' });
    }

    const { position, club, county, division, bio } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Need the player's sport to resolve club/division lookups correctly.
      const sportRes = await client.query('SELECT sport_id FROM players WHERE id = $1', [req.params.id]);
      const sportId = sportRes.rows[0].sport_id;

      const updates = [];
      const params = [];
      let idx = 1;

      if (position !== undefined) { updates.push(`primary_position = $${idx++}`); params.push(position.trim()); }
      if (bio !== undefined) { updates.push(`bio = $${idx++}`); params.push(bio.trim()); }
      if (county !== undefined) {
        const countyId = await findOrCreateCounty(client, county);
        updates.push(`county_id = $${idx++}`); params.push(countyId);
        if (club !== undefined) {
          const clubId = await findOrCreateClub(client, club, sportId, countyId);
          updates.push(`current_club_id = $${idx++}`); params.push(clubId);
        }
      } else if (club !== undefined) {
        const clubId = await findOrCreateClub(client, club, sportId, null);
        updates.push(`current_club_id = $${idx++}`); params.push(clubId);
      }
      if (division !== undefined) {
        const divisionId = await findOrCreateDivision(client, division, sportId);
        updates.push(`current_division_id = $${idx++}`); params.push(divisionId);
      }

      if (updates.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No editable fields provided.' });
      }

      params.push(req.params.id);
      const result = await client.query(
        `UPDATE players SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, full_name, bio`,
        params
      );
      await client.query('COMMIT');
      res.json({ player: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/account/players/:id/consent/revoke — guardian only. Removes
// the player from public visibility immediately (enforced by
// v_public_player_directory's WHERE clause, not just this endpoint).
router.post('/players/:id/consent/revoke', async (req, res, next) => {
  try {
    if (req.user.role !== 'guardian') {
      return res.status(403).json({ error: 'Only a guardian account can manage consent for a minor.' });
    }
    const owns = await findOwnedPlayer(req.params.id, req.user);
    if (!owns) {
      return res.status(403).json({ error: 'You do not have permission to manage this profile.' });
    }
    const result = await pool.query(
      `UPDATE consents SET revoked_at = now()
       WHERE player_id = $1 AND consent_type = 'highlight_publication' AND revoked_at IS NULL
       RETURNING id`,
      [req.params.id]
    );
    res.json({ revoked: result.rows.length > 0 });
  } catch (err) {
    next(err);
  }
});

// POST /api/account/players/:id/consent/restore — guardian re-grants
// public visibility consent after a previous revoke.
router.post('/players/:id/consent/restore', async (req, res, next) => {
  try {
    if (req.user.role !== 'guardian') {
      return res.status(403).json({ error: 'Only a guardian account can manage consent for a minor.' });
    }
    const owns = await findOwnedPlayer(req.params.id, req.user);
    if (!owns) {
      return res.status(403).json({ error: 'You do not have permission to manage this profile.' });
    }
    await pool.query(
      `INSERT INTO consents (player_id, consent_type, granted_by)
       VALUES ($1, 'highlight_publication', 'guardian')`,
      [req.params.id]
    );
    res.json({ restored: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
