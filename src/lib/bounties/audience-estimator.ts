import type { EligibilityFilters } from "@/types/database";

/**
 * Audience estimator — placeholder.
 *
 * Phase 6 ships a rough heuristic so the create-bounty UI has a number
 * to render. Phase 11+ will replace this with a real query over the
 * `users` table that respects the same filters as `checkEligibility`.
 *
 * The returned number is intentionally fuzzy ("~280") so users don't
 * over-anchor on it during the create flow.
 */

const APPROX_TOTAL_HUNTERS = 2_500;

export function estimateAudience(filters: EligibilityFilters): {
  approxCount: number;
  copy: string;
} {
  let count = APPROX_TOTAL_HUNTERS;

  if (filters.requireVerified) count *= 0.42; // ~blue check density
  if (filters.minFollowers != null && filters.minFollowers > 0) {
    if (filters.minFollowers >= 100_000) count *= 0.06;
    else if (filters.minFollowers >= 10_000) count *= 0.17;
    else if (filters.minFollowers >= 5_000) count *= 0.32;
    else if (filters.minFollowers >= 1_000) count *= 0.55;
    else count *= 0.78;
  }
  if (
    filters.minAccountAgeMonths != null &&
    filters.minAccountAgeMonths > 0
  ) {
    if (filters.minAccountAgeMonths >= 36) count *= 0.6;
    else if (filters.minAccountAgeMonths >= 12) count *= 0.78;
    else count *= 0.9;
  }
  if (filters.minReputationScore != null && filters.minReputationScore > 0) {
    if (filters.minReputationScore >= 700) count *= 0.18;
    else if (filters.minReputationScore >= 400) count *= 0.45;
    else count *= 0.7;
  }
  if (
    filters.minPreviousBounties != null &&
    filters.minPreviousBounties > 0
  ) {
    if (filters.minPreviousBounties >= 10) count *= 0.22;
    else if (filters.minPreviousBounties >= 3) count *= 0.5;
    else count *= 0.78;
  }
  if (filters.requireReputationTier && filters.requireReputationTier !== "standard") {
    count *= filters.requireReputationTier === "premium" ? 0.08 : 0.4;
  }

  // Smart followers — Phase 6.3: just a minimum count, evaluated
  // against the globally curated smart-accounts list. Multiplier is a
  // placeholder until Phase 11+ runs real counts against the cache.
  const smart = filters.smartFollowers;
  const smartActive = !!smart && smart.minimum > 0;
  if (smartActive && smart) {
    if (smart.minimum >= 5) count *= 0.05;
    else if (smart.minimum >= 3) count *= 0.12;
    else count *= 0.25;
  }

  const approx = Math.max(1, Math.round(count / 10) * 10);
  return { approxCount: approx, copy: copyFor(approx, filters) };
}

function copyFor(approx: number, filters: EligibilityFilters): string {
  const smart = filters.smartFollowers;
  const smartActive = !!smart && smart.minimum > 0;
  const restricted =
    filters.requireVerified ||
    (filters.minFollowers ?? 0) > 0 ||
    (filters.minAccountAgeMonths ?? 0) > 0 ||
    (filters.minReputationScore ?? 0) > 0 ||
    (filters.minPreviousBounties ?? 0) > 0 ||
    !!filters.requireReputationTier ||
    smartActive;

  if (!restricted) {
    return `Open to all hunters (~${approx.toLocaleString()})`;
  }
  if (smartActive) {
    return `~${approx.toLocaleString()} hunters with smart follower signal match`;
  }
  return `~${approx.toLocaleString()} hunters match these filters`;
}
