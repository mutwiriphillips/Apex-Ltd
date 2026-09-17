const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB default cap; confirm policy in Phase 1

const uploadSchema = z.object({
  docType: z.enum([
    "BY_LAWS",
    "MEETING_MINUTES",
    "CODE_OF_CONDUCT",
    "AUDIT_REPORT",
    "SPOT_CHECK_REPORT",
    "OTHER",
  ]),
  title: z.string().min(1),
  storageKey: z.string().min(1), // returned by the object-storage upload step
  fileSizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});

// GET /cooperatives/:id/documents?status=PENDING
async function listDocuments(req, res) {
  const { status } = req.query;
  const documents = await prisma.document.findMany({
    where: {
      cooperativeId: req.params.id,
      ...(status ? { status } : {}),
    },
    include: {
      uploadedBy: { select: { id: true, fullName: true } },
      reviewedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(documents);
}

// Any authenticated cooperative manager / field staff can upload; enters PENDING quarantine.
async function uploadDocument(req, res) {
  const data = uploadSchema.parse(req.body);

  const document = await prisma.document.create({
    data: {
      ...data,
      cooperativeId: req.params.id,
      uploadedById: req.user.id,
      status: "PENDING",
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: "UPLOAD_DOCUMENT",
    entityType: "Document",
    entityId: document.id,
  });

  res.status(201).json(document);
}

// Tier 1: Sub-county officer reviews (PENDING -> REVIEWED or REJECTED)
async function reviewDocument(req, res) {
  const { approve, note } = z.object({ approve: z.boolean(), note: z.string().optional() }).parse(req.body);

  const doc = await prisma.document.findUniqueOrThrow({ where: { id: req.params.docId } });
  if (doc.status !== "PENDING") {
    return res.status(409).json({ error: `Document must be PENDING to review (current: ${doc.status})` });
  }

  const updated = await prisma.document.update({
    where: { id: req.params.docId },
    data: {
      status: approve ? "REVIEWED" : "REJECTED",
      reviewedById: req.user.id,
      reviewedAt: new Date(),
      rejectionNote: approve ? null : note,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: approve ? "REVIEW_DOCUMENT_APPROVE" : "REVIEW_DOCUMENT_REJECT",
    entityType: "Document",
    entityId: updated.id,
  });

  res.json(updated);
}

// Tier 2: Director sign-off (REVIEWED -> APPROVED or REJECTED)
async function approveDocument(req, res) {
  const { approve, note } = z.object({ approve: z.boolean(), note: z.string().optional() }).parse(req.body);

  const doc = await prisma.document.findUniqueOrThrow({ where: { id: req.params.docId } });
  if (doc.status !== "REVIEWED") {
    return res.status(409).json({ error: `Document must be REVIEWED before Director sign-off (current: ${doc.status})` });
  }

  const updated = await prisma.document.update({
    where: { id: req.params.docId },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      approvedById: req.user.id,
      approvedAt: new Date(),
      rejectionNote: approve ? null : note,
    },
  });

  await recordAudit({
    userId: req.user.id,
    action: approve ? "APPROVE_DOCUMENT" : "REJECT_DOCUMENT",
    entityType: "Document",
    entityId: updated.id,
  });

  res.json(updated);
}

async function deleteDocument(req, res) {
  await prisma.document.delete({ where: { id: req.params.docId } });
  res.status(204).send();
}

module.exports = { listDocuments, uploadDocument, reviewDocument, approveDocument, deleteDocument };
