// src/helpers.js
// Small find-or-create helpers for reference tables. The platform's
// reference data (sports) is fixed and seeded by the schema; counties,
// clubs, and divisions are looked up by name and created on first use so
// the registration form can stay free-text without the schema losing its
// relational structure.

async function getSportId(client, sportName) {
  const res = await client.query('SELECT id FROM sports WHERE name = $1', [sportName]);
  if (res.rows.length === 0) {
    throw new HttpError(400, `Unknown sport "${sportName}". Must be one of Football, Rugby, Basketball, E-Football.`);
  }
  return res.rows[0].id;
}

async function findOrCreateCounty(client, countyName) {
  const name = (countyName || '').trim();
  if (!name) return null;
  const existing = await client.query('SELECT id FROM counties WHERE name ILIKE $1', [name]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const inserted = await client.query(
    'INSERT INTO counties (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [name]
  );
  return inserted.rows[0].id;
}

async function findOrCreateClub(client, clubName, sportId, countyId) {
  const name = (clubName || '').trim();
  if (!name) return null;
  const existing = await client.query(
    'SELECT id FROM clubs WHERE name ILIKE $1 AND sport_id = $2',
    [name, sportId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const inserted = await client.query(
    `INSERT INTO clubs (name, sport_id, county_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (name, sport_id) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, sportId, countyId]
  );
  return inserted.rows[0].id;
}

async function findOrCreateDivision(client, divisionName, sportId) {
  const name = (divisionName || '').trim();
  if (!name) return null;
  const existing = await client.query(
    'SELECT id FROM divisions WHERE name ILIKE $1 AND sport_id = $2',
    [name, sportId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const inserted = await client.query(
    `INSERT INTO divisions (sport_id, name, level_rank)
     VALUES ($1, $2, 9)
     ON CONFLICT (sport_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [sportId, name]
  );
  return inserted.rows[0].id;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { getSportId, findOrCreateCounty, findOrCreateClub, findOrCreateDivision, HttpError };
