const express = require("express");
const { authenticate, requireRole, requireCooperativeAccess } = require("../middleware/auth");
const ctrl = require("../controllers/creditAssessmentController");

// Mounted at /api/cooperatives/:id/credit-assessment
const router = express.Router({ mergeParams: true });
router.use(authenticate);
router.use(requireCooperativeAccess());

// Only county staff who can vouch for a cooperative's standing may run or
// view an assessment — a Cooperative Manager cannot self-certify their own
// creditworthiness (requireCooperativeAccess would let a manager through
// for their own coop, so the role check below is what actually excludes
// them). National Admins and Directors always pass; Sub-County Officers are
// the front-line assessors in the field.
router.get("/", requireRole("NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"), ctrl.getLatestAssessment);
router.get("/history", requireRole("NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"), ctrl.getAssessmentHistory);
router.post("/", requireRole("NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"), ctrl.runAssessment);

module.exports = router;
