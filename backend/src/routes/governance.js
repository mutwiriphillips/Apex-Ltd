const express = require("express");
const { authenticate, requireRole, requirePermission, requireCooperativeAccess } = require("../middleware/auth");
const ctrl = require("../controllers/governanceController");

// Mounted at /api/cooperatives/:id/governance
const router = express.Router({ mergeParams: true });
router.use(authenticate);
router.use(requireCooperativeAccess());

// Committees
router.get("/committees", requirePermission("governance", "canView"), ctrl.listCommittees);
router.post("/committees", requirePermission("governance", "canEdit"), ctrl.saveCommittee);
router.post(
  "/committees/:committeeId/override",
  requireRole("NATIONAL_ADMIN", "DIRECTOR"),
  ctrl.overrideCommittee
);
router.post(
  "/committees/:committeeId/signatories",
  requirePermission("governance", "canEdit"),
  ctrl.addSignatory
);

// Election candidates
router.get("/candidates", requirePermission("governance", "canView"), ctrl.listCandidates);
router.post("/candidates", requirePermission("governance", "canEdit"), ctrl.applyCandidate);
router.patch(
  "/candidates/:candidateId",
  requirePermission("governance", "canApprove"),
  ctrl.updateCandidateStatus
);

// AGM
router.get("/agms", requirePermission("governance", "canView"), ctrl.listAGMs);
router.post("/agms", requirePermission("governance", "canEdit"), ctrl.recordAGM);

module.exports = router;
