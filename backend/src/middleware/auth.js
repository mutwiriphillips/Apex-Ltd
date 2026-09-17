const jwt = require("jsonwebtoken");
const prisma = require("../config/db");

/**
 * Verifies the JWT bearer token and attaches the authenticated user
 * (with permissions) to req.user.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type === "member") {
      return res.status(401).json({ error: "Invalid token type for this endpoint" });
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { permissions: true, county: true },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: "Account not found or deactivated" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Restricts a route to one or more StaffRole values.
 * Usage: requireRole("DIRECTOR", "SUBCOUNTY_OFFICER")
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient role for this action" });
    }
    next();
  };
}

/**
 * Enforces granular module permissions assigned by the Director (Module 1).
 * The DIRECTOR role always passes — Directors have full access by design.
 */
function requirePermission(module, level = "canView") {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.role === "NATIONAL_ADMIN" || req.user.role === "DIRECTOR") return next();

    const perm = req.user.permissions.find((p) => p.module === module);
    if (!perm || !perm[level]) {
      return res.status(403).json({ error: `Missing '${level}' permission on module '${module}'` });
    }
    next();
  };
}

/**
 * Loads the cooperative referenced by req.params.id and enforces that the
 * requesting user is actually allowed to touch it — not just that their
 * role/permission level is high enough in the abstract.
 *
 *   - NATIONAL_ADMIN: always allowed (cross-county oversight by design)
 *   - COOPERATIVE_MANAGER: only their own managed cooperative
 *   - everyone else (DIRECTOR, SUBCOUNTY_OFFICER, FIELD_OFFICER): only
 *     cooperatives within their own county
 *
 * Attaches the loaded cooperative to req.cooperative so downstream handlers
 * don't need a second fetch. Used on the financial-ledger routes (produce,
 * payouts, credit assessment, contributions) since a mismatched cooperative
 * ID here means real money data leaking across county or cooperative lines
 * — a risk that's worth this explicit check even though other modules
 * (documents, governance) currently rely on role/permission checks alone.
 * That's a gap worth closing there too in a follow-up hardening pass.
 */
function requireCooperativeAccess() {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    const cooperative = await prisma.cooperative.findUnique({ where: { id: req.params.id } });
    if (!cooperative) return res.status(404).json({ error: "Cooperative not found" });

    if (req.user.role === "NATIONAL_ADMIN") {
      req.cooperative = cooperative;
      return next();
    }

    if (req.user.role === "COOPERATIVE_MANAGER") {
      if (cooperative.managerId !== req.user.id) {
        return res.status(403).json({ error: "You do not manage this cooperative" });
      }
      req.cooperative = cooperative;
      return next();
    }

    if (cooperative.countyId !== req.user.countyId) {
      return res.status(403).json({ error: "This cooperative is outside your county" });
    }
    req.cooperative = cooperative;
    next();
  };
}

/**
 * Verifies a MEMBER token (separate JWT audience from staff tokens — see
 * memberAuthController.signMemberToken). Attaches req.member (the Member
 * record) and req.memberAccount to the request. Member-facing routes never
 * accept a memberId/cooperativeId from the client — everything is derived
 * from the authenticated token, so one member can never query another
 * member's data by guessing an ID.
 */
async function authenticateMember(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "member") {
      return res.status(401).json({ error: "Invalid token type for this endpoint" });
    }

    const account = await prisma.memberAccount.findUnique({
      where: { id: payload.sub },
      include: { member: { include: { cooperative: true } } },
    });

    if (!account || !account.active) {
      return res.status(401).json({ error: "Account not found or deactivated" });
    }

    req.memberAccount = account;
    req.member = account.member;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Same principle as requireCooperativeAccess, applied to staff records
 * (req.params.id is a User id here, not a Cooperative id). A Director
 * should never be able to view/modify a staff account in another county by
 * guessing a user ID. Attaches req.targetStaff.
 */
function requireStaffAccess() {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    const targetStaff = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetStaff) return res.status(404).json({ error: "Staff account not found" });

    if (req.user.role === "NATIONAL_ADMIN") {
      req.targetStaff = targetStaff;
      return next();
    }

    if (targetStaff.countyId !== req.user.countyId) {
      return res.status(403).json({ error: "This staff account is outside your county" });
    }
    req.targetStaff = targetStaff;
    next();
  };
}

module.exports = {
  authenticate,
  authenticateMember,
  requireRole,
  requirePermission,
  requireCooperativeAccess,
  requireStaffAccess,
};
