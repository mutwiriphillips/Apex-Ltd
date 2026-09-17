const prisma = require("../config/db");

/**
 * Records a sensitive action to the audit log. Never throws — audit failures
 * must not block the primary operation, but are logged to the console.
 */
async function recordAudit({ userId, action, entityType, entityId, metadata }) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entityType, entityId, metadata },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

module.exports = { recordAudit };
