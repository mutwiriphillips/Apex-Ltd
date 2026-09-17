const prisma = require("../config/db");
const { computeCreditAssessment, ASSET_TRACKED_VALUE_CHAINS } = require("../utils/creditScore");
const { deriveCommitteeStatus } = require("../utils/governance");
const { recordAudit } = require("../utils/audit");

// Gathers everything the scoring engine needs for one cooperative, refreshing
// each committee's derived status the same way governanceController does —
// so a stale stored status never silently skews the score. Asset/assetEvent
// queries only run when the cooperative's value chain actually tracks a
// discrete asset — no point fetching data the engine will never look at.
async function gatherAssessmentInputs(cooperative) {
  const cooperativeId = cooperative.id;
  const assetTrackingApplies = ASSET_TRACKED_VALUE_CHAINS.includes(cooperative.valueChain);

  const [members, contributions, produceDeliveries, documents, committeesRaw, assets] = await Promise.all([
    prisma.member.findMany({ where: { cooperativeId }, select: { id: true, createdAt: true } }),
    prisma.contribution.findMany({
      where: { cooperativeId },
      select: { memberId: true, amount: true, type: true, contributionDate: true },
    }),
    prisma.produceDelivery.findMany({
      where: { cooperativeId },
      select: { memberId: true, quantity: true, deliveryDate: true },
    }),
    prisma.document.findMany({ where: { cooperativeId }, select: { docType: true, status: true } }),
    prisma.committee.findMany({
      where: { cooperativeId },
      include: { members: true },
    }),
    assetTrackingApplies
      ? prisma.asset.findMany({ where: { cooperativeId }, select: { id: true, memberId: true, status: true } })
      : Promise.resolve([]),
  ]);

  const committees = committeesRaw.map((c) => ({
    committeeType: c.committeeType,
    status: deriveCommitteeStatus(c.members),
    complianceOverride: c.complianceOverride,
  }));

  let assetEvents = [];
  if (assetTrackingApplies && assets.length > 0) {
    assetEvents = await prisma.assetEvent.findMany({
      where: { assetId: { in: assets.map((a) => a.id) } },
      select: { assetId: true, eventDate: true },
    });
  }

  return { members, contributions, produceDeliveries, documents, committees, assets, assetEvents, valueChain: cooperative.valueChain };
}

// POST /cooperatives/:id/credit-assessment — runs a fresh assessment and
// stores it (so it can be retrieved/exported later even as underlying data
// changes). Restricted to roles that can vouch for the cooperative's
// standing — not self-servable by the cooperative's own manager.
async function runAssessment(req, res) {
  const cooperative = await prisma.cooperative.findUniqueOrThrow({ where: { id: req.params.id } });
  const inputs = await gatherAssessmentInputs(cooperative);
  const result = computeCreditAssessment(inputs);

  const assessment = await prisma.creditAssessment.create({
    data: {
      cooperativeId: cooperative.id,
      score: result.score,
      band: result.band,
      breakdown: result,
      computedById: req.user.id,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "RUN_CREDIT_ASSESSMENT",
    entityType: "CreditAssessment",
    entityId: assessment.id,
    metadata: { cooperativeId: cooperative.id, score: result.score, band: result.band },
  });

  res.status(201).json(assessment);
}

// GET /cooperatives/:id/credit-assessment — latest assessment, or null if
// none has ever been run.
async function getLatestAssessment(req, res) {
  const assessment = await prisma.creditAssessment.findFirst({
    where: { cooperativeId: req.params.id },
    orderBy: { createdAt: "desc" },
    include: { computedBy: { select: { id: true, fullName: true } } },
  });
  res.json(assessment);
}

// GET /cooperatives/:id/credit-assessment/history — full history, for
// showing a trend line to a lender (is this cooperative improving?).
async function getAssessmentHistory(req, res) {
  const assessments = await prisma.creditAssessment.findMany({
    where: { cooperativeId: req.params.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, score: true, band: true, createdAt: true },
  });
  res.json(assessments);
}

module.exports = { runAssessment, getLatestAssessment, getAssessmentHistory };
