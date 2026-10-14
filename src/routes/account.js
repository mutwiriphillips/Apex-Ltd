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
const {
  MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, MAX_UPLOADED_VIDEOS_PER_PLAYER,
  sniffImage, sniffVideo, EMAIL_RE, PHONE_RE,
} = require('../media');
const { notifyAdmin } = require('../mailer');
const { escapeHtml } = require('../media');

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


// =====================================================================
// MEDIA (photo + direct video), PRIVATE CONTACT, INTRODUCTIONS
// All of these require ownership of the profile (player account for adults,
// guardian account for minors). Uploads are held as 'pending' until staff
// approve them, and are only ever served publicly while the player is in
// v_public_player_directory (see src/routes/media.js).
// =====================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rawPhoto = express.raw({ type: () => true, limit: MAX_PHOTO_BYTES });
const rawVideo = express.raw({ type: () => true, limit: MAX_VIDEO_BYTES });

async function requireOwner(req, res, next) {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Profile not found.' });
  try {
    if (!(await findOwnedPlayer(req.params.id, req.user))) {
      return res.status(403).json({ error: 'You do not have permission to manage this profile.' });
    }
    next();
  } catch (err) { next(err); }
}

async function playerName(id) {
  const r = await pool.query('SELECT full_name, is_minor FROM players WHERE id = $1', [id]);
  return r.rows[0] || { full_name: 'a player', is_minor: false };
}

// GET /api/account/players/:id/media — everything the owner manages in one call.
router.get('/players/:id/media', requireOwner, async (req, res, next) => {
  try {
    const id = req.params.id;
    const [photo, videos, contact, intros] = await Promise.all([
      pool.query(
        `SELECT moderation_status, byte_size, created_at FROM player_photos WHERE player_id = $1`, [id]),
      pool.query(
        `SELECT h.id, h.title, h.source, h.video_url, h.moderation_status, h.created_at, v.byte_size
         FROM highlights h LEFT JOIN highlight_videos v ON v.highlight_id = h.id
         WHERE h.player_id = $1 ORDER BY h.created_at DESC`, [id]),
      pool.query(`SELECT email, phone FROM player_contacts WHERE player_id = $1`, [id]),
      // Pending requests are held back until staff vet them; declined ones are never shown.
      pool.query(
        `SELECT id, requester_name, organisation, requester_email, requester_phone, message,
                owner_decision, created_at
         FROM introduction_requests
         WHERE player_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 50`, [id]),
    ]);
    res.json({
      photo: photo.rows[0] || null,
      videos: videos.rows,
      contact: contact.rows[0] || { email: '', phone: '' },
      introductions: intros.rows,
      limits: { photoMb: MAX_PHOTO_BYTES / 1048576, videoMb: MAX_VIDEO_BYTES / 1048576 },
    });
  } catch (err) { next(err); }
});

// POST /api/account/players/:id/photo — raw image bytes (JPEG, PNG or WebP).
router.post('/players/:id/photo', requireOwner, rawPhoto, async (req, res, next) => {
  try {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: 'No image received.' });
    }
    const type = sniffImage(buf);
    if (!type) return res.status(415).json({ error: 'Please upload a JPEG, PNG or WebP image.' });
    await pool.query(
      `INSERT INTO player_photos (player_id, content_type, data, byte_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (player_id) DO UPDATE SET
         content_type = EXCLUDED.content_type, data = EXCLUDED.data, byte_size = EXCLUDED.byte_size,
         uploaded_by = EXCLUDED.uploaded_by, moderation_status = 'pending',
         moderated_by = NULL, moderated_at = NULL, created_at = now()`,
      [req.params.id, type, buf, buf.length, req.user.sub]
    );
    const pl = await playerName(req.params.id);
    notifyAdmin(`Photo awaiting review: ${pl.full_name}`, [
      `A profile photo for <strong>${escapeHtml(pl.full_name)}</strong>${pl.is_minor ? ' (minor)' : ''} is waiting in the admin panel under Photos.`,
    ]);
    res.status(201).json({ status: 'pending' });
  } catch (err) { next(err); }
});

// DELETE /api/account/players/:id/photo
router.delete('/players/:id/photo', requireOwner, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM player_photos WHERE player_id = $1', [req.params.id]);
    res.json({ removed: true });
  } catch (err) { next(err); }
});

// POST /api/account/players/:id/videos?title=...&description=... — raw video bytes.
router.post('/players/:id/videos', requireOwner, rawVideo, async (req, res, next) => {
  const title = String(req.query.title || '').trim().slice(0, 120);
  const description = String(req.query.description || '').trim().slice(0, 300);
  if (title.length < 2) return res.status(400).json({ error: 'Give the clip a title.' });
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return res.status(400).json({ error: 'No video received.' });
  }
  const type = sniffVideo(buf);
  if (!type) return res.status(415).json({ error: 'Please upload an MP4, MOV or WebM video.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cnt = await client.query(
      `SELECT COUNT(*)::int AS n FROM highlights WHERE player_id = $1 AND source = 'upload'`, [req.params.id]);
    if (cnt.rows[0].n >= MAX_UPLOADED_VIDEOS_PER_PLAYER) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `You can keep up to ${MAX_UPLOADED_VIDEOS_PER_PLAYER} uploaded clips. Remove one first.` });
    }
    const h = await client.query(
      `INSERT INTO highlights (player_id, title, description, video_url, source, uploaded_by, moderation_status)
       VALUES ($1,$2,$3,'', 'upload', $4, 'pending') RETURNING id`,
      [req.params.id, title, description, req.user.sub]);
    const hid = h.rows[0].id;
    await client.query('UPDATE highlights SET video_url = $2 WHERE id = $1', [hid, `/api/media/video/${hid}`]);
    await client.query(
      `INSERT INTO highlight_videos (highlight_id, content_type, data, byte_size) VALUES ($1,$2,$3,$4)`,
      [hid, type, buf, buf.length]);
    await client.query('COMMIT');
    const pl = await playerName(req.params.id);
    notifyAdmin(`Video awaiting review: ${pl.full_name}`, [
      `An uploaded clip "${escapeHtml(title)}" for <strong>${escapeHtml(pl.full_name)}</strong>${pl.is_minor ? ' (minor)' : ''} is waiting in the admin panel under Highlights.`,
    ]);
    res.status(201).json({ id: hid, status: 'pending' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

// DELETE /api/account/players/:id/videos/:highlightId — remove one of the owner's clips.
router.delete('/players/:id/videos/:hid', requireOwner, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.hid)) return res.status(404).json({ error: 'Clip not found.' });
    const r = await pool.query('DELETE FROM highlights WHERE id = $1 AND player_id = $2 RETURNING id',
      [req.params.hid, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Clip not found.' });
    res.json({ removed: true });
  } catch (err) { next(err); }
});

// PUT /api/account/players/:id/contact — private contact details (never public).
router.put('/players/:id/contact', requireOwner, async (req, res, next) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase().slice(0, 254);
    const phone = String((req.body || {}).phone || '').trim().slice(0, 30);
    if (!email && !phone) return res.status(400).json({ error: 'Add an email address or a phone number.' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
    await pool.query(
      `INSERT INTO player_contacts (player_id, email, phone, updated_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (player_id) DO UPDATE SET email = EXCLUDED.email, phone = EXCLUDED.phone,
         updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [req.params.id, email || null, phone || null, req.user.sub]);
    res.json({ saved: true });
  } catch (err) { next(err); }
});

// POST /api/account/players/:id/introductions/:rid/decision  body: { decision: 'accepted' | 'declined' }
router.post('/players/:id/introductions/:rid/decision', requireOwner, async (req, res, next) => {
  try {
    const decision = (req.body || {}).decision;
    if (!['accepted', 'declined'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'accepted' or 'declined'." });
    }
    if (!UUID_RE.test(req.params.rid)) return res.status(404).json({ error: 'Request not found.' });
    const r = await pool.query(
      `UPDATE introduction_requests SET owner_decision = $3, owner_decided_at = now()
       WHERE id = $1 AND player_id = $2 AND status = 'approved' RETURNING id`,
      [req.params.rid, req.params.id, decision]);
    if (!r.rows.length) return res.status(404).json({ error: 'Request not found.' });
    res.json({ decision });
  } catch (err) { next(err); }
});

// GET /api/account/players/:id/photo — owner preview of their own photo in any
// moderation state (the public endpoint only serves approved photos).
router.get('/players/:id/photo', requireOwner, async (req, res, next) => {
  try {
    const r = await pool.query('SELECT content_type, data FROM player_photos WHERE player_id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).end();
    res.set({ 'Content-Type': r.rows[0].content_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.end(r.rows[0].data);
  } catch (err) { next(err); }
});

// GET /api/account/players/:id/videos/:hid/file — owner preview of an uploaded clip.
router.get('/players/:id/videos/:hid/file', requireOwner, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.hid)) return res.status(404).end();
    const r = await pool.query(
      `SELECT v.content_type, v.data FROM highlight_videos v JOIN highlights h ON h.id = v.highlight_id
       WHERE v.highlight_id = $1 AND h.player_id = $2`, [req.params.hid, req.params.id]);
    if (!r.rows.length) return res.status(404).end();
    res.set({ 'Content-Type': r.rows[0].content_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.end(r.rows[0].data);
  } catch (err) { next(err); }
});

module.exports = router;
