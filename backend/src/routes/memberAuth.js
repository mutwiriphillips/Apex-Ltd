const express = require("express");
const prisma = require("../config/db");
const { register, login, me } = require("../controllers/memberAuthController");
const { authenticateMember } = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authenticateMember, me);

// Public — a would-be member isn't authenticated yet and needs to find
// their cooperative to register. Name/id only, no membership or financial
// data exposed.
router.get("/cooperatives", async (req, res) => {
  const { countyId } = req.query;
  const cooperatives = await prisma.cooperative.findMany({
    where: countyId ? { countyId } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(cooperatives);
});

module.exports = router;
