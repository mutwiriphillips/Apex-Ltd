const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

const ASSET_TYPES = ["LIVESTOCK", "POULTRY", "VEHICLE", "PROPERTY_UNIT", "OTHER"];
const ASSET_STATUSES = ["ACTIVE", "TRANSFERRED", "SOLD", "DECEASED", "WRITTEN_OFF"];
const ASSET_EVENT_TYPES = ["ACQUIRED", "TRANSFERRED", "SOLD", "DECEASED", "WRITTEN_OFF", "VALUATION_UPDATE", "HEALTH_CHECK"];

// Lifecycle event types that also close out the asset itself — recording one
// of these updates Asset.status so "how many assets are actually active
// right now" never depends on someone remembering to flip a separate field.
const STATUS_CLOSING_EVENTS = {
  TRANSFERRED: "TRANSFERRED",
  SOLD: "SOLD",
  DECEASED: "DECEASED",
  WRITTEN_OFF: "WRITTEN_OFF",
};

const assetSchema = z.object({
  memberId: z.string().uuid(),
  assetType: z.enum(ASSET_TYPES),
  identifier: z.string().min(1),
  description: z.string().optional(),
  acquisitionDate: z.coerce.date(),
  acquisitionValue: z.number().nonnegative().optional(),
});

const assetEventSchema = z.object({
  eventType: z.enum(ASSET_EVENT_TYPES),
  eventDate: z.coerce.date(),
  notes: z.string().optional(),
  valueAtEvent: z.number().nonnegative().optional(),
});

// GET /cooperatives/:id/assets?memberId=..&assetType=..&status=..
async function listAssets(req, res) {
  const { memberId, assetType, status } = req.query;
  const assets = await prisma.asset.findMany({
    where: {
      cooperativeId: req.params.id,
      ...(memberId ? { memberId } : {}),
      ...(assetType ? { assetType } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      member: { select: { id: true, legalName: true } },
      recordedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { acquisitionDate: "desc" },
  });
  res.json(assets);
}

async function recordAsset(req, res) {
  const data = assetSchema.parse(req.body);

  const member = await prisma.member.findUniqueOrThrow({ where: { id: data.memberId } });
  if (member.cooperativeId !== req.params.id) {
    return res.status(400).json({ error: "Member does not belong to this cooperative" });
  }

  const asset = await prisma.asset.create({
    data: {
      ...data,
      currentValue: data.acquisitionValue ?? null,
      cooperativeId: req.params.id,
      recordedById: req.user.id,
    },
  });

  // The acquisition itself is the first lifecycle event, logged automatically
  // so an asset's event history is always complete from day one.
  await prisma.assetEvent.create({
    data: {
      assetId: asset.id,
      eventType: "ACQUIRED",
      eventDate: data.acquisitionDate,
      valueAtEvent: data.acquisitionValue ?? null,
      recordedById: req.user.id,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "RECORD_ASSET",
    entityType: "Asset",
    entityId: asset.id,
    metadata: { memberId: data.memberId, assetType: data.assetType, identifier: data.identifier },
  });

  res.status(201).json(asset);
}

// GET /cooperatives/:id/assets/:assetId/events
async function listAssetEvents(req, res) {
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: req.params.assetId } });
  if (asset.cooperativeId !== req.params.id) {
    return res.status(404).json({ error: "Asset not found in this cooperative" });
  }

  const events = await prisma.assetEvent.findMany({
    where: { assetId: req.params.assetId },
    include: { recordedBy: { select: { id: true, fullName: true } } },
    orderBy: { eventDate: "desc" },
  });
  res.json(events);
}

// POST /cooperatives/:id/assets/:assetId/events — the actual lifecycle
// trail. A closing event type (sold/deceased/transferred/written-off) also
// updates the asset's own status; a VALUATION_UPDATE refreshes currentValue;
// HEALTH_CHECK is a pure record with no side effect on status or value.
async function recordAssetEvent(req, res) {
  const data = assetEventSchema.parse(req.body);

  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: req.params.assetId } });
  if (asset.cooperativeId !== req.params.id) {
    return res.status(404).json({ error: "Asset not found in this cooperative" });
  }

  const event = await prisma.assetEvent.create({
    data: { ...data, assetId: asset.id, recordedById: req.user.id },
  });

  const assetUpdate = {};
  if (STATUS_CLOSING_EVENTS[data.eventType]) {
    assetUpdate.status = STATUS_CLOSING_EVENTS[data.eventType];
  }
  if (data.eventType === "VALUATION_UPDATE" && data.valueAtEvent != null) {
    assetUpdate.currentValue = data.valueAtEvent;
  }
  if (Object.keys(assetUpdate).length > 0) {
    await prisma.asset.update({ where: { id: asset.id }, data: assetUpdate });
  }

  await recordAudit({
    userId: req.user.id,
    action: "RECORD_ASSET_EVENT",
    entityType: "AssetEvent",
    entityId: event.id,
    metadata: { assetId: asset.id, eventType: data.eventType },
  });

  res.status(201).json({ event, assetStatus: assetUpdate.status || asset.status });
}

// GET /cooperatives/:id/assets/statement?memberId=.. — an exportable,
// per-member asset statement: exactly what a farmer or their cooperative
// would hand to a lender alongside the credit-readiness report.
async function memberAssetStatement(req, res) {
  const { memberId } = req.query;
  if (!memberId) {
    return res.status(400).json({ error: "memberId is required" });
  }

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  if (member.cooperativeId !== req.params.id) {
    return res.status(400).json({ error: "Member does not belong to this cooperative" });
  }

  const assets = await prisma.asset.findMany({
    where: { memberId },
    include: { events: { orderBy: { eventDate: "asc" } } },
    orderBy: { acquisitionDate: "asc" },
  });

  const activeAssets = assets.filter((a) => a.status === "ACTIVE");
  const totalCurrentValue = activeAssets.reduce((sum, a) => sum + Number(a.currentValue || a.acquisitionValue || 0), 0);

  res.json({
    member: { id: member.id, legalName: member.legalName, nationalId: member.nationalId },
    generatedAt: new Date().toISOString(),
    totalActiveAssets: activeAssets.length,
    totalCurrentValue,
    assets,
  });
}

module.exports = {
  listAssets,
  recordAsset,
  listAssetEvents,
  recordAssetEvent,
  memberAssetStatement,
  ASSET_TYPES,
  ASSET_STATUSES,
  ASSET_EVENT_TYPES,
};
