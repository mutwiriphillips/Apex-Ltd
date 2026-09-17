/**
 * Pilot / test-run seed — exactly what's needed to demo the system with:
 *   - 1 National Admin account (cross-county oversight)
 *   - 1 County Director (Embu — the original pilot county)
 *   - 1 County employee (Field Officer, Embu)
 *   - 1 Cooperative Manager (Embu)
 *   - 1 Cooperative, in Embu County, with the manager attached
 *
 * Requires the 47 counties to already exist — run seed-counties.js first
 * (this script also runs it for you via ensureCounties()).
 *
 * Run with: node prisma/seed-pilot.js
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { execSync } = require("child_process");

const prisma = new PrismaClient();
const PILOT_PASSWORD = "Pilot2026!";

async function ensureCounties() {
  const count = await prisma.county.count();
  if (count === 0) {
    console.log("No counties found — seeding all 47 first...");
    execSync("node prisma/seed-counties.js", { stdio: "inherit" });
  }
}

async function main() {
  await ensureCounties();

  const embu = await prisma.county.findUniqueOrThrow({ where: { code: "014" } });
  const passwordHash = await bcrypt.hash(PILOT_PASSWORD, 10);

  const nationalAdmin = await prisma.user.upsert({
    where: { email: "admin@cooperatives.go.ke" },
    update: {},
    create: {
      fullName: "National Cooperatives Admin",
      email: "admin@cooperatives.go.ke",
      passwordHash,
      role: "NATIONAL_ADMIN",
      designation: "State Department for Co-operatives",
    },
  });

  const director = await prisma.user.upsert({
    where: { email: "director@embu.go.ke" },
    update: {},
    create: {
      fullName: "Embu County Director",
      email: "director@embu.go.ke",
      passwordHash,
      role: "DIRECTOR",
      countyId: embu.id,
      designation: "Director, Co-operative Development",
      reportsToId: nationalAdmin.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "employee@embu.go.ke" },
    update: {},
    create: {
      fullName: "Test Field Officer",
      email: "employee@embu.go.ke",
      passwordHash,
      role: "FIELD_OFFICER",
      countyId: embu.id,
      designation: "Field Officer",
      subCounty: "Runyenjes",
      ward: "Kagaari South",
      reportsToId: director.id,
      permissions: {
        create: [
          { module: "cooperatives", canView: true, canEdit: false },
          { module: "documents", canView: true, canEdit: true },
          { module: "governance", canView: true, canEdit: false },
        ],
      },
    },
  });

  const cooperative = await prisma.cooperative.upsert({
    where: { registrationNumber: "EMB-PILOT-0001" },
    update: {},
    create: {
      name: "Kirimiri Coffee Growers Cooperative Society",
      registrationNumber: "EMB-PILOT-0001",
      valueChain: "COFFEE",
      countyId: embu.id,
      subCounty: "Runyenjes",
      ward: "Kagaari South",
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@embu.go.ke" },
    update: {},
    create: {
      fullName: "Test Cooperative Manager",
      email: "manager@embu.go.ke",
      passwordHash,
      role: "COOPERATIVE_MANAGER",
      countyId: embu.id,
      designation: "Cooperative Manager",
      subCounty: "Runyenjes",
      ward: "Kagaari South",
      permissions: {
        create: [
          { module: "cooperatives", canView: true, canEdit: true },
          { module: "documents", canView: true, canEdit: true },
          { module: "governance", canView: true, canEdit: true },
        ],
      },
    },
  });

  await prisma.cooperative.update({
    where: { id: cooperative.id },
    data: { managerId: manager.id },
  });

  // A handful of contributions so the credit scoring engine has real inputs
  // to work with immediately, rather than every pilot cooperative starting
  // from an all-zero assessment.
  const sampleMember = await prisma.member.findFirst({ where: { cooperativeId: cooperative.id } });
  if (!sampleMember) {
    const seededMember = await prisma.member.create({
      data: {
        cooperativeId: cooperative.id,
        legalName: "Test Member",
        nationalId: "PILOT-0001",
        gender: "FEMALE",
        shareCapital: 5000,
      },
    });
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      await prisma.contribution.create({
        data: {
          memberId: seededMember.id,
          cooperativeId: cooperative.id,
          amount: 500,
          type: "MONTHLY_CONTRIBUTION",
          method: "CASH",
          contributionDate: d,
          recordedById: manager.id,
        },
      });
    }

    // Sample produce deliveries + a payout settling some of them, so the
    // Produce/Payouts tabs and the Director's disbursement report have
    // something real to show on first login, not an empty state.
    const deliveries = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const delivery = await prisma.produceDelivery.create({
        data: {
          memberId: seededMember.id,
          cooperativeId: cooperative.id,
          produceType: "Coffee Cherries",
          quantity: 120,
          unit: "KG",
          qualityGrade: "AA",
          ratePerUnit: 80,
          totalValue: 120 * 80,
          deliveryDate: d,
          recordedById: manager.id,
        },
      });
      deliveries.push(delivery);
    }

    // Pay out the oldest two deliveries, leave the most recent one unpaid
    // so the "outstanding balance" UI has something to display too.
    const settled = deliveries.slice(1);
    const payout = await prisma.payout.create({
      data: {
        memberId: seededMember.id,
        cooperativeId: cooperative.id,
        amount: settled.reduce((sum, d) => sum + Number(d.totalValue), 0),
        type: "PRODUCE_PAYMENT",
        method: "MPESA",
        periodLabel: "Pilot seed payout",
        payoutDate: now,
        recordedById: manager.id,
      },
    });
    await prisma.produceDelivery.updateMany({
      where: { id: { in: settled.map((d) => d.id) } },
      data: { paid: true, payoutId: payout.id },
    });

    // Member self-service account for the seeded Test Member, so the pilot
    // can demo the Member Portal immediately without registering by hand.
    const existingAccount = await prisma.memberAccount.findUnique({ where: { memberId: seededMember.id } });
    if (!existingAccount) {
      await prisma.memberAccount.create({
        data: {
          memberId: seededMember.id,
          nationalId: seededMember.nationalId,
          phoneNumber: "+254700000001",
          passwordHash,
        },
      });
    }
  }

  console.log("Pilot seed complete. All accounts share the password:", PILOT_PASSWORD);
  console.log(`  National Admin: admin@cooperatives.go.ke`);
  console.log(`  County Director (Embu): director@embu.go.ke`);
  console.log(`  Employee (Field Officer): employee@embu.go.ke`);
  console.log(`  Manager: manager@embu.go.ke`);
  console.log(`  Cooperative: ${cooperative.name} (${cooperative.registrationNumber}) — Embu County`);
  console.log(`  Member Portal login: National ID "PILOT-0001", password "${PILOT_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
