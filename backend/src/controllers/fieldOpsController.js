const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

// --- Leave requests ---

const leaveSchema = z.object({
  leaveType: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().optional(),
});

async function applyLeave(req, res) {
  const data = leaveSchema.parse(req.body);
  const leave = await prisma.leaveRequest.create({
    data: { ...data, applicantId: req.user.id },
  });
  res.status(201).json(leave);
}

async function listLeave(req, res) {
  const { mine } = req.query;
  const leaves = await prisma.leaveRequest.findMany({
    where: mine === "true" ? { applicantId: req.user.id } : {},
    include: { applicant: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(leaves);
}

async function decideLeave(req, res) {
  const { approve, decisionNote } = z
    .object({ approve: z.boolean(), decisionNote: z.string().optional() })
    .parse(req.body);

  const leave = await prisma.leaveRequest.update({
    where: { id: req.params.id },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      approverId: req.user.id,
      decisionNote,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: approve ? "APPROVE_LEAVE" : "REJECT_LEAVE",
    entityType: "LeaveRequest",
    entityId: leave.id,
  });

  res.json(leave);
}

// --- Field visit planner ---

const visitSchema = z.object({
  cooperativeId: z.string().uuid(),
  plannedDate: z.coerce.date(),
  purpose: z.string().min(1),
});

async function planVisit(req, res) {
  const data = visitSchema.parse(req.body);
  const visit = await prisma.fieldVisit.create({
    data: { ...data, officerId: req.user.id },
  });
  res.status(201).json(visit);
}

async function listVisits(req, res) {
  const { mine, status } = req.query;
  const visits = await prisma.fieldVisit.findMany({
    where: {
      ...(mine === "true" ? { officerId: req.user.id } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      officer: { select: { id: true, fullName: true } },
      cooperative: { select: { id: true, name: true } },
      report: true,
    },
    orderBy: { plannedDate: "desc" },
  });
  res.json(visits);
}

async function decideVisit(req, res) {
  const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
  const visit = await prisma.fieldVisit.update({
    where: { id: req.params.id },
    data: {
      status: approve ? "AUTHORIZED" : "REJECTED",
      approverId: req.user.id,
    },
  });
  res.json(visit);
}

const reportSchema = z.object({
  narrative: z.string().min(1),
  achievements: z.string().optional(),
  dataPoints: z.record(z.any()).optional(),
  nextActions: z.string().optional(),
});

async function submitVisitReport(req, res) {
  const data = reportSchema.parse(req.body);

  const report = await prisma.visitReport.create({
    data: { ...data, visitId: req.params.id },
  });

  await prisma.fieldVisit.update({
    where: { id: req.params.id },
    data: { status: "COMPLETED" },
  });

  res.status(201).json(report);
}

module.exports = {
  applyLeave,
  listLeave,
  decideLeave,
  planVisit,
  listVisits,
  decideVisit,
  submitVisitReport,
};
