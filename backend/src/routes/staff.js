const express = require("express");
const { authenticate, requireRole, requireStaffAccess } = require("../middleware/auth");
const {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  setPermission,
} = require("../controllers/staffController");

const router = express.Router();

router.use(authenticate);

// The Director manages staff within their county; a National Admin manages
// staff across all counties. requireStaffAccess enforces county-matching on
// every route that targets a specific staff member's ID.
router.get("/", requireRole("NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"), listStaff);
router.get("/:id", requireRole("NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER"), requireStaffAccess(), getStaff);
router.post("/", requireRole("NATIONAL_ADMIN", "DIRECTOR"), createStaff);
router.patch("/:id", requireRole("NATIONAL_ADMIN", "DIRECTOR"), requireStaffAccess(), updateStaff);
router.delete("/:id", requireRole("NATIONAL_ADMIN", "DIRECTOR"), requireStaffAccess(), deactivateStaff);
router.put("/:id/permissions", requireRole("NATIONAL_ADMIN", "DIRECTOR"), requireStaffAccess(), setPermission);

module.exports = router;
