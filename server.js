// server.js
// Apex Talent Management — API + static site entry point.
// On Render this is started via `npm start`, which runs the migration
// (src/migrate.js) first and then boots this server. See render.yaml.

require('dotenv').config();
const path = require('path');
const express = require('express');
const { HttpError } = require('./src/helpers');

const playersRouter = require('./src/routes/players');
const highlightsRouter = require('./src/routes/highlights');
const leadsRouter = require('./src/routes/leads');
const statsRouter = require('./src/routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.use('/api/players', playersRouter);
app.use('/api/highlights', highlightsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/stats', statsRouter);

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
