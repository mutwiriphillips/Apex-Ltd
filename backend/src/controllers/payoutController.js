const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

const payoutSchema = z.object({
  memberId: z.string().uuid(),
  amount: z.number().positive(),
  type: z.enum(["PRODUCE_PAYMENT", "DIVIDEND", "BONUS", "OTHER"]).default("PRODUCE_PAYMENT"),
  method: z.enum(["MPESA", "CASH", "BANK_TRANSFER", "OTHER"]).default("CASH"),
  externalRef: z.string().optional(),
  periodLabel: z.string().optional(),
  payoutDate: z.coerce.date(),
  // Optional: mark these unpaid produce deliveries as settled by this payout.
  produceDeliveryIds: z.array(z.string().uuid()).optional(),
});

// GET /cooperatives/:id/payouts?memberId=..&from=..&to=..
async function listPayouts(req, res) {
  const { memberId, from, to } = req.query;
  const payouts = await prisma.payout.findMany({
    where: {
      cooperativeId: req.params.id,
      ...(memberId ? { memberId } : {}),
      ...(from || to
        ? {
            payoutDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      member: { select: { id: true, legalName: true } },
      recordedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { payoutDate: "desc" },
  });
  res.json(payouts);
}

async function recordPayout(req, res) {
  const data = payoutSchema.parse(req.body);
  const { produceDeliveryIds, ...payoutData } = data;

  const member = await prisma.member.findUniqueOrThrow({ where: { id: data.memberId } });
  if (member.cooperativeId !== req.params.id) {
    return res.status(400).json({ error: "Member does not belong to this cooperative" });
  }

  const payout = await prisma.payout.create({
    data: { ...payoutData, cooperativeId: req.params.id, recordedById: req.user.id },
  });

  if (produceDeliveryIds && produceDeliveryIds.length > 0) {
    await prisma.produceDelivery.updateMany({
      where: { id: { in: produceDeliveryIds }, cooperativeId: req.params.id, memberId: data.memberId },
      data: { paid: true, payoutId: payout.id },
    });
  }

  await recordAudit({
    userId: req.user.id,
    action: "RECORD_PAYOUT",
    entityType: "Payout",
    entityId: payout.id,
    metadata: { memberId: data.memberId, amount: data.amount, type: data.type },
  });

  res.status(201).json(payout);
}

// GET /cooperatives/:id/payouts/member-summary?from=&to= — per-member
// disbursement totals for a period. This is the drill-down layer the
// Director's national disbursement report links into: national -> county ->
// cooperative -> this endpoint (individual farmer compensation).
async function memberSummary(req, res) {
  const { from, to } = req.query;
  const payouts = await prisma.payout.findMany({
    where: {
      cooperativeId: req.params.id,
      ...(from || to
        ? {
            payoutDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: { member: { select: { id: true, legalName: true } } },
  });

  const byMember = new Map();
  for (const p of payouts) {
    const key = p.memberId;
    if (!byMember.has(key)) {
      byMember.set(key, { memberId: key, memberName: p.member.legalName, total: 0, payoutCount: 0 });
    }
    const entry = byMember.get(key);
    entry.total += Number(p.amount);
    entry.payoutCount += 1;
  }

  res.json([...byMember.values()].sort((a, b) => b.total - a.total));
}

module.exports = { listPayouts, recordPayout, memberSummary };
