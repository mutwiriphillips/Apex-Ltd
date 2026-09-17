/**
 * Governance logic per Engineering Scope §7 (Module 5).
 *
 * ELECTED_ROLES are counted toward the 1/3 gender rotation rule.
 * EXECUTIVE_MANAGER is a non-elected role and is explicitly excluded.
 */
const ELECTED_MANAGEMENT_ROLES = [
  "CHAIRPERSON",
  "VICE_CHAIRPERSON",
  "SECRETARY",
  "TREASURER",
  "BOARD_MEMBER",
];

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Checks the 1/3 gender rotation rule against a proposed/current set of
 * committee members. No single gender may hold more than 2/3 of elected seats.
 *
 * @param {Array<{gender: 'MALE'|'FEMALE', role: string}>} members
 * @returns {{ compliant: boolean, maleCount: number, femaleCount: number, totalElectedSeats: number, reason?: string }}
 */
function checkOneThirdRule(members) {
  const elected = members.filter((m) => ELECTED_MANAGEMENT_ROLES.includes(m.role));
  const totalElectedSeats = elected.length;

  if (totalElectedSeats === 0) {
    return { compliant: true, maleCount: 0, femaleCount: 0, totalElectedSeats: 0 };
  }

  const maleCount = elected.filter((m) => m.gender === "MALE").length;
  const femaleCount = elected.filter((m) => m.gender === "FEMALE").length;

  const maxAllowed = Math.floor((2 / 3) * totalElectedSeats + 1e-9);
  const compliant = maleCount <= maxAllowed && femaleCount <= maxAllowed;

  return {
    compliant,
    maleCount,
    femaleCount,
    totalElectedSeats,
    reason: compliant
      ? undefined
      : `A single gender holds more than 2/3 of the ${totalElectedSeats} elected seats (max allowed: ${maxAllowed}).`,
  };
}

/**
 * Derives a committee member's lifecycle status relative to today.
 * Mirrors Engineering Scope §7.1 / §7.3.
 */
function deriveElectionLifecycleStatus(reelectionDueDate, now = new Date()) {
  const due = new Date(reelectionDueDate).getTime();
  const nowMs = now.getTime();

  if (nowMs > due) return "TERM_EXPIRED";
  if (due - nowMs <= NINETY_DAYS_MS) return "TERM_EXPIRING";
  return "UPCOMING";
}

/**
 * Computes reelection_due_date from an election_date and term length (years).
 */
function computeReelectionDueDate(electionDate, termLengthYears = 3) {
  const d = new Date(electionDate);
  d.setFullYear(d.getFullYear() + termLengthYears);
  return d;
}

/**
 * Rolls up a committee's overall status from its members' individual
 * lifecycle status plus the 1/3 rule outcome. Term-expiry takes precedence
 * for operational urgency; compliance is reported separately by callers.
 */
function deriveCommitteeStatus(members, now = new Date()) {
  const statuses = members.map((m) => deriveElectionLifecycleStatus(m.reelectionDueDate, now));
  if (statuses.includes("TERM_EXPIRED")) return "TERM_EXPIRED";
  if (statuses.includes("TERM_EXPIRING")) return "TERM_EXPIRING";

  const rule = checkOneThirdRule(members);
  return rule.compliant ? "COMPLIANT" : "NON_COMPLIANT";
}

module.exports = {
  ELECTED_MANAGEMENT_ROLES,
  checkOneThirdRule,
  deriveElectionLifecycleStatus,
  computeReelectionDueDate,
  deriveCommitteeStatus,
};
