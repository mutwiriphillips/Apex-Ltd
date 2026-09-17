const express = require("express");
const { authenticate, requirePermission, requireCooperativeAccess } = require("../middleware/auth");
const ctrl = require("../controllers/contributionController");

// Mounted at /api/cooperatives/:id/contributions
const router = express.Router({ mergeParams: true });
router.use(authenticate);
router.use(requireCooperativeAccess());

router.get("/", requirePermission("cooperatives", "canView"), ctrl.listContributions);
router.get("/summary", requirePermission("cooperatives", "canView"), ctrl.contributionsSummary);
router.post("/", requirePermission("cooperatives", "canEdit"), ctrl.recordContribution);

module.exports = router;
