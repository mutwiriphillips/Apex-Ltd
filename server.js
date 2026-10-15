// server.js
// Josriri Sports Management — API + static site entry point.
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
const mediaRouter = require('./src/routes/media');
const introductionsRouter = require('./src/routes/introductions');

const app = express();
const PORT = process.env.PORT || 3000;

// Render (and most PaaS platforms) sit behind a reverse proxy; without this,
// express-rate-limit sees every request as coming from the proxy's IP and
// rate-limits everyone together instead of per real client.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
// HTML and the imagery config must always be revalidated so a redeploy shows up
// immediately; other assets are revalidated with ETags (no stale long-lived cache).
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, file) {
    if (/\.(html|json)$/i.test(file)) res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  },
}));

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
  limit: Number(process.env.AUTH_RATE_LIMIT) || 10,
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
app.use('/api/introductions', limitWritesOnly(writeLimiter), introductionsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/stats', statsRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/admin', requireAuth, requireRole('staff_admin', 'superadmin'), adminRouter);
// Uploads are a bigger abuse surface than normal writes: cap them per address.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads from this address. Please try again later.' },
});
app.use('/api/account/players/:id/photo', (req, res, next) => (req.method === 'POST' ? uploadLimiter(req, res, next) : next()));
app.use('/api/account/players/:id/videos', (req, res, next) => (req.method === 'POST' ? uploadLimiter(req, res, next) : next()));
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
  // Body-parser errors (oversized upload, malformed JSON) carry a 4xx status.
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That file is too large. Please choose a smaller one.' });
  }
  if (err && err.status >= 400 && err.status < 500 && err.type) {
    return res.status(err.status).json({ error: 'The request could not be read.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Josriri API listening on port ${PORT}`);
});

