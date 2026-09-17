const prisma = require("../config/db");

// Public: powers the landing page, signup form, and the dashboard county
// selector. No sensitive data — just the 47 official counties.
async function listCounties(req, res) {
  const counties = await prisma.county.findMany({
    orderBy: { name: "asc" },
  });
  res.json(counties);
}

// National rollup: cooperative counts per county, for NATIONAL_ADMIN and for
// the "coverage so far" panel on the dashboard. Cheap aggregate query.
async function countySummary(req, res) {
  const counties = await prisma.county.findMany({
    include: { _count: { select: { cooperatives: true, staff: true } } },
    orderBy: { name: "asc" },
  });

  res.json(
    counties.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      region: c.region,
      cooperativeCount: c._count.cooperatives,
      staffCount: c._count.staff,
    }))
  );
}

module.exports = { listCounties, countySummary };
