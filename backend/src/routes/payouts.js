const express = require("express");
const { authenticate, requirePermission, requireCooperativeAccess } = require("../middleware/auth");
const ctrl = require("../controllers/payoutController");

// Mounted at /api/cooperatives/:id/payouts
const router = express.Router({ mergeParams: true });
router.use(authenticate);
router.use(requireCooperativeAccess());

router.get("/", requirePermission("cooperatives", "canView"), ctrl.listPayouts);
router.get("/member-summary", requirePermission("cooperatives", "canView"), ctrl.memberSummary);
router.post("/", requirePermission("cooperatives", "canEdit"), ctrl.recordPayout);

module.exports = router;
