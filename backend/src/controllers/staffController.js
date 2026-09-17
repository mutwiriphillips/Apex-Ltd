const bcrypt = require("bcryptjs");
const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");
const { toPublicUser } = require("./authController");

const createStaffSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["NATIONAL_ADMIN", "DIRECTOR", "SUBCOUNTY_OFFICER", "FIELD_OFFICER", "COOPERATIVE_MANAGER"]),
  countyId: z.string().uuid().optional(),
  jobGroup: z.string().optional(),
  designation: z.string().optional(),
  phoneNumber: z.string().optional(),
  subCounty: z.string().optional(),
  ward: z.string().optional(),
  reportsToId: z.string().uuid().optional(),
});

const updateStaffSchema = createStaffSchema.partial().omit({ password: true });

const permissionSchema = z.object({
  module: z.string().min(1),
  canView: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  canApprove: z.boolean().optional(),
});

async function listStaff(req, res) {
  const countyId = req.user.role === "NATIONAL_ADMIN" ? req.query.countyId : req.user.countyId;
  const staff = await prisma.user.findMany({
    where: countyId ? { countyId } : {},
    include: {
      permissions: true,
      county: { select: { id: true, name: true } },
      reportsTo: { select: { id: true, fullName: true } },
    },
    orderBy: { fullName: "asc" },
  });
  res.json(staff.map(toPublicUser));
}

async function getStaff(req, res) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { permissions: true },
  });
  res.json(toPublicUser(user));
}

async function createStaff(req, res) {
  const data = createStaffSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);

  // A County Director can only create staff within their own county; only a
  // NATIONAL_ADMIN may create staff for an arbitrary county (or another
  // NATIONAL_ADMIN / DIRECTOR account).
  const countyId = req.user.role === "NATIONAL_ADMIN" ? data.countyId : req.user.countyId;

  const user = await prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email,
      passwordHash,
      role: data.role,
      countyId,
      jobGroup: data.jobGroup,
      designation: data.designation,
      phoneNumber: data.phoneNumber,
      subCounty: data.subCounty,
      ward: data.ward,
      reportsToId: data.reportsToId,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "CREATE_STAFF",
    entityType: "User",
    entityId: user.id,
  });

  res.status(201).json(toPublicUser(user));
}

async function updateStaff(req, res) {
  const data = updateStaffSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
  });

  await recordAudit({
    userId: req.user.id,
    action: "UPDATE_STAFF",
    entityType: "User",
    entityId: user.id,
    metadata: data,
  });

  res.json(toPublicUser(user));
}

async function deactivateStaff(req, res) {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { active: false },
  });

  await recordAudit({
    userId: req.user.id,
    action: "DEACTIVATE_STAFF",
    entityType: "User",
    entityId: user.id,
  });

  res.json(toPublicUser(user));
}

async function setPermission(req, res) {
  const data = permissionSchema.parse(req.body);
  const permission = await prisma.permission.upsert({
    where: { userId_module: { userId: req.params.id, module: data.module } },
    update: data,
    create: { userId: req.params.id, ...data },
  });

  await recordAudit({
    userId: req.user.id,
    action: "SET_PERMISSION",
    entityType: "Permission",
    entityId: permission.id,
    metadata: data,
  });

  res.status(201).json(permission);
}

module.exports = {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  setPermission,
};
