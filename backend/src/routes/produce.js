const express = require("express");
const { authenticate, requirePermission, requireCooperativeAccess } = require("../middleware/auth");
const ctrl = require("../controllers/produceController");

// Mounted at /api/cooperatives/:id/produce
const router = express.Router({ mergeParams: true });
router.use(authenticate);
router.use(requireCooperativeAccess());

router.get("/", requirePermission("cooperatives", "canView"), ctrl.listProduce);
router.get("/unpaid-summary", requirePermission("cooperatives", "canView"), ctrl.unpaidSummary);
router.post("/", requirePermission("cooperatives", "canEdit"), ctrl.recordProduce);

module.exports = router;
