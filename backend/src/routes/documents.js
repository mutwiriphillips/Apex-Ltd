const express = require("express");
const { authenticate, requireRole, requirePermission, requireCooperativeAccess } = require("../middleware/auth");
const ctrl = require("../controllers/documentController");

// Mounted at /api/cooperatives/:id/documents
const router = express.Router({ mergeParams: true });
router.use(authenticate);
router.use(requireCooperativeAccess());

router.get("/", requirePermission("documents", "canView"), ctrl.listDocuments);
router.post("/", requirePermission("documents", "canEdit"), ctrl.uploadDocument);

// Tier 1: Sub-county officer review
router.post(
  "/:docId/review",
  requireRole("NATIONAL_ADMIN", "SUBCOUNTY_OFFICER", "DIRECTOR"),
  ctrl.reviewDocument
);

// Tier 2: Director final sign-off
router.post("/:docId/approve", requireRole("NATIONAL_ADMIN", "DIRECTOR"), ctrl.approveDocument);

router.delete("/:docId", requireRole("NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"), ctrl.deleteDocument);

module.exports = router;
