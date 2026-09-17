const express = require("express");
const { authenticate, requirePermission, requireCooperativeAccess } = require("../middleware/auth");
const ctrl = require("../controllers/assetController");

// Mounted at /api/cooperatives/:id/assets
const router = express.Router({ mergeParams: true });
router.use(authenticate);
router.use(requireCooperativeAccess());

router.get("/", requirePermission("cooperatives", "canView"), ctrl.listAssets);
router.get("/statement", requirePermission("cooperatives", "canView"), ctrl.memberAssetStatement);
router.post("/", requirePermission("cooperatives", "canEdit"), ctrl.recordAsset);
router.get("/:assetId/events", requirePermission("cooperatives", "canView"), ctrl.listAssetEvents);
router.post("/:assetId/events", requirePermission("cooperatives", "canEdit"), ctrl.recordAssetEvent);

module.exports = router;
