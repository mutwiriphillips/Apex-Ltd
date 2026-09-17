/**
 * Unit tests for the credit scoring engine. Run directly:
 *   node src/utils/creditScore.test.js
 * No test framework dependency — plain assert, so it can run anywhere,
 * including this project's sandboxed CI without extra installs.
 */
const assert = require("assert");
const {
  WEIGHTS,
  ASSET_TRACKED_VALUE_CHAINS,
  bandFor,
  scoreContributionConsistency,
  scoreProduceConsistency,
  scoreGovernanceCompliance,
  scoreDocumentCompliance,
  scoreMembershipStability,
  scoreShareCapitalTrajectory,
  scoreAssetStability,
  computeCreditAssessment,
} = require("./creditScore");

const NOW = new Date("2026-08-06T00:00:00Z");
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log("Credit Scoring Engine — Unit Tests\n");

// ---------------------------------------------------------------------------
console.log("WEIGHTS");
test("weights sum to exactly 1.0", () => {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1.0) < 1e-9, `weights summed to ${total}, expected 1.0`);
});
test("ASSET_TRACKED_VALUE_CHAINS names exactly the four asset-shaped chains", () => {
  assert.deepStrictEqual(
    [...ASSET_TRACKED_VALUE_CHAINS].sort(),
    ["HOUSING", "LIVESTOCK", "POULTRY", "TRANSPORT"].sort()
  );
});

// ---------------------------------------------------------------------------
console.log("\nbandFor()");
test("100 maps to AA", () => assert.strictEqual(bandFor(100).band, "AA"));
test("85 (lower boundary) maps to AA", () => assert.strictEqual(bandFor(85).band, "AA"));
test("84 maps to A", () => assert.strictEqual(bandFor(84).band, "A"));
test("70 (lower boundary) maps to A", () => assert.strictEqual(bandFor(70).band, "A"));
test("55 maps to B", () => assert.strictEqual(bandFor(55).band, "B"));
test("40 maps to C", () => assert.strictEqual(bandFor(40).band, "C"));
test("0 maps to D", () => assert.strictEqual(bandFor(0).band, "D"));
test("39 maps to D, not C", () => assert.strictEqual(bandFor(39).band, "D"));

// ---------------------------------------------------------------------------
console.log("\nscoreContributionConsistency()");
test("zero members yields score 0, no crash", () => {
  const r = scoreContributionConsistency([], 0, NOW);
  assert.strictEqual(r.score, 0);
});
test("every member contributing every month for 12mo scores near 100", () => {
  const members = ["m1", "m2", "m3"];
  const contributions = [];
  for (const m of members) {
    for (let i = 0; i < 12; i++) {
      const d = new Date(NOW);
      d.setMonth(d.getMonth() - i);
      contributions.push({ memberId: m, contributionDate: d, amount: 500 });
    }
  }
  const r = scoreContributionConsistency(contributions, 3, NOW);
  assert.ok(r.score >= 95, `expected near-100, got ${r.score}`);
  assert.strictEqual(r.activeContributors, 3);
});
test("no contributions at all scores 0", () => {
  const r = scoreContributionConsistency([], 5, NOW);
  assert.strictEqual(r.score, 0);
});
test("half the members contributing once scores much lower than full coverage", () => {
  const contributions = [
    { memberId: "m1", contributionDate: NOW, amount: 100 },
  ];
  const r = scoreContributionConsistency(contributions, 2, NOW);
  assert.ok(r.score < 50, `expected low score for partial/one-off coverage, got ${r.score}`);
});

// ---------------------------------------------------------------------------
console.log("\nscoreProduceConsistency()");
test("zero members yields score 0, no crash", () => {
  const r = scoreProduceConsistency([], 0, NOW);
  assert.strictEqual(r.score, 0);
});
test("every member delivering produce every month for 12mo scores near 100", () => {
  const members = ["m1", "m2", "m3"];
  const deliveries = [];
  for (const m of members) {
    for (let i = 0; i < 12; i++) {
      const d = new Date(NOW);
      d.setMonth(d.getMonth() - i);
      deliveries.push({ memberId: m, deliveryDate: d, quantity: 50 });
    }
  }
  const r = scoreProduceConsistency(deliveries, 3, NOW);
  assert.ok(r.score >= 95, `expected near-100, got ${r.score}`);
  assert.strictEqual(r.activeDeliverers, 3);
});
test("no deliveries at all scores 0", () => {
  const r = scoreProduceConsistency([], 5, NOW);
  assert.strictEqual(r.score, 0);
});
test("is scored independently from contribution consistency (paying dues but never delivering produce)", () => {
  // A cooperative where members pay dues perfectly but deliver no produce
  // should score well on contributions and poorly on produce — the two
  // factors must not bleed into each other.
  const members = ["m1"];
  const contributions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(NOW);
    d.setMonth(d.getMonth() - i);
    contributions.push({ memberId: "m1", contributionDate: d, amount: 500 });
  }
  const contributionScore = scoreContributionConsistency(contributions, 1, NOW).score;
  const produceScore = scoreProduceConsistency([], 1, NOW).score;
  assert.ok(contributionScore >= 95, `expected high contribution score, got ${contributionScore}`);
  assert.strictEqual(produceScore, 0);
});

// ---------------------------------------------------------------------------
console.log("\nscoreGovernanceCompliance()");
test("no committees on record scores low (30)", () => {
  const r = scoreGovernanceCompliance([]);
  assert.strictEqual(r.score, 30);
});
test("fully compliant committee scores 100", () => {
  const r = scoreGovernanceCompliance([{ committeeType: "MANAGEMENT", status: "COMPLIANT", complianceOverride: false }]);
  assert.strictEqual(r.score, 100);
});
test("expired-term committee scores very low (10)", () => {
  const r = scoreGovernanceCompliance([{ committeeType: "MANAGEMENT", status: "TERM_EXPIRED", complianceOverride: false }]);
  assert.strictEqual(r.score, 10);
});
test("non-compliant WITH logged override scores higher than silent non-compliance", () => {
  const withOverride = scoreGovernanceCompliance([{ committeeType: "MANAGEMENT", status: "NON_COMPLIANT", complianceOverride: true }]);
  const withoutOverride = scoreGovernanceCompliance([{ committeeType: "MANAGEMENT", status: "NON_COMPLIANT", complianceOverride: false }]);
  assert.ok(withOverride.score > withoutOverride.score, "override should score better than silent violation");
});

// ---------------------------------------------------------------------------
console.log("\nscoreDocumentCompliance()");
test("all three core docs approved, no backlog scores 100", () => {
  const r = scoreDocumentCompliance([
    { docType: "BY_LAWS", status: "APPROVED" },
    { docType: "AUDIT_REPORT", status: "APPROVED" },
    { docType: "MEETING_MINUTES", status: "APPROVED" },
  ]);
  assert.strictEqual(r.score, 100);
  assert.deepStrictEqual(r.coreDocsMissing, []);
});
test("no documents at all scores 0", () => {
  const r = scoreDocumentCompliance([]);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.coreDocsMissing.length, 3);
});
test("pending backlog reduces score even if core docs approved", () => {
  const clean = scoreDocumentCompliance([
    { docType: "BY_LAWS", status: "APPROVED" },
    { docType: "AUDIT_REPORT", status: "APPROVED" },
    { docType: "MEETING_MINUTES", status: "APPROVED" },
  ]);
  const withBacklog = scoreDocumentCompliance([
    { docType: "BY_LAWS", status: "APPROVED" },
    { docType: "AUDIT_REPORT", status: "APPROVED" },
    { docType: "MEETING_MINUTES", status: "APPROVED" },
    { docType: "SPOT_CHECK_REPORT", status: "PENDING" },
    { docType: "SPOT_CHECK_REPORT", status: "PENDING" },
  ]);
  assert.ok(withBacklog.score < clean.score, "backlog should reduce score");
});

// ---------------------------------------------------------------------------
console.log("\nscoreMembershipStability()");
test("no members scores 0", () => {
  const r = scoreMembershipStability([], NOW);
  assert.strictEqual(r.score, 0);
});
test("established membership (5yr avg tenure, 20 members) scores near 100", () => {
  const members = Array.from({ length: 20 }, () => {
    const d = new Date(NOW);
    d.setFullYear(d.getFullYear() - 5);
    return { createdAt: d };
  });
  const r = scoreMembershipStability(members, NOW);
  assert.ok(r.score >= 95, `expected near-100, got ${r.score}`);
});
test("brand-new membership scores near 0", () => {
  const members = Array.from({ length: 20 }, () => ({ createdAt: NOW }));
  const r = scoreMembershipStability(members, NOW);
  assert.ok(r.score <= 5, `expected near-0, got ${r.score}`);
});
test("small membership (<10) is penalized relative to an otherwise identical larger one", () => {
  const makeMembers = (count) =>
    Array.from({ length: count }, () => {
      const d = new Date(NOW);
      d.setFullYear(d.getFullYear() - 3);
      return { createdAt: d };
    });
  const small = scoreMembershipStability(makeMembers(5), NOW);
  const large = scoreMembershipStability(makeMembers(20), NOW);
  assert.ok(small.score < large.score, "small cooperative should score lower than large with same tenure");
});

// ---------------------------------------------------------------------------
console.log("\nscoreShareCapitalTrajectory()");
test("no capital contributions ever scores neutral-low (40)", () => {
  const r = scoreShareCapitalTrajectory([], NOW);
  assert.strictEqual(r.score, 40);
});
test("growth from prior period to recent period scores above flat baseline (60)", () => {
  const sevenMonthsAgo = new Date(NOW); sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
  const twoMonthsAgo = new Date(NOW); twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const contributions = [
    { contributionDate: sevenMonthsAgo, amount: 1000, type: "SHARE_CAPITAL_TOPUP" },
    { contributionDate: twoMonthsAgo, amount: 2000, type: "SHARE_CAPITAL_TOPUP" },
  ];
  const r = scoreShareCapitalTrajectory(contributions, NOW);
  assert.ok(r.score > 60, `expected growth to score above flat baseline, got ${r.score}`);
});
test("decline from prior to recent period scores below flat baseline (60)", () => {
  const sevenMonthsAgo = new Date(NOW); sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
  const twoMonthsAgo = new Date(NOW); twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const contributions = [
    { contributionDate: sevenMonthsAgo, amount: 2000, type: "SHARE_CAPITAL_TOPUP" },
    { contributionDate: twoMonthsAgo, amount: 500, type: "SHARE_CAPITAL_TOPUP" },
  ];
  const r = scoreShareCapitalTrajectory(contributions, NOW);
  assert.ok(r.score < 60, `expected decline to score below flat baseline, got ${r.score}`);
});

// ---------------------------------------------------------------------------
console.log("\nscoreAssetStability()");
test("zero members yields score 0, no crash", () => {
  const r = scoreAssetStability([], [], 0, NOW);
  assert.strictEqual(r.score, 0);
});
test("no assets recorded yields score 0", () => {
  const r = scoreAssetStability([], [], 10, NOW);
  assert.strictEqual(r.score, 0);
});
test("full coverage, full survival, all recently evented scores near 100", () => {
  const assets = [
    { id: "a1", memberId: "m1", status: "ACTIVE" },
    { id: "a2", memberId: "m2", status: "ACTIVE" },
    { id: "a3", memberId: "m3", status: "ACTIVE" },
  ];
  const events = [
    { assetId: "a1", eventDate: NOW },
    { assetId: "a2", eventDate: NOW },
    { assetId: "a3", eventDate: NOW },
  ];
  const r = scoreAssetStability(assets, events, 3, NOW);
  assert.strictEqual(r.score, 100, `expected 100, got ${r.score}`);
});
test("high attrition (mostly deceased/written-off) scores low even with full coverage history", () => {
  const assets = [
    { id: "a1", memberId: "m1", status: "ACTIVE" },
    { id: "a2", memberId: "m1", status: "DECEASED" },
    { id: "a3", memberId: "m1", status: "DECEASED" },
    { id: "a4", memberId: "m1", status: "WRITTEN_OFF" },
  ];
  const r = scoreAssetStability(assets, [], 1, NOW);
  assert.ok(r.score < 50, `expected low score from high attrition, got ${r.score}`);
  assert.strictEqual(r.survivalRatio, 0.25);
});
test("assets with no recent events score lower than identical assets with recent events", () => {
  const assets = [{ id: "a1", memberId: "m1", status: "ACTIVE" }];
  const staleEvent = new Date(NOW);
  staleEvent.setFullYear(staleEvent.getFullYear() - 3);
  const withRecent = scoreAssetStability(assets, [{ assetId: "a1", eventDate: NOW }], 1, NOW);
  const withStale = scoreAssetStability(assets, [{ assetId: "a1", eventDate: staleEvent }], 1, NOW);
  assert.ok(withRecent.score > withStale.score, `expected recent-event score to beat stale-event score`);
});
test("coverage matters independently of survival — half the members with active assets scores below full coverage", () => {
  const fullCoverage = scoreAssetStability(
    [{ id: "a1", memberId: "m1", status: "ACTIVE" }, { id: "a2", memberId: "m2", status: "ACTIVE" }],
    [],
    2,
    NOW
  );
  const halfCoverage = scoreAssetStability(
    [{ id: "a1", memberId: "m1", status: "ACTIVE" }],
    [],
    2,
    NOW
  );
  assert.ok(halfCoverage.score < fullCoverage.score, "half coverage should score below full coverage");
});

// ---------------------------------------------------------------------------
console.log("\ncomputeCreditAssessment() — end-to-end scenarios");

test("a strong cooperative (all factors healthy) lands in band AA or A", () => {
  const members = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(NOW);
    d.setFullYear(d.getFullYear() - 4);
    return { createdAt: d, id: `m${i}` };
  });
  const contributions = [];
  const produceDeliveries = [];
  for (const m of members) {
    for (let i = 0; i < 12; i++) {
      const d = new Date(NOW);
      d.setMonth(d.getMonth() - i);
      contributions.push({ memberId: m.id, contributionDate: d, amount: 500, type: "MONTHLY_CONTRIBUTION" });
      produceDeliveries.push({ memberId: m.id, deliveryDate: d, quantity: 40 });
    }
  }
  const sevenMonthsAgo = new Date(NOW); sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
  const twoMonthsAgo = new Date(NOW); twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  contributions.push({ contributionDate: sevenMonthsAgo, amount: 5000, type: "SHARE_CAPITAL_TOPUP" });
  contributions.push({ contributionDate: twoMonthsAgo, amount: 8000, type: "SHARE_CAPITAL_TOPUP" });

  const committees = [{ committeeType: "MANAGEMENT", status: "COMPLIANT", complianceOverride: false }];
  const documents = [
    { docType: "BY_LAWS", status: "APPROVED" },
    { docType: "AUDIT_REPORT", status: "APPROVED" },
    { docType: "MEETING_MINUTES", status: "APPROVED" },
  ];

  const result = computeCreditAssessment({ contributions, produceDeliveries, committees, documents, members }, NOW);
  assert.ok(["AA", "A"].includes(result.band), `expected AA or A, got ${result.band} (score ${result.score})`);
  assert.ok(result.score >= 70, `expected score >= 70, got ${result.score}`);
});

test("a weak cooperative (no data, expired committee) lands in band D", () => {
  const result = computeCreditAssessment(
    {
      contributions: [],
      produceDeliveries: [],
      committees: [{ committeeType: "MANAGEMENT", status: "TERM_EXPIRED", complianceOverride: false }],
      documents: [],
      members: [{ createdAt: NOW, id: "m1" }],
    },
    NOW
  );
  assert.strictEqual(result.band, "D", `expected D, got ${result.band} (score ${result.score})`);
});

test("breakdown always includes all seven factor keys, even when asset stability is not applicable", () => {
  const result = computeCreditAssessment({ contributions: [], produceDeliveries: [], committees: [], documents: [], members: [], valueChain: "COFFEE" }, NOW);
  const keys = Object.keys(result.factors);
  assert.deepStrictEqual(
    keys.sort(),
    ["contributionConsistency", "produceConsistency", "documentCompliance", "governanceCompliance", "membershipStability", "shareCapitalTrajectory", "assetStability"].sort()
  );
  assert.strictEqual(result.factors.assetStability.applicable, false);
  assert.strictEqual(result.factors.assetStability.score, null);
});

test("for a non-asset-tracked value chain, effective weights exclude assetStability and still sum to 1.0", () => {
  const result = computeCreditAssessment({ contributions: [], produceDeliveries: [], committees: [], documents: [], members: [], valueChain: "COFFEE" }, NOW);
  assert.ok(!("assetStability" in result.weights), "assetStability should be absent from effective weights");
  const total = Object.values(result.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1.0) < 1e-9, `effective weights summed to ${total}, expected 1.0`);
});

test("for an asset-tracked value chain (LIVESTOCK), assetStability is applicable and included in weights", () => {
  const result = computeCreditAssessment(
    { contributions: [], produceDeliveries: [], committees: [], documents: [], members: [{ createdAt: NOW, id: "m1" }], assets: [], assetEvents: [], valueChain: "LIVESTOCK" },
    NOW
  );
  assert.strictEqual(result.factors.assetStability.applicable, true);
  assert.ok("assetStability" in result.weights);
  const total = Object.values(result.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1.0) < 1e-9, `weights summed to ${total}, expected 1.0`);
});

test("a healthy LIVESTOCK cooperative with a well-managed herd scores meaningfully higher than one with no asset records", () => {
  const members = Array.from({ length: 5 }, (_, i) => ({ createdAt: NOW, id: `m${i}` }));
  const goodAssets = members.map((m, i) => ({ id: `a${i}`, memberId: m.id, status: "ACTIVE" }));
  const goodEvents = goodAssets.map((a) => ({ assetId: a.id, eventDate: NOW }));

  const withHerd = computeCreditAssessment(
    { contributions: [], produceDeliveries: [], committees: [], documents: [], members, assets: goodAssets, assetEvents: goodEvents, valueChain: "LIVESTOCK" },
    NOW
  );
  const withoutHerd = computeCreditAssessment(
    { contributions: [], produceDeliveries: [], committees: [], documents: [], members, assets: [], assetEvents: [], valueChain: "LIVESTOCK" },
    NOW
  );
  assert.ok(
    withHerd.score > withoutHerd.score,
    `expected a well-managed herd to raise the score: with=${withHerd.score} without=${withoutHerd.score}`
  );
});

test("a coffee cooperative and an identical-data livestock cooperative with no herd score the same on every shared factor", () => {
  // Sanity check that applicability doesn't leak into the other six factors'
  // own scores — only into which weights apply.
  const coffee = computeCreditAssessment({ contributions: [], produceDeliveries: [], committees: [], documents: [], members: [], valueChain: "COFFEE" }, NOW);
  const livestockNoHerd = computeCreditAssessment({ contributions: [], produceDeliveries: [], committees: [], documents: [], members: [], assets: [], assetEvents: [], valueChain: "LIVESTOCK" }, NOW);
  for (const key of ["contributionConsistency", "produceConsistency", "governanceCompliance", "documentCompliance", "membershipStability", "shareCapitalTrajectory"]) {
    assert.strictEqual(coffee.factors[key].score, livestockNoHerd.factors[key].score, `factor ${key} should be identical`);
  }
});

test("disclaimer is always present (this platform never presents itself as a lender)", () => {
  const result = computeCreditAssessment({ contributions: [], produceDeliveries: [], committees: [], documents: [], members: [], valueChain: "COFFEE" }, NOW);
  assert.ok(result.disclaimer.includes("does not disburse funds"));
});

test("a cooperative strong on contributions but with zero produce deliveries scores meaningfully lower than one strong on both", () => {
  const members = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(NOW);
    d.setFullYear(d.getFullYear() - 3);
    return { createdAt: d, id: `m${i}` };
  });
  const baseContributions = [];
  const goodProduce = [];
  for (const m of members) {
    for (let i = 0; i < 12; i++) {
      const d = new Date(NOW);
      d.setMonth(d.getMonth() - i);
      baseContributions.push({ memberId: m.id, contributionDate: d, amount: 500, type: "MONTHLY_CONTRIBUTION" });
      goodProduce.push({ memberId: m.id, deliveryDate: d, quantity: 30 });
    }
  }
  const committees = [{ committeeType: "MANAGEMENT", status: "COMPLIANT", complianceOverride: false }];
  const documents = [
    { docType: "BY_LAWS", status: "APPROVED" },
    { docType: "AUDIT_REPORT", status: "APPROVED" },
    { docType: "MEETING_MINUTES", status: "APPROVED" },
  ];

  const withProduce = computeCreditAssessment(
    { contributions: baseContributions, produceDeliveries: goodProduce, committees, documents, members },
    NOW
  );
  const withoutProduce = computeCreditAssessment(
    { contributions: baseContributions, produceDeliveries: [], committees, documents, members },
    NOW
  );
  assert.ok(
    withProduce.score > withoutProduce.score,
    `expected produce activity to raise the score: with=${withProduce.score} without=${withoutProduce.score}`
  );
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
