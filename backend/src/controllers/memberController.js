const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

// GET /api/member/summary — the dashboard landing view.
async function summary(req, res) {
  const memberId = req.member.id;
  const cooperativeId = req.member.cooperativeId;
  const valueChain = req.member.cooperative.valueChain;
  const tracksAssets = ["LIVESTOCK", "POULTRY", "HOUSING", "TRANSPORT"].includes(valueChain);

  const [contributions, produceDeliveries, payouts, latestAssessment, agms, assets] = await Promise.all([
    prisma.contribution.findMany({ where: { memberId }, select: { amount: true, contributionDate: true, type: true } }),
    prisma.produceDelivery.findMany({ where: { memberId }, select: { totalValue: true, paid: true, quantity: true, unit: true } }),
    prisma.payout.findMany({ where: { memberId }, select: { amount: true, payoutDate: true } }),
    prisma.creditAssessment.findFirst({ where: { cooperativeId }, orderBy: { createdAt: "desc" } }),
    prisma.aGM.findMany({ where: { cooperativeId }, orderBy: { meetingDate: "desc" }, take: 3 }),
    tracksAssets
      ? prisma.asset.findMany({ where: { memberId }, select: { status: true, currentValue: true, acquisitionValue: true } })
      : Promise.resolve([]),
  ]);

  const totalContributions = contributions.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalProduceValue = produceDeliveries.reduce((sum, d) => sum + Number(d.totalValue || 0), 0);
  const unpaidProduceBalance = produceDeliveries
    .filter((d) => !d.paid)
    .reduce((sum, d) => sum + Number(d.totalValue || 0), 0);
  const totalPayouts = payouts.reduce((sum, p) => sum + Number(p.amount), 0);

  const activeAssets = assets.filter((a) => a.status === "ACTIVE");
  const totalAssetValue = activeAssets.reduce((sum, a) => sum + Number(a.currentValue || a.acquisitionValue || 0), 0);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  const thisMonthContributions = contributions
    .filter((c) => new Date(c.contributionDate) >= thisMonth)
    .reduce((sum, c) => sum + Number(c.amount), 0);

  res.json({
    member: {
      legalName: req.member.legalName,
      shareCapital: req.member.shareCapital,
      joinedAt: req.member.createdAt,
    },
    cooperative: {
      name: req.member.cooperative.name,
      valueChain: req.member.cooperative.valueChain,
    },
    totals: {
      totalContributions,
      thisMonthContributions,
      totalProduceValue,
      unpaidProduceBalance,
      totalPayouts,
      totalDeliveries: produceDeliveries.length,
      ...(tracksAssets ? { activeAssetCount: activeAssets.length, totalAssetValue } : {}),
    },
    cooperativeCreditStanding: latestAssessment
      ? { score: latestAssessment.score, band: latestAssessment.band, asOf: latestAssessment.createdAt }
      : null,
    upcomingMeetings: agms,
  });
}

async function listContributions(req, res) {
  const contributions = await prisma.contribution.findMany({
    where: { memberId: req.member.id },
    orderBy: { contributionDate: "desc" },
  });
  res.json(contributions);
}

async function listProduce(req, res) {
  const deliveries = await prisma.produceDelivery.findMany({
    where: { memberId: req.member.id },
    orderBy: { deliveryDate: "desc" },
  });
  res.json(deliveries);
}

// GET /api/member/assets — self-view, same shape as the staff-side listing
// but scoped entirely to the token's own member record. Read-only: a member
// can see their own asset/lifecycle history but never self-report it — the
// same "staff-recorded, not self-reported" boundary Produce already applies.
async function listAssets(req, res) {
  const assets = await prisma.asset.findMany({
    where: { memberId: req.member.id },
    include: { events: { orderBy: { eventDate: "desc" } } },
    orderBy: { acquisitionDate: "desc" },
  });
  res.json(assets);
}

async function listPayouts(req, res) {
  const payouts = await prisma.payout.findMany({
    where: { memberId: req.member.id },
    orderBy: { payoutDate: "desc" },
  });
  res.json(payouts);
}

async function listAgms(req, res) {
  const agms = await prisma.aGM.findMany({
    where: { cooperativeId: req.member.cooperativeId },
    orderBy: { meetingDate: "desc" },
  });
  res.json(agms);
}

const initiateContributionSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(["MONTHLY_CONTRIBUTION", "SHARE_CAPITAL_TOPUP"]).default("MONTHLY_CONTRIBUTION"),
});

/**
 * SIMULATED digital contribution — records a member-initiated contribution
 * directly, as if an M-Pesa STK Push had already been confirmed. There is
 * no real Safaricom Daraja integration wired up (that needs a shortcode,
 * passkey, and a publicly reachable callback URL this environment doesn't
 * have) — this endpoint exists so the trial run can demonstrate the full
 * member-initiated contribution flow end to end.
 *
 * To wire real M-Pesa later: replace this handler's direct Contribution
 * creation with (1) an STK Push request to Safaricom's Daraja API using the
 * amount/phone number, returning a pending state to the client, and (2) a
 * separate public webhook route that Safaricom calls back on payment
 * completion, which then creates the Contribution record with the real
 * M-Pesa receipt number in externalRef. The Contribution.method field
 * already supports "MPESA" and externalRef already exists for exactly this.
 */
async function initiateContribution(req, res) {
  const data = initiateContributionSchema.parse(req.body);

  const contribution = await prisma.contribution.create({
    data: {
      memberId: req.member.id,
      cooperativeId: req.member.cooperativeId,
      amount: data.amount,
      type: data.type,
      method: "MPESA",
      externalRef: `SIMULATED-${Date.now()}`,
      contributionDate: new Date(),
    },
  });

  if (data.type === "SHARE_CAPITAL_TOPUP") {
    await prisma.member.update({
      where: { id: req.member.id },
      data: { shareCapital: { increment: data.amount } },
    });
  }

  await recordAudit({
    action: "MEMBER_SELF_CONTRIBUTION_SIMULATED",
    entityType: "Contribution",
    entityId: contribution.id,
    metadata: { memberId: req.member.id, amount: data.amount },
  });

  res.status(201).json({
    contribution,
    simulated: true,
    note: "This is a simulated M-Pesa contribution for the trial run — no real payment gateway is connected yet.",
  });
}

module.exports = { summary, listContributions, listProduce, listAssets, listPayouts, listAgms, initiateContribution };
