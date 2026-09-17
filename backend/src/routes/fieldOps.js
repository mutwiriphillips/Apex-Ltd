const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const ctrl = require("../controllers/fieldOpsController");

const router = express.Router();
router.use(authenticate);

// Leave
router.get("/leave", ctrl.listLeave);
router.post("/leave", ctrl.applyLeave);
router.post("/leave/:id/decision", requireRole("NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"), ctrl.decideLeave);

// Field visits
router.get("/visits", ctrl.listVisits);
router.post("/visits", requireRole("NATIONAL_ADMIN", "FIELD_OFFICER", "SUBCOUNTY_OFFICER", "DIRECTOR"), ctrl.planVisit);
router.post("/visits/:id/decision", requireRole("NATIONAL_ADMIN", "SUBCOUNTY_OFFICER", "DIRECTOR"), ctrl.decideVisit);
router.post("/visits/:id/report", requireRole("NATIONAL_ADMIN", "FIELD_OFFICER", "SUBCOUNTY_OFFICER", "DIRECTOR"), ctrl.submitVisitReport);

module.exports = router;
