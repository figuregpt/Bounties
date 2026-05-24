import type { Bounty, User } from "@/types/database";

/**
 * Computes whether a user qualifies for a bounty.
 *
 * Pure function — no DB calls, no fetch. The bounty row already carries
 * every denormalized filter column we need (see Phase 2 schema), so we
 * can run this in a tight loop for an entire feed page without N+1.
 *
 * Requirements are reported one-per-filter so the UI can render a
 * checklist with the user's actual vs. required values.
 */

export type EligibilityRequirementKey =
  | "verified"
  | "followers"
  | "account_age"
  | "reputation_tier"
  | "previous_bounties"
  | "reputation_score"
  | "smart_followers"
  | "holder_token";

export type EligibilityRequirement = {
  key: EligibilityRequirementKey;
  label: string;
  /** "10,000 followers", "Verified", "1 month old" — human-readable. */
  requiredLabel: string;
  /** What the user actually has, for the "you have X" hint. */
  actualLabel: string;
  met: boolean;
  /** True when this requirement can't be evaluated server-side (e.g.
   *  holder_token needs the hunter's wallet, which is browser state).
   *  The UI renders these as a neutral info row instead of red/green so
   *  users see the rule before they click Hunt and the balance check
   *  runs. */
  deferred?: boolean;
};

export type EligibilityResult = {
  eligible: boolean;
  requirements: EligibilityRequirement[];
  /** Empty string when eligible or when no filters are set. */
  summary: string;
};

const intFmt = new Intl.NumberFormat("en-US");

export function checkEligibility(
  user: User | null,
  bounty: Bounty,
): EligibilityResult {
  // Anon: we can't compute eligibility — surface as "ineligible" with a
  // sign-in hint; callers can still render the card.
  if (!user) {
    return {
      eligible: false,
      requirements: [],
      summary: "Sign in to check eligibility",
    };
  }

  const reqs: EligibilityRequirement[] = [];

  if (bounty.requireVerified) {
    reqs.push({
      key: "verified",
      label: "Verified on X",
      requiredLabel: "Verified",
      actualLabel: user.twitterVerified ? "Verified" : "Not verified",
      met: user.twitterVerified,
    });
  }

  if (bounty.minFollowers != null && bounty.minFollowers > 0) {
    const need = bounty.minFollowers;
    const have = user.twitterFollowers ?? 0;
    reqs.push({
      key: "followers",
      label: "Followers",
      requiredLabel: `${intFmt.format(need)}+ followers`,
      actualLabel: `you have ${intFmt.format(have)}`,
      met: have >= need,
    });
  }

  if (bounty.minAccountAgeMonths != null && bounty.minAccountAgeMonths > 0) {
    const need = bounty.minAccountAgeMonths;
    const have = monthsSince(user.twitterAccountCreatedAt);
    reqs.push({
      key: "account_age",
      label: "Account age",
      requiredLabel: `${need}+ months on X`,
      actualLabel: have == null ? "unknown" : `you have ${have} months`,
      met: have != null && have >= need,
    });
  }

  if (
    bounty.minPreviousBounties != null &&
    bounty.minPreviousBounties > 0
  ) {
    const need = bounty.minPreviousBounties;
    const have = user.totalBountiesCompleted ?? 0;
    reqs.push({
      key: "previous_bounties",
      label: "Completed bounties",
      requiredLabel: `${need}+ completed`,
      actualLabel: `you have ${have}`,
      met: have >= need,
    });
  }

  if (bounty.minReputationScore != null) {
    const need = Number(bounty.minReputationScore);
    const have = Number(user.reputationScore ?? 0);
    if (need > 0) {
      reqs.push({
        key: "reputation_score",
        label: "Reputation",
        requiredLabel: `${need.toFixed(0)}+ reputation`,
        actualLabel: `you have ${have.toFixed(0)}`,
        met: have >= need,
      });
    }
  }

  // Reputation tier — Phase 8 will replace this with tier-threshold logic.
  if (bounty.requireReputationTier) {
    reqs.push({
      key: "reputation_tier",
      label: "Reputation tier",
      requiredLabel: bounty.requireReputationTier,
      actualLabel: user.accountTier,
      met: tierAtLeast(user.accountTier, bounty.requireReputationTier),
    });
  }

  // Holder requirement — token gate evaluated against the hunter's
  // connected wallet at slot reservation time (see /api/claims). We can't
  // run the on-chain check here because eligibility is computed on the
  // server with no wallet context, so we surface the rule as a deferred
  // info row. Doesn't count against the `eligible` flag — the API
  // double-checks at hunt time and a clean error lands in the overlay.
  const holder = bounty.eligibilityFilters?.holderRequirement;
  if (holder && holder.minAmount > 0) {
    reqs.push({
      key: "holder_token",
      label: "Wallet holdings",
      requiredLabel: `Hold ${intFmt.format(holder.minAmount)}+ ${holder.symbol}`,
      actualLabel: "checked when you hunt",
      met: true,
      deferred: true,
    });
  }

  // Smart followers — reverse-cache architecture (Phase 6.4).
  //
  // `users.smartFollowerCount` is denormalized from
  // `smart_account_followers` at signup, then lazily refreshed when
  // older than 24h. That makes this check a pure column comparison —
  // zero joins, zero API calls on the hot path.
  const smart = bounty.eligibilityFilters?.smartFollowers;
  const smartActive = !!smart && smart.minimum > 0;
  if (smartActive && smart) {
    const have = Number(user.smartFollowerCount ?? 0);
    reqs.push({
      key: "smart_followers",
      label: "Smart followers",
      requiredLabel: `${smart.minimum}+ curated smart accounts following them`,
      actualLabel: `you have ${have}`,
      met: have >= smart.minimum,
    });
  }

  const unmet = reqs.filter((r) => !r.met);
  const eligible = unmet.length === 0;

  return {
    eligible,
    requirements: reqs,
    summary: eligible ? "" : summarize(unmet),
  };
}

/* =========================================================================
   Helpers
   ========================================================================= */

function monthsSince(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const ts = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (Number.isNaN(ts)) return null;
  const days = (Date.now() - ts) / 86_400_000;
  return Math.floor(days / 30);
}

function summarize(unmet: EligibilityRequirement[]): string {
  if (unmet.length === 0) return "";
  if (unmet.length === 1) {
    const r = unmet[0];
    return `Missing: ${r.requiredLabel} (${r.actualLabel})`;
  }
  return `Missing ${unmet.length} requirements`;
}

const TIER_RANK: Record<string, number> = {
  banned: -1,
  standard: 0,
  verified: 1,
  premium: 2,
};

function tierAtLeast(actual: string, required: string): boolean {
  const a = TIER_RANK[actual] ?? 0;
  const r = TIER_RANK[required] ?? 0;
  return a >= r;
}
