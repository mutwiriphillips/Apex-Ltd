/**
 * Credit Readiness Scoring Engine
 * ---------------------------------------------------------------------------
 * IMPORTANT — scope: this system is a TRUST LAYER, not a lender. It never
 * disburses funds. It produces a transparent, exportable creditworthiness
 * signal that a cooperative can present to a bank, SACCO apex body, or
 * micro-lender (Equity, Co-op Bank, KWFT, AFC, etc). The lending decision,
 * underwriting, and disbursement remain entirely with that third party.
 *
 * The composite score (0-100) is a weighted blend of factors, each
 * independently computed and returned in the breakdown so a lender can see
 * exactly what drove the number — nothing is a black box.
 *
 *   1. Contribution consistency  (18%) — how regularly members pay in
 *   2. Produce consistency       (18%) — how regularly/reliably members deliver produce
 *   3. Governance compliance     (17%) — 1/3 rule + committee term status
 *   4. Document compliance       (13%) — required legal filings, approved
 *   5. Membership stability      (13%) — tenure and growth, not just size
 *   6. Share capital trajectory  (9%)  — is capital growing or eroding
 *   7. Asset stability           (12%) — herd/fleet/property record health,
 *      LIVESTOCK / POULTRY / HOUSING / TRANSPORT cooperatives only
 *
 * Weights are deliberately conservative toward governance and compliance
 * over raw financial size — a small, well-governed cooperative should score
 * better than a large, non-compliant one. This mirrors how real credit
 * assessors weight institutional risk for group lending. Produce and
 * contribution consistency are weighted equally since for an agricultural
 * cooperative, what members actually deliver is as strong a productivity
 * signal as what they pay in.
 *
 * Asset stability is conditional, not universal: it only applies to the four
 * value chains where members hold a discrete tracked asset (a dairy cow, a
 * boda boda, a housing unit). For every other cooperative, this factor is
 * absent from the breakdown entirely — not scored as zero, not silently
 * dropped — and its weight is proportionally redistributed across the other
 * six so they still sum to exactly 1.0. A coffee cooperative is never
 * penalized for not owning a herd; a livestock cooperative that never
 * records events is scored on the same principle as an agricultural
 * cooperative with no produce data: the factor exists, and it's low, because
 * there's nothing to show.
 */

const WEIGHTS = {
  contributionConsistency: 0.18,
  produceConsistency: 0.18,
  governanceCompliance: 0.17,
  documentCompliance: 0.13,
  membershipStability: 0.13,
  shareCapitalTrajectory: 0.09,
  assetStability: 0.12,
};

// Value chains where a member's holdings are a discrete tracked asset
// (Asset/AssetEvent models) rather than consumable produce. Kept here, next
// to WEIGHTS, since the two are the only things that decide applicability.
const ASSET_TRACKED_VALUE_CHAINS = ["LIVESTOCK", "POULTRY", "HOUSING", "TRANSPORT"];

const BANDS = [
  { min: 85, band: "AA", label: "Excellent — strong candidate for lender referral" },
  { min: 70, band: "A", label: "Good — creditworthy with standard terms" },
  { min: 55, band: "B", label: "Fair — creditworthy with closer lender review" },
  { min: 40, band: "C", label: "Weak — significant gaps, unlikely to qualify without remediation" },
  { min: 0, band: "D", label: "Poor — not currently recommended for lender referral" },
];

function bandFor(score) {
  return BANDS.find((b) => score >= b.min);
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Factor 1: Contribution consistency over the trailing 12 months.
 * Rewards regular, predictable contributions across the membership, not just
 * total volume — a cooperative where everyone pays a little, reliably, is a
 * better credit signal than one with a few large but sporadic payers.
 *
 * @param {Array<{memberId: string, contributionDate: Date|string, amount: number}>} contributions
 * @param {number} memberCount
 * @param {Date} now
 */
function scoreContributionConsistency(contributions, memberCount, now = new Date()) {
  if (memberCount === 0) {
    return { score: 0, activeContributors: 0, expectedMonths: 12, coverageRatio: 0, note: "No members recorded." };
  }

  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const recent = contributions.filter((c) => new Date(c.contributionDate) >= twelveMonthsAgo);

  // Coverage: what fraction of members contributed at all in the window.
  const contributingMembers = new Set(recent.map((c) => c.memberId));
  const coverageRatio = contributingMembers.size / memberCount;

  // Regularity: for members who did contribute, how many distinct months did
  // they contribute in, out of the last 12 (proxy for "pays reliably" vs
  // "paid once and vanished").
  const monthsByMember = new Map();
  for (const c of recent) {
    const d = new Date(c.contributionDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthsByMember.has(c.memberId)) monthsByMember.set(c.memberId, new Set());
    monthsByMember.get(c.memberId).add(key);
  }
  const avgMonthsActive = monthsByMember.size
    ? [...monthsByMember.values()].reduce((sum, set) => sum + set.size, 0) / monthsByMember.size
    : 0;
  const regularityRatio = clamp(avgMonthsActive / 12, 0, 1);

  // Composite: coverage matters most (does the whole membership participate),
  // regularity is a secondary multiplier on top of that.
  const score = clamp(Math.round((coverageRatio * 0.6 + regularityRatio * 0.4) * 100));

  return {
    score,
    activeContributors: contributingMembers.size,
    totalMembers: memberCount,
    coverageRatio: Number(coverageRatio.toFixed(2)),
    avgMonthsActiveOutOf12: Number(avgMonthsActive.toFixed(1)),
  };
}

/**
 * Factor 2: Produce consistency — the agricultural counterpart to
 * contribution consistency. Measures how much of the membership delivers
 * produce regularly over the trailing 12 months, using the same
 * coverage + regularity model. A member who pays their dues but never
 * delivers coffee (or vice versa) is a genuinely different risk profile
 * than one who does both — this is why the two factors are scored and
 * weighted independently rather than merged.
 *
 * @param {Array<{memberId: string, deliveryDate: Date|string, quantity: number}>} deliveries
 * @param {number} memberCount
 * @param {Date} now
 */
function scoreProduceConsistency(deliveries, memberCount, now = new Date()) {
  if (memberCount === 0) {
    return { score: 0, activeDeliverers: 0, expectedMonths: 12, coverageRatio: 0, note: "No members recorded." };
  }

  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const recent = deliveries.filter((d) => new Date(d.deliveryDate) >= twelveMonthsAgo);

  const deliveringMembers = new Set(recent.map((d) => d.memberId));
  const coverageRatio = deliveringMembers.size / memberCount;

  const monthsByMember = new Map();
  for (const d of recent) {
    const dt = new Date(d.deliveryDate);
    const key = `${dt.getFullYear()}-${dt.getMonth()}`;
    if (!monthsByMember.has(d.memberId)) monthsByMember.set(d.memberId, new Set());
    monthsByMember.get(d.memberId).add(key);
  }
  const avgMonthsActive = monthsByMember.size
    ? [...monthsByMember.values()].reduce((sum, set) => sum + set.size, 0) / monthsByMember.size
    : 0;
  const regularityRatio = clamp(avgMonthsActive / 12, 0, 1);

  const score = clamp(Math.round((coverageRatio * 0.6 + regularityRatio * 0.4) * 100));

  return {
    score,
    activeDeliverers: deliveringMembers.size,
    totalMembers: memberCount,
    coverageRatio: Number(coverageRatio.toFixed(2)),
    avgMonthsActiveOutOf12: Number(avgMonthsActive.toFixed(1)),
  };
}

/**
 * Factor 3: Governance compliance — reuses the existing 1/3-rule and term
 * lifecycle logic from utils/governance.js so this never drifts out of sync
 * with the actual compliance rules enforced elsewhere in the system.
 *
 * @param {Array<{status: string, complianceOverride: boolean}>} committees
 */
function scoreGovernanceCompliance(committees) {
  if (committees.length === 0) {
    return { score: 30, note: "No committee on record — governance cannot be verified.", committeesEvaluated: 0 };
  }

  let points = 0;
  const details = committees.map((c) => {
    let committeePoints;
    switch (c.status) {
      case "COMPLIANT":
        committeePoints = 100;
        break;
      case "TERM_EXPIRING":
        committeePoints = 65; // still compliant today, but a near-term risk
        break;
      case "UPCOMING":
        committeePoints = 80;
        break;
      case "NON_COMPLIANT":
        committeePoints = c.complianceOverride ? 45 : 15; // logged override is better than silent violation
        break;
      case "TERM_EXPIRED":
        committeePoints = 10; // acting without a mandate — serious institutional risk
        break;
      default:
        committeePoints = 40;
    }
    points += committeePoints;
    return { committeeType: c.committeeType, status: c.status, points: committeePoints };
  });

  const score = clamp(Math.round(points / committees.length));
  return { score, committeesEvaluated: committees.length, details };
}

/**
 * Factor 4: Document compliance — what fraction of the core statutory
 * document types are on file and fully APPROVED (not just uploaded).
 *
 * @param {Array<{docType: string, status: string}>} documents
 */
const CORE_DOC_TYPES = ["BY_LAWS", "AUDIT_REPORT", "MEETING_MINUTES"];

function scoreDocumentCompliance(documents) {
  const approvedTypes = new Set(
    documents.filter((d) => d.status === "APPROVED" && CORE_DOC_TYPES.includes(d.docType)).map((d) => d.docType)
  );

  const pendingCount = documents.filter((d) => d.status === "PENDING" || d.status === "REVIEWED").length;
  const rejectedCount = documents.filter((d) => d.status === "REJECTED").length;

  const coverage = approvedTypes.size / CORE_DOC_TYPES.length;
  // Small penalty for a backlog of unresolved/rejected filings, even if the
  // core three are covered — signals an inconsistent paper trail.
  const backlogPenalty = clamp(pendingCount * 2 + rejectedCount * 3, 0, 20);

  const score = clamp(Math.round(coverage * 100) - backlogPenalty);

  return {
    score,
    coreDocsApproved: [...approvedTypes],
    coreDocsMissing: CORE_DOC_TYPES.filter((t) => !approvedTypes.has(t)),
    pendingCount,
    rejectedCount,
  };
}

/**
 * Factor 5: Membership stability — tenure and modest growth are healthier
 * signals than a large but very young or shrinking membership.
 *
 * @param {Array<{createdAt: Date|string}>} members
 * @param {Date} now
 */
function scoreMembershipStability(members, now = new Date()) {
  if (members.length === 0) {
    return { score: 0, memberCount: 0, avgTenureMonths: 0 };
  }

  const tenuresMonths = members.map((m) => {
    const created = new Date(m.createdAt);
    return Math.max(0, (now - created) / (1000 * 60 * 60 * 24 * 30.44));
  });
  const avgTenureMonths = tenuresMonths.reduce((a, b) => a + b, 0) / tenuresMonths.length;

  // Tenure score: ramps up to a full score at 36 months average tenure —
  // an established, not a brand-new, membership base.
  const tenureScore = clamp((avgTenureMonths / 36) * 100);

  // Size floor: very small cooperatives (<10 members) carry concentration
  // risk regardless of tenure.
  const sizeFactor = members.length < 10 ? 0.7 : 1;

  const score = clamp(Math.round(tenureScore * sizeFactor));

  return {
    score,
    memberCount: members.length,
    avgTenureMonths: Number(avgTenureMonths.toFixed(1)),
  };
}

/**
 * Factor 6: Share capital trajectory — comparing total share capital
 * contributed in the trailing 6 months vs the 6 months before that. Growth
 * is rewarded; erosion is penalized. Flat is treated as mildly positive
 * (stable, not a red flag).
 *
 * @param {Array<{contributionDate: Date|string, amount: number, type: string}>} contributions
 * @param {Date} now
 */
function scoreShareCapitalTrajectory(contributions, now = new Date()) {
  const capitalContributions = contributions.filter((c) => c.type === "SHARE_CAPITAL_TOPUP");

  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const recentTotal = capitalContributions
    .filter((c) => new Date(c.contributionDate) >= sixMonthsAgo)
    .reduce((sum, c) => sum + Number(c.amount), 0);
  const priorTotal = capitalContributions
    .filter((c) => new Date(c.contributionDate) >= twelveMonthsAgo && new Date(c.contributionDate) < sixMonthsAgo)
    .reduce((sum, c) => sum + Number(c.amount), 0);

  let score;
  if (priorTotal === 0 && recentTotal === 0) {
    score = 40; // no data either way — neutral-low, not penalized as failure
  } else if (priorTotal === 0) {
    score = 80; // new capital activity appearing where there was none
  } else {
    const growthRatio = recentTotal / priorTotal;
    // 1.0 (flat) -> 60, 1.5x growth -> 100, 0.5x decline -> 20, floor at 0
    score = clamp(Math.round(60 + (growthRatio - 1) * 80));
  }

  return {
    score,
    recentSixMonthTotal: recentTotal,
    priorSixMonthTotal: priorTotal,
  };
}

/**
 * Factor 7: Asset stability — the livestock/fleet/property counterpart to
 * membership stability and produce consistency, for the four value chains
 * where a member's holding is a discrete tracked asset rather than
 * consumable produce. Three signals, each independently legible to a
 * lender:
 *
 *   - Coverage: what fraction of members have at least one ACTIVE asset on
 *     record — a herd nobody has bothered to register isn't collateral.
 *   - Survival: ACTIVE assets as a share of every asset ever recorded — high
 *     attrition (deceased/written-off/sold) relative to what's still active
 *     is a real risk signal, not just bookkeeping noise.
 *   - Recency: what fraction of active assets have ANY event (health check,
 *     valuation, or otherwise) logged in the trailing 12 months — an asset
 *     nobody has looked at in over a year is functionally unverified.
 *
 * Only ever called when the cooperative's value chain is in
 * ASSET_TRACKED_VALUE_CHAINS; computeCreditAssessment decides that, not this
 * function, so this stays a pure function of whatever data it's given.
 *
 * @param {Array<{memberId: string, status: string, createdAt: Date|string}>} assets
 * @param {Array<{assetId: string, eventDate: Date|string}>} assetEvents
 * @param {number} memberCount
 * @param {Date} now
 */
function scoreAssetStability(assets, assetEvents, memberCount, now = new Date()) {
  if (memberCount === 0) {
    return { score: 0, note: "No members recorded.", totalAssets: 0 };
  }
  if (assets.length === 0) {
    return { score: 0, totalAssets: 0, activeAssets: 0, note: "No assets recorded for this value chain yet." };
  }

  const activeAssets = assets.filter((a) => a.status === "ACTIVE");
  const membersWithActiveAsset = new Set(activeAssets.map((a) => a.memberId));
  const coverageRatio = clamp(membersWithActiveAsset.size / memberCount, 0, 1);
  const survivalRatio = clamp(activeAssets.length / assets.length, 0, 1);

  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const recentlyEventedAssetIds = new Set(
    (assetEvents || [])
      .filter((e) => new Date(e.eventDate) >= twelveMonthsAgo)
      .map((e) => e.assetId)
  );
  const recencyRatio = activeAssets.length
    ? clamp(activeAssets.filter((a) => recentlyEventedAssetIds.has(a.id)).length / activeAssets.length, 0, 1)
    : 0;

  const score = clamp(Math.round((coverageRatio * 0.4 + survivalRatio * 0.35 + recencyRatio * 0.25) * 100));

  return {
    score,
    totalAssets: assets.length,
    activeAssets: activeAssets.length,
    coverageRatio: Number(coverageRatio.toFixed(2)),
    survivalRatio: Number(survivalRatio.toFixed(2)),
    recencyRatio: Number(recencyRatio.toFixed(2)),
  };
}

/**
 * Combines every applicable factor into the composite score + band + full
 * breakdown for transparency. Asset stability is included only when
 * valueChain is one of ASSET_TRACKED_VALUE_CHAINS; otherwise its weight is
 * proportionally redistributed across the other six so they still sum to
 * exactly 1.0, and the breakdown carries an explicit not-applicable entry
 * rather than silently omitting it.
 */
function computeCreditAssessment({ contributions, produceDeliveries, committees, documents, members, assets, assetEvents, valueChain }, now = new Date()) {
  const contributionConsistency = scoreContributionConsistency(contributions, members.length, now);
  const produceConsistency = scoreProduceConsistency(produceDeliveries || [], members.length, now);
  const governanceCompliance = scoreGovernanceCompliance(committees);
  const documentCompliance = scoreDocumentCompliance(documents);
  const membershipStability = scoreMembershipStability(members, now);
  const shareCapitalTrajectory = scoreShareCapitalTrajectory(contributions, now);

  const assetTrackingApplies = ASSET_TRACKED_VALUE_CHAINS.includes(valueChain);
  const assetStability = assetTrackingApplies
    ? { applicable: true, ...scoreAssetStability(assets || [], assetEvents || [], members.length, now) }
    : { applicable: false, score: null, note: `Not applicable — ${valueChain || "this value chain"} does not track a discrete asset.` };

  const factors = {
    contributionConsistency,
    produceConsistency,
    governanceCompliance,
    documentCompliance,
    membershipStability,
    shareCapitalTrajectory,
    assetStability,
  };

  // Effective weights: drop assetStability when it doesn't apply and scale
  // the rest back up so they still sum to 1.0. When it does apply, the
  // stated WEIGHTS are used exactly as declared.
  const effectiveWeights = assetTrackingApplies
    ? { ...WEIGHTS }
    : Object.fromEntries(
        Object.entries(WEIGHTS)
          .filter(([key]) => key !== "assetStability")
          .map(([key, weight]) => [key, weight / (1 - WEIGHTS.assetStability)])
      );

  const composite = clamp(
    Math.round(
      Object.entries(effectiveWeights).reduce((sum, [key, weight]) => sum + factors[key].score * weight, 0)
    )
  );

  const bandInfo = bandFor(composite);

  return {
    score: composite,
    band: bandInfo.band,
    bandLabel: bandInfo.label,
    weights: effectiveWeights,
    factors,
    computedAt: now.toISOString(),
    disclaimer:
      "This is a creditworthiness signal for referral to a third-party lender. It is not a loan offer, pre-approval, or guarantee, and this platform does not disburse funds.",
  };
}

module.exports = {
  WEIGHTS,
  BANDS,
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
};
