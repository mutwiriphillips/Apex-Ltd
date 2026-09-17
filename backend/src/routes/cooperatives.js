const express = require("express");
const { authenticate, requirePermission, requireCooperativeAccess } = require("../middleware/auth");
const ctrl = require("../controllers/cooperativeController");

const router = express.Router();
router.use(authenticate);

// List/create don't have a specific cooperative ID yet, so the ownership
// check doesn't apply — listCooperatives already does its own county
// scoping internally (see scopedCountyId in cooperativeController).
router.get("/", requirePermission("cooperatives", "canView"), ctrl.listCooperatives);
router.post("/", requirePermission("cooperatives", "canEdit"), ctrl.createCooperative);

// Every route below references a specific cooperative — enforce ownership.
router.get("/:id", requireCooperativeAccess(), requirePermission("cooperatives", "canView"), ctrl.getCooperative);
router.patch("/:id", requireCooperativeAccess(), requirePermission("cooperatives", "canEdit"), ctrl.updateCooperative);
router.delete("/:id", requireCooperativeAccess(), requirePermission("cooperatives", "canEdit"), ctrl.deleteCooperative);

// Member roll (nested under a cooperative) — carries National ID and phone
// numbers, so this is exactly the kind of data requireCooperativeAccess
// exists to protect.
router.get("/:id/members", requireCooperativeAccess(), requirePermission("cooperatives", "canView"), ctrl.listMembers);
router.post("/:id/members", requireCooperativeAccess(), requirePermission("cooperatives", "canEdit"), ctrl.addMember);
router.patch("/:id/members/:memberId", requireCooperativeAccess(), requirePermission("cooperatives", "canEdit"), ctrl.updateMember);
router.delete("/:id/members/:memberId", requireCooperativeAccess(), requirePermission("cooperatives", "canEdit"), ctrl.removeMember);

module.exports = router;
