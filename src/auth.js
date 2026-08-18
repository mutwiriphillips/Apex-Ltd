// src/auth.js
// Password hashing, JWT issuance/verification, and Express middleware for
// protecting routes. Kept deliberately small — this is Phase 1 of the
// auth system (see the strategy discussion): enough to gate the admin
// moderation tools safely, not a full account-management product yet.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '12h';
const SALT_ROUNDS = 11;

if (!JWT_SECRET) {
  console.error(
    'FATAL: JWT_SECRET is not set. Generate one with `openssl rand -hex 32` ' +
    'and set it as an environment variable — see .env.example and README.md.'
  );
  process.exit(1);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email || null },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Reads "Authorization: Bearer <token>", verifies it, and attaches the
// decoded payload to req.user. Responds 401 if missing/invalid/expired.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Use after requireAuth. Restricts a route to one or more roles.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

// Like requireAuth, but never blocks the request. If a well-formed, valid
// token is present it's attached to req.user; if it's missing, malformed,
// or expired, the request just proceeds unauthenticated (req.user stays
// undefined). Used on routes that must keep working for anonymous callers
// (e.g. open player registration) but can opportunistically link the
// result to an account when the caller happens to be logged in.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // Ignore silently — an expired/invalid token should not block an
      // otherwise-anonymous action like open player registration.
    }
  }
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, requireAuth, requireRole, optionalAuth };
