const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

const PRODUCE_UNITS = ["KG", "LITERS", "BAGS", "CRATES", "OTHER"];

const produceSchema = z.object({
  memberId: z.string().uuid(),
  produceType: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(PRODUCE_UNITS).default("KG"),
  qualityGrade: z.string().optional(),
  ratePerUnit: z.number().nonnegative().optional(),
  deliveryDate: z.coerce.date(),
});

// GET /cooperatives/:id/produce?memberId=..&paid=true|false
async function listProduce(req, res) {
  const { memberId, paid } = req.query;
  const deliveries = await prisma.produceDelivery.findMany({
    where: {
      cooperativeId: req.params.id,
      ...(memberId ? { memberId } : {}),
      ...(paid !== undefined ? { paid: paid === "true" } : {}),
    },
    include: {
      member: { select: { id: true, legalName: true } },
      recordedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { deliveryDate: "desc" },
  });
  res.json(deliveries);
}

async function recordProduce(req, res) {
  const data = produceSchema.parse(req.body);

  const member = await prisma.member.findUniqueOrThrow({ where: { id: data.memberId } });
  if (member.cooperativeId !== req.params.id) {
    return res.status(400).json({ error: "Member does not belong to this cooperative" });
  }

  const totalValue = data.ratePerUnit != null ? data.quantity * data.ratePerUnit : null;

  const delivery = await prisma.produceDelivery.create({
    data: {
      ...data,
      totalValue,
      cooperativeId: req.params.id,
      recordedById: req.user.id,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "RECORD_PRODUCE_DELIVERY",
    entityType: "ProduceDelivery",
    entityId: delivery.id,
    metadata: { memberId: data.memberId, quantity: data.quantity, unit: data.unit },
  });

  res.status(201).json(delivery);
}

// GET /cooperatives/:id/produce/unpaid-summary — per-member outstanding
// balance owed for delivered-but-not-yet-paid produce. This is what feeds
// the "record a payout" flow: a manager sees who's owed what before paying.
async function unpaidSummary(req, res) {
  const deliveries = await prisma.produceDelivery.findMany({
    where: { cooperativeId: req.params.id, paid: false, totalValue: { not: null } },
    include: { member: { select: { id: true, legalName: true } } },
  });

  const byMember = new Map();
  for (const d of deliveries) {
    const key = d.memberId;
    if (!byMember.has(key)) {
      byMember.set(key, { memberId: key, memberName: d.member.legalName, totalOwed: 0, deliveryCount: 0 });
    }
    const entry = byMember.get(key);
    entry.totalOwed += Number(d.totalValue);
    entry.deliveryCount += 1;
  }

  res.json([...byMember.values()].sort((a, b) => b.totalOwed - a.totalOwed));
}

module.exports = { listProduce, recordProduce, unpaidSummary, PRODUCE_UNITS };
