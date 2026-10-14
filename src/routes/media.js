// src/routes/media.js
// Public read endpoints for approved uploaded media. Mounted at /api/media.
//
// Visibility rules (enforced here AND by the directory view):
//   - photo: moderation_status = 'approved' AND the player is present in
//     v_public_player_directory (so a minor whose guardian revokes consent,
//     or a private profile, stops being served immediately).
//   - video: the highlight is 'approved', source = 'upload', and its player
//     is in the same view.
// Cache lifetimes are short so a revocation takes effect within a minute.

const express = require('express');
const { pool } = require('../db');
const { sendVideo } = require('../media');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/photo/:playerId', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.playerId)) return res.status(404).end();
    const r = await pool.query(
      `SELECT ph.content_type, ph.data
       FROM player_photos ph
       JOIN v_public_player_directory d ON d.id = ph.player_id
       WHERE ph.player_id = $1 AND ph.moderation_status = 'approved'`,
      [req.params.playerId]
    );
    if (!r.rows.length) return res.status(404).end();
    res.set({
      'Content-Type': r.rows[0].content_type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=60',
      'Content-Disposition': 'inline',
    });
    res.end(r.rows[0].data);
  } catch (err) { next(err); }
});

router.get('/video/:highlightId', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.highlightId)) return res.status(404).end();
    const meta = await pool.query(
      `SELECT v.content_type, v.byte_size
       FROM highlight_videos v
       JOIN highlights h ON h.id = v.highlight_id
       JOIN v_public_player_directory d ON d.id = h.player_id
       WHERE v.highlight_id = $1 AND h.moderation_status = 'approved' AND h.source = 'upload'`,
      [req.params.highlightId]
    );
    if (!meta.rows.length) return res.status(404).end();
    const { content_type: contentType, byte_size: size } = meta.rows[0];
    await sendVideo(req, res, {
      contentType, size, cacheControl: 'public, max-age=60',
      fetchSlice: async (start, end) => {
        const s = await pool.query(
          'SELECT substring(data FROM $2::int FOR $3::int) AS chunk FROM highlight_videos WHERE highlight_id = $1',
          [req.params.highlightId, start + 1, end - start + 1]
        );
        return s.rows[0].chunk;
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
