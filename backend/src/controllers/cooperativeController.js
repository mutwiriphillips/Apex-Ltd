const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

const VALUE_CHAINS = [
  "COFFEE", "DAIRY", "MIRAA", "IRRIGATION", "TEA", "SUGARCANE", "COTTON",
  "CASHEWNUT", "FISHERIES", "LIVESTOCK", "POULTRY", "SACCO", "HOUSING",
  "TRANSPORT", "HANDICRAFTS", "OTHER",
];

const coopSchema = z.object({
  name: z.string().min(1),
  registrationNumber: z.string().min(1),
  valueChain: z.enum(VALUE_CHAINS),
  countyId: z.string().uuid(),
  subCounty: z.string().min(1),
  ward: z.string().min(1),
  managerId: z.string().uuid().optional().nullable(),
});

const memberSchema = z.object({
  legalName: z.string().min(1),
  nationalId: z.string().min(1),
  phoneNumber: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]),
  shareCapital: z.number().nonnegative().default(0),
});

// County-scoped staff (everyone except NATIONAL_ADMIN) only ever see/act on
// their own county's cooperatives, enforced server-side regardless of what
// the client sends.
function scopedCountyId(req) {
  return req.user.role === "NATIONAL_ADMIN" ? null : req.user.countyId;
}

// GET /cooperatives?countyId=..&valueChain=COFFEE&subCounty=..&ward=..&q=search
async function listCooperatives(req, res) {
  const { valueChain, subCounty, ward, q } = req.query;
  const forcedCountyId = scopedCountyId(req);
  const countyId = forcedCountyId || req.query.countyId;

  const cooperatives = await prisma.cooperative.findMany({
    where: {
      ...(countyId ? { countyId } : {}),
      ...(valueChain ? { valueChain } : {}),
      ...(subCounty ? { subCounty } : {}),
      ...(ward ? { ward } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      manager: { select: { id: true, fullName: true } },
      county: { select: { id: true, name: true } },
      _count: { select: { members: true, documents: true } },
    },
    orderBy: { name: "asc" },
  });

  res.json(cooperatives);
}

async function getCooperative(req, res) {
  const coop = await prisma.cooperative.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      manager: { select: { id: true, fullName: true } },
      county: { select: { id: true, name: true } },
      members: true,
      documents: true,
      committees: { include: { members: true, signatories: true } },
      agms: true,
    },
  });
  res.json(coop);
}

async function createCooperative(req, res) {
  const data = coopSchema.parse(req.body);
  const forcedCountyId = scopedCountyId(req);

  const coop = await prisma.cooperative.create({
    data: forcedCountyId ? { ...data, countyId: forcedCountyId } : data,
  });

  await recordAudit({
    userId: req.user.id,
    action: "CREATE_COOPERATIVE",
    entityType: "Cooperative",
    entityId: coop.id,
  });

  res.status(201).json(coop);
}

async function updateCooperative(req, res) {
  const data = coopSchema.partial().parse(req.body);
  const coop = await prisma.cooperative.update({
    where: { id: req.params.id },
    data,
  });

  await recordAudit({
    userId: req.user.id,
    action: "UPDATE_COOPERATIVE",
    entityType: "Cooperative",
    entityId: coop.id,
    metadata: data,
  });

  res.json(coop);
}

async function deleteCooperative(req, res) {
  await prisma.cooperative.delete({ where: { id: req.params.id } });
  await recordAudit({
    userId: req.user.id,
    action: "DELETE_COOPERATIVE",
    entityType: "Cooperative",
    entityId: req.params.id,
  });
  res.status(204).send();
}

// --- Members ---

async function listMembers(req, res) {
  const members = await prisma.member.findMany({
    where: { cooperativeId: req.params.id },
    orderBy: { legalName: "asc" },
  });
  res.json(members);
}

async function addMember(req, res) {
  const data = memberSchema.parse(req.body);
  const member = await prisma.member.create({
    data: { ...data, cooperativeId: req.params.id },
  });

  await recordAudit({
    userId: req.user.id,
    action: "ADD_MEMBER",
    entityType: "Member",
    entityId: member.id,
    metadata: { cooperativeId: req.params.id },
  });

  res.status(201).json(member);
}

async function updateMember(req, res) {
  const data = memberSchema.partial().parse(req.body);
  const member = await prisma.member.update({
    where: { id: req.params.memberId },
    data,
  });
  res.json(member);
}

async function removeMember(req, res) {
  await prisma.member.delete({ where: { id: req.params.memberId } });
  res.status(204).send();
}

module.exports = {
  VALUE_CHAINS,
  listCooperatives,
  getCooperative,
  createCooperative,
  updateCooperative,
  deleteCooperative,
  listMembers,
  addMember,
  updateMember,
  removeMember,
};
