const express = require("express");
const { authenticateMember } = require("../middleware/auth");
const ctrl = require("../controllers/memberController");

const router = express.Router();
router.use(authenticateMember);

router.get("/summary", ctrl.summary);
router.get("/contributions", ctrl.listContributions);
router.post("/contributions/initiate", ctrl.initiateContribution);
router.get("/produce", ctrl.listProduce);
router.get("/assets", ctrl.listAssets);
router.get("/payouts", ctrl.listPayouts);
router.get("/agms", ctrl.listAgms);

module.exports = router;
