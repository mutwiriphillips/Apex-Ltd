const prisma = require("../config/db");

// GET /api/reports/disbursements?from=&to=&countyId=
// County-scoped rollup of money disbursed OUT to farmers, grouped by
// cooperative. This is the top level of the trickle-down view:
// National (all counties, National Admin only) -> County -> Cooperative.
// Drilling further into individual farmer amounts happens per-cooperative
// via GET /cooperatives/:id/payouts/member-summary.
async function disbursementSummary(req, res) {
  const { from, to } = req.query;

  // Same county-scoping principle as the rest of the app: non-National-Admin
  // roles are always forced to their own county, regardless of query params.
  const countyId = req.user.role === "NATIONAL_ADMIN" ? req.query.countyId : req.user.countyId;

  const dateFilter =
    from || to
      ? {
          payoutDate: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {};

  const payouts = await prisma.payout.findMany({
    where: {
      ...dateFilter,
      cooperative: countyId ? { countyId } : {},
    },
    select: {
      amount: true,
      cooperativeId: true,
      cooperative: { select: { id: true, name: true, county: { select: { id: true, name: true } } } },
    },
  });

  const byCooperative = new Map();
  for (const p of payouts) {
    const key = p.cooperativeId;
    if (!byCooperative.has(key)) {
      byCooperative.set(key, {
        cooperativeId: key,
        cooperativeName: p.cooperative.name,
        countyName: p.cooperative.county?.name,
        total: 0,
        payoutCount: 0,
      });
    }
    const entry = byCooperative.get(key);
    entry.total += Number(p.amount);
    entry.payoutCount += 1;
  }

  const byCooperativeArr = [...byCooperative.values()].sort((a, b) => b.total - a.total);
  const totalDisbursed = byCooperativeArr.reduce((sum, c) => sum + c.total, 0);

  res.json({
    totalDisbursed,
    cooperativeCount: byCooperativeArr.length,
    periodFrom: from || null,
    periodTo: to || null,
    byCooperative: byCooperativeArr,
  });
}

module.exports = { disbursementSummary };
