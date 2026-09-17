const express = require("express");
const { login, me, signup } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const prisma = require("../config/db");

const router = express.Router();

router.post("/login", login);
router.post("/signup", signup); // gated internally by ALLOW_OPEN_SIGNUP
router.get("/me", authenticate, me);

// Public, minimal cooperative picker for the signup form (name/id only —
// no member or financial data), scoped to a county the visitor selected.
router.get("/signup/cooperatives", async (req, res) => {
  if (process.env.ALLOW_OPEN_SIGNUP !== "true") {
    return res.status(403).json({ error: "Open signup is disabled on this environment" });
  }
  const { countyId } = req.query;
  const cooperatives = await prisma.cooperative.findMany({
    where: countyId ? { countyId } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(cooperatives);
});

module.exports = router;
