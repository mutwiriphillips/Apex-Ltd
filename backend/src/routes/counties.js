const express = require("express");
const { listCounties, countySummary } = require("../controllers/countyController");

const router = express.Router();

// Public — needed on the landing page and signup form before login.
router.get("/", listCounties);
router.get("/summary", countySummary);

module.exports = router;
