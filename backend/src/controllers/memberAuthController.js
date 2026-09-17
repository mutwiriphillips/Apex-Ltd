const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../config/db");
const { recordAudit } = require("../utils/audit");

const registerSchema = z.object({
  cooperativeId: z.string().uuid(),
  nationalId: z.string().min(1),
  phoneNumber: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  nationalId: z.string().min(1),
  password: z.string().min(1),
});

function signMemberToken(account) {
  return jwt.sign({ sub: account.id, type: "member" }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
}

function toPublicMember(member, account) {
  return {
    memberId: member.id,
    legalName: member.legalName,
    gender: member.gender,
    shareCapital: member.shareCapital,
    joinedAt: member.createdAt,
    cooperative: member.cooperative
      ? {
          id: member.cooperative.id,
          name: member.cooperative.name,
          valueChain: member.cooperative.valueChain,
          registrationNumber: member.cooperative.registrationNumber,
        }
      : undefined,
    account: {
      id: account.id,
      phoneNumber: account.phoneNumber,
      email: account.email,
    },
  };
}

/**
 * Registration verifies the submitted National ID + cooperative selection
 * against an existing Member record that staff already created (via the
 * Cooperative Manager or Field Officer member-roll entry) — see
 * cooperativeController.addMember. This platform has no integration with
 * IPRS or any external government ID registry; "verification" here means
 * matching against the cooperative's own membership records, which is the
 * only ground truth this system actually has. That is a deliberate,
 * documented scope boundary, not an oversight — wiring a real eCitizen/IPRS
 * check would need a separate government-facing agreement.
 */
async function register(req, res) {
  const data = registerSchema.parse(req.body);

  const member = await prisma.member.findUnique({
    where: { cooperativeId_nationalId: { cooperativeId: data.cooperativeId, nationalId: data.nationalId } },
    include: { account: true },
  });

  if (!member) {
    return res.status(404).json({
      error: "No member record found matching that National ID for the selected cooperative. Ask your Cooperative Manager or Field Officer to confirm your registration first.",
    });
  }

  if (member.account) {
    return res.status(409).json({ error: "An account already exists for this member. Please log in instead." });
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const account = await prisma.memberAccount.create({
    data: {
      memberId: member.id,
      nationalId: data.nationalId,
      phoneNumber: data.phoneNumber,
      email: data.email,
      passwordHash,
    },
  });

  await recordAudit({
    action: "MEMBER_SELF_REGISTER",
    entityType: "MemberAccount",
    entityId: account.id,
    metadata: { memberId: member.id, cooperativeId: data.cooperativeId },
  });

  const memberWithCoop = await prisma.member.findUnique({
    where: { id: member.id },
    include: { cooperative: true },
  });

  const token = signMemberToken(account);
  res.status(201).json({ token, member: toPublicMember(memberWithCoop, account) });
}

async function login(req, res) {
  const { nationalId, password } = loginSchema.parse(req.body);

  const account = await prisma.memberAccount.findUnique({
    where: { nationalId },
    include: { member: { include: { cooperative: true } } },
  });

  if (!account || !account.active) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  await prisma.memberAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });

  const token = signMemberToken(account);
  res.json({ token, member: toPublicMember(account.member, account) });
}

async function me(req, res) {
  res.json({ member: toPublicMember(req.member, req.memberAccount) });
}

module.exports = { register, login, me, toPublicMember };
