// server.js
// Apex Talent Management — API + static site entry point.
// On Render this is started via `npm start`, which runs the migration
// (src/migrate.js) first and then boots this server. See render.yaml.

require('dotenv').config();
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('./src/helpers');
const { requireAuth, requireRole, optionalAuth } = require('./src/auth');

const playersRouter = require('./src/routes/players');
const highlightsRouter = require('./src/routes/highlights');
const leadsRouter = require('./src/routes/leads');
const statsRouter = require('./src/routes/stats');
const authRouter = require('./src/routes/auth');
const adminRouter = require('./src/routes/admin');
const accountRouter = require('./src/routes/account');

const app = express();
const PORT = process.env.PORT || 3000;

// Render (and most PaaS platforms) sit behind a reverse proxy; without this,
// express-rate-limit sees every request as coming from the proxy's IP and
// rate-limits everyone together instead of per real client.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

// Rate limits: generous for normal browsing/reads, tighter on the
// public-write and auth endpoints most likely to be abused (spam
// registrations, lead-form flooding, login brute-forcing).
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this address. Please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// writeLimiter should only throttle POSTs (registrations, highlight
// submissions, leads) — GETs on these same paths (directory search,
// browsing highlights) must stay unaffected, including the directory's
// debounced search which fires a GET on nearly every keystroke pause.
function limitWritesOnly(limiter) {
  return (req, res, next) => (req.method === 'POST' ? limiter(req, res, next) : next());
}

app.use('/api/players', limitWritesOnly(writeLimiter), optionalAuth, playersRouter);
app.use('/api/highlights', limitWritesOnly(writeLimiter), highlightsRouter);
app.use('/api/leads', limitWritesOnly(writeLimiter), leadsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/admin', requireAuth, requireRole('staff_admin', 'superadmin'), adminRouter);
app.use('/api/account', requireAuth, requireRole('player', 'guardian'), accountRouter);

// Fallback to index.html for the single-page site.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralised error handler — HttpError carries an intended status code;
// anything else is logged and returned as a generic 500 without leaking
// internals to the client.
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Apex Talent Management API listening on port ${PORT}`);
});

