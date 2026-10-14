// src/routes/representation.js
// Staff-only management of agents, managed-athlete contracts and deals.
// Mounted inside the admin router (already behind requireAuth + staff roles).
//
// Compliance rules (also enforced by a database trigger for contracts):
//   * Football contracts need an agent with an ACTIVE, unexpired licence.
//   * An agent can only represent athletes in sports they are registered for.
//   * A player under 18 needs a guardian consent reference on the contract.
//   * Football transfer / employment deals must sit under an active contract.
// Every create / change is written to data_processing_log with the actor.

const express = require('express');
const { pool } = require('../db');
const { EMAIL_RE, PHONE_RE } = require('../media');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LICENCE = ['active', 'pending', 'suspended', 'expired'];
const DEAL_TYPES = ['transfer', 'sponsorship', 'endorsement', 'employment_contract'];
const DEAL_STATUS = ['negotiating', 'closed', 'fell_through'];
const CURRENCIES = ['KES', 'USD', 'EUR', 'GBP'];
const TIERS = ['standard', 'premium'];

const bad = (res, msg, fields) => res.status(400).json({ error: msg, fields });
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const num = (v) => (v === '' || v == null ? null : Number(v));

async function audit(client, actor, playerId, action, purpose) {
  await (client || pool).query(
    `INSERT INTO data_processing_log (actor_user_id, subject_player_id, action, purpose) VALUES ($1,$2,$3,$4)`,
    [actor, playerId || null, action, String(purpose).slice(0, 120)]);
}

// Friendly messages for the compliance trigger and unique constraints.
function mapDbError(err, res) {
  const m = /^(AGENT_SPORT|AGENT_LICENCE|GUARDIAN_CONSENT): (.*)$/.exec(err.message || '');
  if (m) return res.status(422).json({ error: m[2], code: m[1] });
  if (err.code === '23505' && /uq_managed_active_player/.test(err.constraint || '')) {
    return res.status(409).json({ error: 'This player already has an active management contract. Terminate it first.' });
  }
  if (err.code === '23505' && /fifa_license_number/.test(err.constraint || '')) {
    return res.status(409).json({ error: 'Another agent already has that licence number.' });
  }
  if (err.code === '23514') return res.status(400).json({ error: 'Those values break a rule (check dates, amounts and publishing conditions).' });
  return null;
}

// Contracts past their end date become 'expired' (so they leave the public roster).
async function expireContracts() {
  await pool.query(
    `UPDATE managed_athletes SET status = 'expired', ended_at = now(), updated_at = now()
     WHERE status = 'active' AND contract_end IS NOT NULL AND contract_end < CURRENT_DATE`);
}

// ----------------------------------------------------------- summary
router.get('/representation/summary', async (req, res, next) => {
  try {
    await expireContracts();
    const [a, c, d, money] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE license_status = 'active' AND (license_expiry IS NULL OR license_expiry >= CURRENT_DATE))::int AS licensed,
          COUNT(*) FILTER (WHERE license_expiry IS NOT NULL AND license_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + 60)::int AS expiring
        FROM agents`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'active' AND contract_end IS NOT NULL AND contract_end BETWEEN CURRENT_DATE AND CURRENT_DATE + 60)::int AS ending_soon
        FROM managed_athletes`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'negotiating')::int AS negotiating,
          COUNT(*) FILTER (WHERE status = 'closed')::int AS closed FROM deals`),
      pool.query(`SELECT currency, COALESCE(SUM(value_amount),0)::float AS value, COALESCE(SUM(commission_amount),0)::float AS commission
        FROM deals WHERE status = 'closed' GROUP BY currency ORDER BY currency`),
    ]);
    res.json({ agents: a.rows[0], contracts: c.rows[0], deals: d.rows[0], closedByCurrency: money.rows });
  } catch (err) { next(err); }
});

// Player picker for forms (staff can see every player, public or not).
router.get('/representation/players', async (req, res, next) => {
  try {
    const q = str(req.query.q, 80);
    const r = await pool.query(
      `SELECT p.id, p.full_name, s.name AS sport, p.is_minor, c.name AS county
       FROM players p JOIN sports s ON s.id = p.sport_id LEFT JOIN counties c ON c.id = p.county_id
       WHERE ($1 = '' OR p.full_name ILIKE '%' || $1 || '%')
       ORDER BY p.full_name LIMIT 25`, [q]);
    res.json({ players: r.rows });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------- agents
function agentSelect(where = '', limit = '') {
  return `SELECT a.id, a.full_name, a.email, a.phone, a.fifa_license_number, a.license_status, a.license_expiry,
      a.notes, a.license_verified_at, a.created_at, u.email AS login_email,
      (a.license_status = 'active' AND (a.license_expiry IS NULL OR a.license_expiry >= CURRENT_DATE)) AS licence_ok,
      (a.license_expiry IS NOT NULL AND a.license_expiry < CURRENT_DATE) AS licence_lapsed,
      COALESCE((SELECT json_agg(s.name ORDER BY s.name) FROM agent_sports x JOIN sports s ON s.id = x.sport_id WHERE x.agent_id = a.id), '[]') AS sports,
      (SELECT COUNT(*)::int FROM managed_athletes m WHERE m.agent_id = a.id AND m.status = 'active') AS active_contracts
    FROM agents a LEFT JOIN users u ON u.id = a.user_id ${where} ORDER BY a.full_name ${limit}`;
}

router.get('/agents', async (req, res, next) => {
  try { res.json({ agents: (await pool.query(agentSelect('', 'LIMIT 300'))).rows }); } catch (err) { next(err); }
});

async function readAgentBody(b, partial) {
  const f = {}; const errors = {};
  if (!partial || b.fullName !== undefined) { f.full_name = str(b.fullName, 100); if (f.full_name.length < 2) errors.fullName = 'Enter the agent\'s name.'; }
  if (b.email !== undefined) { f.email = str(b.email, 254).toLowerCase() || null; if (f.email && !EMAIL_RE.test(f.email)) errors.email = 'Enter a valid email.'; }
  if (b.phone !== undefined) { f.phone = str(b.phone, 30) || null; if (f.phone && !PHONE_RE.test(f.phone)) errors.phone = 'Enter a valid phone number.'; }
  if (b.fifaLicenseNumber !== undefined) f.fifa_license_number = str(b.fifaLicenseNumber, 40) || null;
  if (b.licenseStatus !== undefined) { f.license_status = str(b.licenseStatus, 20); if (!LICENCE.includes(f.license_status)) errors.licenseStatus = 'Choose a licence status.'; }
  if (b.licenseExpiry !== undefined) { f.license_expiry = str(b.licenseExpiry, 10) || null; if (f.license_expiry && !isDate(f.license_expiry)) errors.licenseExpiry = 'Use a valid date.'; }
  if (b.notes !== undefined) f.notes = str(b.notes, 300) || null;
  if (b.sports !== undefined) {
    if (!Array.isArray(b.sports)) errors.sports = 'Choose at least one sport.';
    else {
      const ok = await pool.query('SELECT id, name FROM sports WHERE name = ANY($1)', [b.sports.map(String)]);
      f.sportIds = ok.rows.map((r) => r.id);
      if (!f.sportIds.length) errors.sports = 'Choose at least one sport.';
    }
  } else if (!partial) errors.sports = 'Choose at least one sport.';
  // An 'active' licence needs a number, and cannot already be past its expiry.
  if (f.license_status === 'active') {
    if (b.fifaLicenseNumber !== undefined && !f.fifa_license_number) errors.fifaLicenseNumber = 'An active licence needs a licence number.';
    if (f.license_expiry && f.license_expiry < new Date().toISOString().slice(0, 10)) errors.licenseExpiry = 'That expiry date has passed, so the licence cannot be active.';
  }
  return { f, errors };
}

router.post('/agents', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const { f, errors } = await readAgentBody(b, false);
    if (f.license_status === undefined) f.license_status = 'pending';
    if (f.license_status === 'active' && !f.fifa_license_number) errors.fifaLicenseNumber = 'An active licence needs a licence number.';
    if (Object.keys(errors).length) return bad(res, 'Please check the highlighted fields.', errors);
    let userId = null;
    const link = str(b.linkUserEmail, 254).toLowerCase();
    if (link) {
      const u = await pool.query("SELECT id, role FROM users WHERE email = $1", [link]);
      if (!u.rows.length) return bad(res, 'No account has that email.', { linkUserEmail: 'No account has that email.' });
      if (u.rows[0].role !== 'agent') return bad(res, "That account's role is not 'agent'. Change its role in Users first.", { linkUserEmail: "Role must be 'agent'." });
      userId = u.rows[0].id;
    }
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO agents (user_id, full_name, email, phone, fifa_license_number, license_status, license_expiry, notes,
         license_verified_by, license_verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $9, CASE WHEN $10::boolean THEN now() END) RETURNING id`,
      [userId, f.full_name, f.email || null, f.phone || null, f.fifa_license_number || null, f.license_status,
        f.license_expiry || null, f.notes || null, f.license_status === 'active' ? req.user.sub : null,
        f.license_status === 'active']);
    for (const sid of f.sportIds) await client.query('INSERT INTO agent_sports (agent_id, sport_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.rows[0].id, sid]);
    await audit(client, req.user.sub, null, 'agent_created', `agent ${f.full_name} (${f.license_status})`);
    await client.query('COMMIT');
    res.status(201).json({ agent: (await pool.query(agentSelect('WHERE a.id = $1'), [r.rows[0].id])).rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (!mapDbError(err, res)) next(err);
  } finally { client.release(); }
});

router.patch('/agents/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Agent not found.' });
    const cur = await pool.query('SELECT * FROM agents WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Agent not found.' });
    const { f, errors } = await readAgentBody(req.body || {}, true);
    const next_ = Object.assign({}, cur.rows[0], f);
    if (next_.license_status === 'active' && !next_.fifa_license_number) errors.fifaLicenseNumber = 'An active licence needs a licence number.';
    if (next_.license_status === 'active' && next_.license_expiry && new Date(next_.license_expiry) < new Date(new Date().toISOString().slice(0, 10))) errors.licenseExpiry = 'That expiry date has passed, so the licence cannot be active.';
    if (Object.keys(errors).length) return bad(res, 'Please check the highlighted fields.', errors);
    const sets = []; const params = []; const add = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`); };
    for (const col of ['full_name', 'email', 'phone', 'fifa_license_number', 'license_status', 'license_expiry', 'notes']) if (f[col] !== undefined) add(col, f[col]);
    if (f.license_status !== undefined && f.license_status !== cur.rows[0].license_status) {
      add('license_verified_by', f.license_status === 'active' ? req.user.sub : null);
      sets.push(`license_verified_at = ${f.license_status === 'active' ? 'now()' : 'NULL'}`);
    }
    await client.query('BEGIN');
    if (sets.length) { params.push(req.params.id); await client.query(`UPDATE agents SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params); }
    if (f.sportIds) {
      await client.query('DELETE FROM agent_sports WHERE agent_id = $1', [req.params.id]);
      for (const sid of f.sportIds) await client.query('INSERT INTO agent_sports (agent_id, sport_id) VALUES ($1,$2)', [req.params.id, sid]);
    }
    await audit(client, req.user.sub, null, 'agent_updated', `agent ${cur.rows[0].full_name}${f.license_status ? ' licence -> ' + f.license_status : ''}`);
    await client.query('COMMIT');
    res.json({ agent: (await pool.query(agentSelect('WHERE a.id = $1'), [req.params.id])).rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (!mapDbError(err, res)) next(err);
  } finally { client.release(); }
});

// -------------------------------------------------------- contracts
const contractSelect = `SELECT m.id, m.player_id, p.full_name AS player_name, p.is_minor, s.name AS sport,
    m.agent_id, a.full_name AS agent_name, (a.license_status = 'active' AND (a.license_expiry IS NULL OR a.license_expiry >= CURRENT_DATE)) AS agent_licence_ok,
    m.contract_start, m.contract_end, m.commission_rate, m.exclusivity, m.status, m.package_tier,
    m.guardian_consent_ref, m.notes, m.signed_at, m.ended_at
  FROM managed_athletes m JOIN players p ON p.id = m.player_id JOIN sports s ON s.id = p.sport_id JOIN agents a ON a.id = m.agent_id`;

router.get('/contracts', async (req, res, next) => {
  try {
    await expireContracts();
    const params = []; let where = '';
    if (['active', 'terminated', 'expired'].includes(req.query.status)) { params.push(req.query.status); where = 'WHERE m.status = $1'; }
    const r = await pool.query(`${contractSelect} ${where} ORDER BY (m.status = 'active') DESC, m.signed_at DESC LIMIT 300`, params);
    res.json({ contracts: r.rows });
  } catch (err) { next(err); }
});

router.post('/contracts', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body || {}; const errors = {};
    const playerId = str(b.playerId, 40), agentId = str(b.agentId, 40);
    const start = str(b.contractStart, 10), end = str(b.contractEnd, 10) || null;
    const rate = num(b.commissionRate);
    const tier = str(b.packageTier, 10) || 'standard';
    if (!UUID_RE.test(playerId)) errors.playerId = 'Choose a player.';
    if (!UUID_RE.test(agentId)) errors.agentId = 'Choose an agent.';
    if (!isDate(start)) errors.contractStart = 'Enter the start date.';
    if (end && !isDate(end)) errors.contractEnd = 'Use a valid date.';
    if (!errors.contractStart && end && !errors.contractEnd && end < start) errors.contractEnd = 'The end date must be on or after the start date.';
    if (end && !errors.contractEnd && end < new Date().toISOString().slice(0, 10)) errors.contractEnd = 'The end date is already in the past.';
    if (rate == null || Number.isNaN(rate) || rate < 0 || rate > 100) errors.commissionRate = 'Enter a commission between 0 and 100 %.';
    if (!TIERS.includes(tier)) errors.packageTier = 'Choose a package.';
    if (Object.keys(errors).length) return bad(res, 'Please check the highlighted fields.', errors);
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO managed_athletes (player_id, agent_id, contract_start, contract_end, commission_rate, exclusivity,
         package_tier, guardian_consent_ref, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [playerId, agentId, start, end, rate, b.exclusivity !== false, tier, str(b.guardianConsentRef, 120) || null, str(b.notes, 300) || null, req.user.sub]);
    await audit(client, req.user.sub, playerId, 'contract_created', `commission ${rate}% ${tier}`);
    await client.query('COMMIT');
    res.status(201).json({ contract: (await pool.query(`${contractSelect} WHERE m.id = $1`, [ins.rows[0].id])).rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23503') return res.status(404).json({ error: 'Player or agent not found.' });
    if (!mapDbError(err, res)) next(err);
  } finally { client.release(); }
});

// PATCH /contracts/:id  { status?: 'terminated', contractEnd?, commissionRate?, notes?, packageTier? }
router.patch('/contracts/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Contract not found.' });
    const b = req.body || {};
    const cur = await pool.query('SELECT * FROM managed_athletes WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Contract not found.' });
    const c = cur.rows[0];
    if (c.status !== 'active') return res.status(409).json({ error: 'Only an active contract can be changed.' });
    const sets = []; const params = []; const add = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`); };
    const errors = {};
    if (b.status !== undefined) { if (b.status !== 'terminated') errors.status = "Only 'terminated' is allowed here."; else { add('status', 'terminated'); sets.push('ended_at = now()'); if (!c.contract_end || new Date(c.contract_end) > new Date()) add('contract_end', new Date().toISOString().slice(0, 10)); } }
    if (b.contractEnd !== undefined && b.status === undefined) {
      const e = str(b.contractEnd, 10) || null;
      if (e && !isDate(e)) errors.contractEnd = 'Use a valid date.';
      else if (e && e < String(c.contract_start.toISOString ? c.contract_start.toISOString().slice(0, 10) : c.contract_start)) errors.contractEnd = 'The end date must be on or after the start date.';
      else add('contract_end', e);
    }
    if (b.commissionRate !== undefined) { const r = num(b.commissionRate); if (r == null || Number.isNaN(r) || r < 0 || r > 100) errors.commissionRate = 'Enter 0 to 100 %.'; else add('commission_rate', r); }
    if (b.packageTier !== undefined) { if (!TIERS.includes(b.packageTier)) errors.packageTier = 'Choose a package.'; else add('package_tier', b.packageTier); }
    if (b.notes !== undefined) add('notes', str(b.notes, 300) || null);
    if (Object.keys(errors).length) return bad(res, 'Please check the highlighted fields.', errors);
    if (!sets.length) return bad(res, 'Nothing to update.');
    await client.query('BEGIN');
    params.push(req.params.id);
    await client.query(`UPDATE managed_athletes SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    await audit(client, req.user.sub, c.player_id, b.status === 'terminated' ? 'contract_terminated' : 'contract_updated', 'management contract');
    await client.query('COMMIT');
    res.json({ contract: (await pool.query(`${contractSelect} WHERE m.id = $1`, [req.params.id])).rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (!mapDbError(err, res)) next(err);
  } finally { client.release(); }
});

// ----------------------------------------------------------- deals
const dealSelect = `SELECT d.id, d.player_id, p.full_name AS player_name, p.is_minor, s.name AS sport, d.managed_athlete_id,
    d.deal_type, d.counterparty_name, d.value_amount::float AS value_amount, d.currency, d.commission_amount::float AS commission_amount,
    d.status, d.closed_at, d.notes, d.athlete_consented, d.is_public, d.public_summary, d.created_at
  FROM deals d JOIN players p ON p.id = d.player_id JOIN sports s ON s.id = p.sport_id`;

router.get('/deals', async (req, res, next) => {
  try {
    const params = []; let where = '';
    if (DEAL_STATUS.includes(req.query.status)) { params.push(req.query.status); where = 'WHERE d.status = $1'; }
    const r = await pool.query(`${dealSelect} ${where} ORDER BY d.created_at DESC LIMIT 300`, params);
    res.json({ deals: r.rows });
  } catch (err) { next(err); }
});

// Football transfers / employment deals must be handled under an active contract
// with a licensed agent.
async function checkDealCompliance(playerId, managedId, dealType, errors) {
  const p = await pool.query('SELECT p.id, p.is_minor, s.name AS sport FROM players p JOIN sports s ON s.id = p.sport_id WHERE p.id = $1', [playerId]);
  if (!p.rows.length) { errors.playerId = 'Player not found.'; return null; }
  let contract = null;
  if (managedId) {
    if (!UUID_RE.test(managedId)) { errors.managedAthleteId = 'Invalid contract.'; return p.rows[0]; }
    const m = await pool.query(
      `SELECT m.id, m.player_id, m.status, (a.license_status = 'active' AND (a.license_expiry IS NULL OR a.license_expiry >= CURRENT_DATE)) AS lic
       FROM managed_athletes m JOIN agents a ON a.id = m.agent_id WHERE m.id = $1`, [managedId]);
    if (!m.rows.length || m.rows[0].player_id !== playerId) errors.managedAthleteId = 'That contract does not belong to this player.';
    else if (m.rows[0].status !== 'active') errors.managedAthleteId = 'That contract is no longer active.';
    else contract = m.rows[0];
  }
  if (p.rows[0].sport === 'Football' && ['transfer', 'employment_contract'].includes(dealType)) {
    if (!contract) errors.managedAthleteId = 'Football transfer and employment deals must be linked to an active management contract.';
    else if (!contract.lic) errors.managedAthleteId = "This contract's agent does not hold an active, unexpired licence.";
  }
  return p.rows[0];
}

router.post('/deals', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body || {}; const errors = {};
    const playerId = str(b.playerId, 40), managedId = str(b.managedAthleteId, 40) || null;
    const dealType = str(b.dealType, 30), status = str(b.status, 20) || 'negotiating', currency = (str(b.currency, 3) || 'KES').toUpperCase();
    const value = num(b.valueAmount); let commission = num(b.commissionAmount);
    let closedAt = str(b.closedAt, 10) || null;
    if (!UUID_RE.test(playerId)) errors.playerId = 'Choose a player.';
    if (!DEAL_TYPES.includes(dealType)) errors.dealType = 'Choose a deal type.';
    if (!DEAL_STATUS.includes(status)) errors.status = 'Choose a status.';
    if (!CURRENCIES.includes(currency)) errors.currency = 'Choose a currency.';
    if (value != null && (Number.isNaN(value) || value < 0)) errors.valueAmount = 'Enter a positive amount.';
    if (commission != null && (Number.isNaN(commission) || commission < 0)) errors.commissionAmount = 'Enter a positive amount.';
    if (closedAt && !isDate(closedAt)) errors.closedAt = 'Use a valid date.';
    if (status === 'closed' && !closedAt) closedAt = new Date().toISOString().slice(0, 10);
    if (str(b.counterpartyName, 120).length < 2) errors.counterpartyName = 'Who is the other party?';
    if (!errors.playerId && !errors.dealType) await checkDealCompliance(playerId, managedId, dealType, errors);
    if (Object.keys(errors).length) return bad(res, 'Please check the highlighted fields.', errors);
    // Suggest the commission from the contract rate when it was left blank.
    if (commission == null && value != null && managedId) {
      const r = await pool.query('SELECT commission_rate::float AS rate FROM managed_athletes WHERE id = $1', [managedId]);
      if (r.rows.length) commission = Math.round(value * r.rows[0].rate) / 100;
    }
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO deals (player_id, managed_athlete_id, deal_type, counterparty_name, value_amount, currency, commission_amount,
         status, closed_at, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [playerId, managedId, dealType, str(b.counterpartyName, 120), value, currency, commission, status,
        status === 'closed' ? closedAt : null, str(b.notes, 300) || null, req.user.sub]);
    await audit(client, req.user.sub, playerId, 'deal_created', `${dealType} ${status}`);
    await client.query('COMMIT');
    res.status(201).json({ deal: (await pool.query(`${dealSelect} WHERE d.id = $1`, [ins.rows[0].id])).rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (!mapDbError(err, res)) next(err);
  } finally { client.release(); }
});

// PATCH /deals/:id { status?, closedAt?, valueAmount?, commissionAmount?, notes?, athleteConsented?, isPublic?, publicSummary? }
router.patch('/deals/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Deal not found.' });
    const cur = await pool.query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Deal not found.' });
    const d = cur.rows[0]; const b = req.body || {}; const errors = {};
    const sets = []; const params = []; const add = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`); };
    let status = d.status;
    if (b.status !== undefined) { if (!DEAL_STATUS.includes(b.status)) errors.status = 'Choose a status.'; else { status = b.status; add('status', status); } }
    if (status === 'closed') {
      const ca = b.closedAt !== undefined ? (str(b.closedAt, 10) || null) : (d.closed_at ? new Date(d.closed_at).toISOString().slice(0, 10) : null);
      if (ca && !isDate(ca)) errors.closedAt = 'Use a valid date.'; else if (b.closedAt !== undefined || b.status !== undefined) add('closed_at', ca || new Date().toISOString().slice(0, 10));
    } else if (b.status !== undefined) add('closed_at', null);
    if (b.valueAmount !== undefined) { const v = num(b.valueAmount); if (v != null && (Number.isNaN(v) || v < 0)) errors.valueAmount = 'Enter a positive amount.'; else add('value_amount', v); }
    if (b.commissionAmount !== undefined) { const v = num(b.commissionAmount); if (v != null && (Number.isNaN(v) || v < 0)) errors.commissionAmount = 'Enter a positive amount.'; else add('commission_amount', v); }
    if (b.notes !== undefined) add('notes', str(b.notes, 300) || null);
    if (b.athleteConsented !== undefined) add('athlete_consented', b.athleteConsented === true);
    if (b.publicSummary !== undefined) add('public_summary', str(b.publicSummary, 160) || null);
    if (b.isPublic !== undefined) {
      add('is_public', b.isPublic === true);
      if (b.isPublic === true) {
        const consent = b.athleteConsented !== undefined ? b.athleteConsented === true : d.athlete_consented;
        const summary = b.publicSummary !== undefined ? str(b.publicSummary, 160) : (d.public_summary || '');
        if (status !== 'closed') errors.isPublic = 'Only a closed deal can be published.';
        else if (!consent) errors.isPublic = 'Confirm that the athlete (or guardian) agreed to publication first.';
        else if (!summary) errors.isPublic = 'Write a short public summary first.';
      }
    }
    // Un-closing a deal must also unpublish it.
    if (status !== 'closed' && d.is_public && b.isPublic === undefined) add('is_public', false);
    if (Object.keys(errors).length) return bad(res, 'Please check the highlighted fields.', errors);
    if (!sets.length) return bad(res, 'Nothing to update.');
    await client.query('BEGIN');
    params.push(req.params.id);
    await client.query(`UPDATE deals SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    await audit(client, req.user.sub, d.player_id, b.isPublic === true ? 'deal_published' : b.isPublic === false ? 'deal_unpublished' : 'deal_updated', `${d.deal_type} -> ${status}`);
    await client.query('COMMIT');
    res.json({ deal: (await pool.query(`${dealSelect} WHERE d.id = $1`, [req.params.id])).rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (!mapDbError(err, res)) next(err);
  } finally { client.release(); }
});

module.exports = router;
