const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const ctrl = require("../controllers/reportsController");

const router = express.Router();
router.use(authenticate);

// Financial oversight — county staff only, never Cooperative Managers (who
// would otherwise see disbursement totals across cooperatives they don't run).
router.get("/disbursements", requireRole("NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"), ctrl.disbursementSummary);

module.exports = router;
