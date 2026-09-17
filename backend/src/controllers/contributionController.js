const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

const contributionSchema = z.object({
  memberId: z.string().uuid(),
  amount: z.number().positive(),
  type: z.enum(["MONTHLY_CONTRIBUTION", "SHARE_CAPITAL_TOPUP", "LOAN_REPAYMENT", "OTHER"]).default("MONTHLY_CONTRIBUTION"),
  method: z.enum(["MPESA", "CASH", "BANK_TRANSFER", "OTHER"]).default("CASH"),
  externalRef: z.string().optional(),
  contributionDate: z.coerce.date(),
});

// GET /cooperatives/:id/contributions?memberId=..
async function listContributions(req, res) {
  const { memberId } = req.query;
  const contributions = await prisma.contribution.findMany({
    where: {
      cooperativeId: req.params.id,
      ...(memberId ? { memberId } : {}),
    },
    include: {
      member: { select: { id: true, legalName: true } },
      recordedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { contributionDate: "desc" },
  });
  res.json(contributions);
}

// Records a contribution against a member's ledger. In production this is
// also the reconciliation target for an M-Pesa Daraja STK Push callback
// (externalRef would carry the M-Pesa receipt number) — see the "Digital
// Contributions" section of docs/ROADMAP.md for the integration plan. This
// manual endpoint is the staff-assisted path (cash/bank transfer recorded by
// a Cooperative Manager or Field Officer) and works today without any
// payment gateway credentials.
async function recordContribution(req, res) {
  const data = contributionSchema.parse(req.body);

  // Defend against a memberId from a different cooperative being posted here.
  const member = await prisma.member.findUniqueOrThrow({ where: { id: data.memberId } });
  if (member.cooperativeId !== req.params.id) {
    return res.status(400).json({ error: "Member does not belong to this cooperative" });
  }

  const contribution = await prisma.contribution.create({
    data: {
      ...data,
      cooperativeId: req.params.id,
      recordedById: req.user.id,
    },
  });

  // Share capital top-ups also update the member's running share capital
  // total so the existing Members tab stays accurate without a separate
  // reconciliation step.
  if (data.type === "SHARE_CAPITAL_TOPUP") {
    await prisma.member.update({
      where: { id: data.memberId },
      data: { shareCapital: { increment: data.amount } },
    });
  }

  await recordAudit({
    userId: req.user.id,
    action: "RECORD_CONTRIBUTION",
    entityType: "Contribution",
    entityId: contribution.id,
    metadata: { memberId: data.memberId, amount: data.amount, type: data.type },
  });

  res.status(201).json(contribution);
}

// GET /cooperatives/:id/contributions/summary — quick totals for the
// cooperative detail page without shipping the full ledger every time.
async function contributionsSummary(req, res) {
  const contributions = await prisma.contribution.findMany({
    where: { cooperativeId: req.params.id },
    select: { amount: true, type: true, contributionDate: true },
  });

  const totalsByType = contributions.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + Number(c.amount);
    return acc;
  }, {});

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  const thisMonthTotal = contributions
    .filter((c) => new Date(c.contributionDate) >= thisMonth)
    .reduce((sum, c) => sum + Number(c.amount), 0);

  res.json({
    totalContributions: contributions.length,
    totalsByType,
    thisMonthTotal,
  });
}

module.exports = { listContributions, recordContribution, contributionsSummary };
