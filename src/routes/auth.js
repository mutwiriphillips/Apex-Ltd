// src/routes/auth.js
const express = require('express');
const { pool } = require('../db');
const crypto = require('crypto');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('../auth');
const { notifyAdmin, sendMail } = require('../mailer');
const { EMAIL_RE } = require('../media');

const router = express.Router();

// Roles the public registration endpoint is allowed to create. staff_admin
// and superadmin are deliberately excluded — those are provisioned only via
// `npm run create-admin` (see scripts/create-admin.js), so privilege can
// never be self-granted through the API. `agent` is also excluded for now:
// agent accounts should be created by an admin once FIFA licence details
// are verified (see Business Plan, Section 4.4 and 9.2).
const PUBLIC_ROLES = ['player', 'guardian', 'scout', 'sponsor', 'club_admin'];

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const chosenRole = role && PUBLIC_ROLES.includes(role) ? role : 'player';

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [email.trim().toLowerCase(), passwordHash, chosenRole]
    );
    const user = result.rows[0];
    const token = signToken(user);

    // Best-effort admin notification — never blocks or fails the response.
    notifyAdmin(`New account sign-up: ${user.email}`, [
      `A new <strong>${user.role}</strong> account was created on Josriri Sports Management.`,
      `Email: ${user.email}`,
      `Created: ${new Date(user.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`,
    ]);

    // Best-effort verification email — registration never waits on or fails because of it.
    issueToken(user.id, 'email_verify', req).then((link) => sendMail({
      to: user.email, subject: 'Confirm your email — Josriri Sports Management',
      lines: ['Welcome to Josriri Sports Management.', 'Confirm your email address using this link (valid for 24 hours):', link, 'If you did not create this account you can ignore this email.'],
    })).catch((e) => console.error('[auth] verification email failed:', e.message));

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    const result = await pool.query(
      'SELECT id, email, role, password_hash, is_active, is_email_verified FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const token = signToken(user);
    res.json({ user: { id: user.id, email: user.email, role: user.role, is_email_verified: user.is_email_verified }, token });
  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------
// Password reset + email verification
// ---------------------------------------------------------------------
const TOKEN_TTL_HOURS = { password_reset: 1, email_verify: 24 };
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

// Links must never be built from the request's Host header in production
// (host-header poisoning would let an attacker point reset links at their own
// domain). Use APP_URL, or Render's RENDER_EXTERNAL_URL; only fall back to the
// request host outside production.
function baseUrl(req) {
  const configured = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') return null;
  return `${req.protocol}://${req.get('host')}`;
}

// Creates a single-use token (replacing earlier unused ones of the same kind)
// and returns the link to email, or null when no safe base URL is available.
async function issueToken(userId, kind, req) {
  const base = baseUrl(req);
  if (!base) { console.error('[auth] APP_URL is not set; cannot build an email link in production.'); return null; }
  const raw = crypto.randomBytes(32).toString('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL', [userId, kind]);
    await client.query(
      `INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
      [userId, kind, sha256(raw), String(TOKEN_TTL_HOURS[kind])]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  const page = kind === 'password_reset' ? 'reset-password.html' : 'verify-email.html';
  // The token rides in the URL fragment, so it is never sent to the server in a
  // GET request, never lands in access logs and is not leaked through Referer.
  return `${base}/${page}#token=${raw}`;
}

// Atomically consumes a valid token of `kind`; returns the user id or null.
async function consumeToken(client, raw, kind) {
  if (typeof raw !== 'string' || !/^[0-9a-f]{64}$/.test(raw)) return null;
  const r = await client.query(
    `UPDATE auth_tokens SET used_at = now()
     WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`, [sha256(raw), kind]);
  return r.rows.length ? r.rows[0].user_id : null;
}

// POST /api/auth/forgot-password  { email }
// Always answers the same way so it cannot be used to discover which emails
// have accounts. At most 3 reset emails per account per hour.
router.post('/forgot-password', async (req, res, next) => {
  const generic = { ok: true, message: 'If an account exists for that email, a reset link is on its way.' };
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.json(generic);
    const u = await pool.query('SELECT id, email FROM users WHERE email = $1 AND is_active', [email]);
    if (u.rows.length) {
      const recent = await pool.query(
        `SELECT COUNT(*)::int AS n FROM auth_tokens
         WHERE user_id = $1 AND kind = 'password_reset' AND created_at > now() - interval '1 hour'`, [u.rows[0].id]);
      if (recent.rows[0].n < 3) {
        const link = await issueToken(u.rows[0].id, 'password_reset', req);
        if (link) {
          sendMail({
            to: u.rows[0].email, subject: 'Reset your password — Josriri Sports Management',
            lines: ['We received a request to reset your password.', 'Use this link within 1 hour:', link,
              'If you did not ask for this, ignore this email. Your password will not change.'],
          });
        }
      }
    }
    res.json(generic);
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password  { token, password }
router.post('/reset-password', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { token, password } = req.body || {};
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (password.length > 200) return res.status(400).json({ error: 'Password is too long.' });
    const hash = await hashPassword(password);
    await client.query('BEGIN');
    const userId = await consumeToken(client, token, 'password_reset');
    if (!userId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    }
    // Proving control of the inbox also verifies the email address.
    await client.query(
      'UPDATE users SET password_hash = $2, password_changed_at = now(), is_email_verified = true WHERE id = $1', [userId, hash]);
    await client.query("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

// POST /api/auth/send-verification  (signed in) — resend the confirmation email.
router.post('/send-verification', requireAuth, async (req, res, next) => {
  try {
    const u = await pool.query('SELECT id, email, is_email_verified FROM users WHERE id = $1', [req.user.sub]);
    const user = u.rows[0];
    if (!user || !user.email) return res.status(400).json({ error: 'This account has no email address.' });
    if (user.is_email_verified) return res.json({ ok: true, alreadyVerified: true });
    const recent = await pool.query(
      `SELECT COUNT(*)::int AS n FROM auth_tokens
       WHERE user_id = $1 AND kind = 'email_verify' AND created_at > now() - interval '1 hour'`, [user.id]);
    if (recent.rows[0].n >= 3) return res.status(429).json({ error: 'Too many emails requested. Please try again in an hour.' });
    const link = await issueToken(user.id, 'email_verify', req);
    if (!link) return res.status(503).json({ error: 'Email is not configured on this server yet.' });
    const sent = await sendMail({
      to: user.email, subject: 'Confirm your email — Josriri Sports Management',
      lines: ['Confirm your email address using this link (valid for 24 hours):', link, 'If you did not ask for this you can ignore it.'],
    });
    res.json({ ok: true, sent });
  } catch (err) { next(err); }
});

// POST /api/auth/verify-email  { token }
router.post('/verify-email', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = await consumeToken(client, (req.body || {}).token, 'email_verify');
    if (!userId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This confirmation link is invalid or has expired. Sign in and request a new one.' });
    }
    await client.query('UPDATE users SET is_email_verified = true WHERE id = $1', [userId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

// POST /api/auth/change-password  { currentPassword, newPassword }  (signed in)
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const u = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.sub]);
    if (!u.rows.length || !(await verifyPassword(String(currentPassword || ''), u.rows[0].password_hash))) {
      return res.status(403).json({ error: 'Your current password is incorrect.' });
    }
    await pool.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1',
      [req.user.sub, await hashPassword(newPassword)]);
    // Hand back a fresh token so this device stays signed in while all others are signed out
    // (requireAuth's 1 s tolerance covers the token's whole-second iat).
    const fresh = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [req.user.sub]);
    res.json({ ok: true, token: signToken(fresh.rows[0]) });
  } catch (err) { next(err); }
});

// POST /api/auth/bootstrap-admin — creates the FIRST superadmin account
// without needing shell/SSH access, which Render's free-tier web services
// don't support (confirmed against Render's own docs: free web services
// don't get "Shell access via SSH or the Render Dashboard").
//
// This exists purely so `npm run create-admin` isn't the only option when
// you're on a free Render plan. It is safe to leave in the codebase
// permanently because it's gated two ways:
//   1. Requires a secret (ADMIN_BOOTSTRAP_SECRET) that only the account
//      owner can see, in the Render dashboard's Environment tab.
//   2. Only works while ZERO staff_admin/superadmin accounts exist. The
//      moment one is created — by this route or by create-admin.js — this
//      route permanently refuses to do anything, forever, even with the
//      correct secret. It cannot be used to create a second admin.
router.post('/bootstrap-admin', async (req, res, next) => {
  try {
    const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!configuredSecret) {
      return res.status(404).json({
        error: 'Bootstrap is not enabled. Set ADMIN_BOOTSTRAP_SECRET in your environment to use this.',
      });
    }

    const { secret, email, password } = req.body;
    if (!secret || secret !== configuredSecret) {
      return res.status(401).json({ error: 'Invalid bootstrap secret.' });
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existingAdmins = await pool.query(
      "SELECT id FROM users WHERE role IN ('staff_admin', 'superadmin') LIMIT 1"
    );
    if (existingAdmins.rows.length > 0) {
      return res.status(409).json({
        error: 'An admin account already exists. Bootstrap only works before the first admin is created.',
      });
    }

    const existingEmail = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, is_email_verified)
       VALUES ($1, $2, 'superadmin', true)
       RETURNING id, email, role, created_at`,
      [email.trim().toLowerCase(), passwordHash]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
