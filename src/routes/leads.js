// src/routes/leads.js
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const VALID_TYPES = ['club', 'sponsor', 'agent', 'federation', 'media'];

// POST /api/leads — sponsor/scout/club "request access" form submission.
router.post('/', async (req, res, next) => {
  try {
    const { organizationName, type, email, message } = req.body;
    const leadType = (type || '').toLowerCase();

    if (!organizationName || !VALID_TYPES.includes(leadType) || !email) {
      return res.status(400).json({
        error: `organizationName, a valid type (${VALID_TYPES.join(', ')}), and email are required.`,
      });
    }

    const result = await pool.query(
      `INSERT INTO sponsor_leads (organization_name, lead_type, contact_email, message)
       VALUES ($1,$2,$3,$4)
       RETURNING id, organization_name, lead_type, status, created_at`,
      [organizationName.trim(), leadType, email.trim(), (message || '').trim()]
    );
    res.status(201).json({ lead: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
