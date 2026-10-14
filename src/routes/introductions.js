// src/routes/introductions.js
// POST /api/introductions — a scout, club or sponsor asks Josriri to introduce
// them to a publicly listed athlete. The requester never receives the
// athlete's contact details. Staff vet the request (admin panel); if approved
// it is shown to the athlete (or guardian), who decides whether to reply.
// Mounted at /api/introductions behind the POST write limiter.

const express = require('express');
const { pool } = require('../db');
const { notifyAdmin } = require('../mailer');
const { escapeHtml, EMAIL_RE, PHONE_RE } = require('../media');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    // Honeypot: real people never fill this hidden field. Pretend success.
    if (b.website) return res.status(201).json({ ok: true });

    const playerId = clean(b.playerId, 40);
    const name = clean(b.name, 100);
    const organisation = clean(b.organisation, 120);
    const email = clean(b.email, 254).toLowerCase();
    const phone = clean(b.phone, 30);
    const message = clean(b.message, 600);

    const errors = {};
    if (!UUID_RE.test(playerId)) errors.playerId = 'Choose an athlete from the directory.';
    if (name.length < 2) errors.name = 'Enter your name.';
    if (organisation.length < 2) errors.organisation = 'Enter your club, agency or organisation.';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    if (phone && !PHONE_RE.test(phone)) errors.phone = 'Enter a valid phone number or leave it blank.';
    if (message.length < 20) errors.message = 'Tell us a little about why you want to connect (at least 20 characters).';
    if (b.agree !== true) errors.agree = 'Please confirm that your details may be shared with the athlete or guardian.';
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });
    }

    // Only athletes visible in the public directory can be requested.
    const p = await pool.query('SELECT id, full_name FROM v_public_player_directory WHERE id = $1', [playerId]);
    if (!p.rows.length) {
      return res.status(404).json({ error: 'That athlete is not publicly listed.' });
    }

    // Light anti-spam: at most 3 open requests per email per athlete.
    const dup = await pool.query(
      `SELECT COUNT(*)::int AS n FROM introduction_requests
       WHERE player_id = $1 AND requester_email = $2 AND status = 'pending'`,
      [playerId, email]
    );
    if (dup.rows[0].n >= 3) {
      return res.status(429).json({ error: 'You already have open requests for this athlete. We will be in touch.' });
    }

    await pool.query(
      `INSERT INTO introduction_requests
         (player_id, requester_name, organisation, requester_email, requester_phone, message)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [playerId, name, organisation, email, phone || null, message]
    );

    notifyAdmin(`New introduction request for ${p.rows[0].full_name}`, [
      `<strong>${escapeHtml(name)}</strong> (${escapeHtml(organisation)}) asked to be introduced to <strong>${escapeHtml(p.rows[0].full_name)}</strong>.`,
      'Review it in the admin panel under Introductions. Athlete contact details were not shared.',
    ]);

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
