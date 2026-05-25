"use client";

import { useMemo, useState } from "react";
import { BountyCard } from "@/components/bounties/bounty-card";
import { BountyCardSkeleton } from "@/components/bounties/bounty-card-skeleton";
import { EligibilityBanner } from "@/components/bounties/eligibility-banner";
import { EmptyState } from "@/components/bounties/empty-state";
import { FilterChips } from "@/components/bounties/filter-chips";
import { TokenChip } from "@/components/bounties/token-chip";
import {
  DEFAULT_FILTERS,
  type DiscoverFilters,
} from "@/components/bounties/filter-types";
import type { BountyFeedItem } from "@/lib/db/queries/bounties";
import type { EligibilityResult } from "@/lib/bounties/eligibility";

/* ──────────────────────────────────────────────────────────────────────────
   /design-system showcase for Phase 4 bounty components.

   Renders eligible + ineligible + claimed states from in-memory fixtures
   so iteration on visuals doesn't need a live DB. The fixtures match the
   `BountyFeedItem` shape exactly so any drift in the type immediately
   surfaces here.
   ────────────────────────────────────────────────────────────────────────── */

export function BountyShowcase() {
  const eligibility = useMemo(() => ({
    eligible: makeEligibility(true),
    ineligible: makeEligibility(false),
    none: { eligible: true, requirements: [], summary: "" } as EligibilityResult,
  }), []);

  const fixtures: BountyFeedItem[] = useMemo(
    () => [
      makeBounty({
        slug: "memecoin-launch-eligible",
        symbol: "USDC",
        rewardPerHunter: "5",
        rewardPerHunterUsd: "5",
        maxHunters: 200,
        claimed: 38,
        pending: 12,
        endsInHours: 22,
        category: "memecoin_launch",
        requiresLike: true,
        requiresRetweet: true,
        eligibility: eligibility.eligible,
      }),
      makeBounty({
        slug: "premium-only",
        symbol: "SOL",
        rewardPerHunter: "0.05",
        rewardPerHunterUsd: "8.42",
        maxHunters: 100,
        claimed: 18,
        pending: 4,
        endsInHours: 48,
        category: "brand_marketing",
        requiresLike: true,
        requiresRetweet: true,
        eligibility: eligibility.ineligible,
      }),
      makeBounty({
        slug: "reply-pool-eligible",
        symbol: "BNTY",
        rewardPerHunter: "250",
        rewardPerHunterUsd: "10.52",
        maxHunters: 500,
        claimed: 110,
        pending: 22,
        endsInHours: 72,
        category: "community_engagement",
        requiresLike: true,
        requiresReply: true,
        replyKeywordsPool: ["solana", "memecoin", "alpha", "bounty"],
        replyKeywordsPoolMinimum: 1,
        eligibility: eligibility.none,
      }),
    ],
    [eligibility],
  );

  return (
    <div className="space-y-10">
      {/* ─── Token chips ─────────────────────────────────────────── */}
      <Group label="Token chips">
        <div className="flex flex-wrap gap-2">
          <TokenChip symbol="BNTY" amount={250} category="platform" />
          <TokenChip symbol="USDC" amount={5} category="stablecoin" />
          <TokenChip symbol="SOL" amount={0.05} category="sol_ecosystem" />
          <TokenChip symbol="WIF" amount={5} category="memecoin" />
          <TokenChip symbol="BONK" amount={100_000} category="memecoin" />
          <TokenChip symbol="UNKNOWN" amount={1} />
        </div>
      </Group>

      {/* ─── Eligibility banners ─────────────────────────────────── */}
      <Group label="Eligibility banner — card">
        <div className="grid gap-3 md:grid-cols-2">
          <EligibilityBanner eligibility={eligibility.eligible} />
          <EligibilityBanner eligibility={eligibility.ineligible} />
        </div>
      </Group>

      <Group label="Eligibility banner — detail">
        <EligibilityBanner
          eligibility={eligibility.ineligible}
          variant="detail"
        />
      </Group>

      {/* ─── Bounty cards ────────────────────────────────────────── */}
      <Group label="Bounty cards · feed states">
        <ul className="space-y-3">
          {fixtures.map((b) => (
            <li key={b.id}>
              <BountyCard bounty={b} />
            </li>
          ))}
        </ul>
      </Group>

      {/* ─── Skeleton ────────────────────────────────────────────── */}
      <Group label="Bounty card · skeleton">
        <BountyCardSkeleton />
      </Group>

      {/* ─── Filter chips ────────────────────────────────────────── */}
      <Group label="Filter chips · mobile">
        <FilterChipsDemo />
      </Group>

      {/* ─── Empty states ────────────────────────────────────────── */}
      <Group label="Empty states">
        <div className="grid gap-3 md:grid-cols-3">
          <EmptyState variant="no_bounties" />
          <EmptyState variant="filters_too_narrow" onAction={() => {}} />
          <EmptyState variant="no_eligible" onAction={() => {}} />
        </div>
      </Group>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </h3>
      {children}
    </section>
  );
}

function FilterChipsDemo() {
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  return <FilterChips filters={filters} onChange={setFilters} />;
}

/* =========================================================================
   Fixture builders
   ========================================================================= */

function makeEligibility(eligible: boolean): EligibilityResult {
  if (eligible) {
    return {
      eligible: true,
      requirements: [
        {
          key: "verified",
          label: "Verified on X",
          requiredLabel: "Verified",
          actualLabel: "Verified",
          met: true,
        },
        {
          key: "followers",
          label: "Followers",
          requiredLabel: "1,000+ followers",
          actualLabel: "you have 12,450",
          met: true,
        },
      ],
      summary: "",
    };
  }
  return {
    eligible: false,
    requirements: [
      {
        key: "verified",
        label: "Verified on X",
        requiredLabel: "Verified",
        actualLabel: "Not verified",
        met: false,
      },
      {
        key: "followers",
        label: "Followers",
        requiredLabel: "5,000+ followers",
        actualLabel: "you have 1,247",
        met: false,
      },
      {
        key: "account_age",
        label: "Account age",
        requiredLabel: "6+ months on X",
        actualLabel: "you have 8 months",
        met: true,
      },
    ],
    summary: "Missing 2 requirements",
  };
}

type FixtureInput = {
  slug: string;
  symbol: string;
  rewardPerHunter: string;
  rewardPerHunterUsd: string;
  maxHunters: number;
  claimed: number;
  pending: number;
  endsInHours: number;
  category: string;
  requiresLike?: boolean;
  requiresRetweet?: boolean;
  requiresReply?: boolean;
  requiresQuote?: boolean;
  replyKeywordsPool?: string[];
  replyKeywordsPoolMinimum?: number;
  eligibility: EligibilityResult;
};

function makeBounty(i: FixtureInput): BountyFeedItem {
  const now = new Date();
  const endsAt = new Date(now.getTime() + i.endsInHours * 3600 * 1000);
  return {
    id: `fixture-${i.slug}`,
    creatorUserId: "fixture-creator",
    slug: i.slug,
    status: "active",
    tweetId: "fixture-tweet",
    tweetUrl: "https://x.com/example/status/1",
    tweetAuthorTwitterId: null,
    tweetAuthorHandle: "example",
    tweetCachedData: {
      authorId: "fixture",
      authorHandle: "example",
      authorName: "Example Creator",
      text: "We're live. $MEME launching tonight on bags.fm 🚀\nQuote with your trade story to qualify.",
      metrics: {
        likes: 1287,
        retweets: 412,
        replies: 87,
        quotes: 14,
      },
      capturedAt: new Date(now.getTime() - 3600 * 1000).toISOString(),
    },
    tweetIsOwnedByCreator: true,
    actionConfig: {
      like: false,
      retweet: !!i.requiresRetweet,
      follow: { required: false, targetHandle: "" },
      reply: {
        required: !!i.requiresReply,
        rules: {
          mustContainAll: [],
          forbidden: [],
          minLength: 0,
          minWordCount: 0,
          matchType: "word",
        },
      },
      quote: {
        required: !!i.requiresQuote,
        rules: {
          mustContainAll: [],
          forbidden: [],
          minLength: 0,
          minWordCount: 0,
          matchType: "word",
        },
      },
    },
    requiresLike: false,
    requiresRetweet: !!i.requiresRetweet,
    requiresReply: !!i.requiresReply,
    requiresQuote: !!i.requiresQuote,
    requiresFollow: false,
    followTargetHandle: null,
    replyKeywordsRequired: null,
    replyKeywordsPool: i.replyKeywordsPool ?? null,
    replyKeywordsPoolMinimum: i.replyKeywordsPoolMinimum ?? null,
    replyKeywordsForbidden: null,
    replyMinLength: 0,
    replyMinWords: 0,
    replyMatchType: "word",
    rewardTokenMint: "fixture",
    rewardTokenSymbol: i.symbol,
    rewardTokenDecimals: 6,
    rewardPerHunter: i.rewardPerHunter,
    rewardPerHunterUsd: i.rewardPerHunterUsd,
    maxHunters: i.maxHunters,
    totalPool: String(Number(i.rewardPerHunter) * i.maxHunters),
    totalPoolUsd: String(Number(i.rewardPerHunterUsd) * i.maxHunters),
    platformFeeBps: 500,
    platformFeeAmount: null,
    creationFeeAmount: null,
    creationFeeAmountUsd: null,
    distributionModel: "fixed_slot",
    distributionConfig: null,
    eligibilityFilters: {
      minFollowers: null,
      requireVerified: false,
      minAccountAgeMonths: null,
      minReputationScore: null,
      allowedCountries: null,
      blockedCountries: null,
      minPreviousBounties: null,
      requireReputationTier: null,
    },
    minFollowers: null,
    requireVerified: false,
    minAccountAgeMonths: null,
    minReputationScore: null,
    allowedCountries: null,
    blockedCountries: null,
    minPreviousBounties: null,
    requireReputationTier: null,
    escrowTxHash: null,
    escrowConfirmedAt: null,
    escrowAmount: null,
    treasuryAddress: null,
    onChainStatus: "escrowed",
    refundTxHash: null,
    refundedAmount: null,
    refundedAt: null,
    createdAt: new Date(now.getTime() - 3600 * 1000),
    updatedAt: now,
    publishedAt: new Date(now.getTime() - 3600 * 1000),
    endsAt,
    completedAt: null,
    cancelledAt: null,
    pausedAt: null,
    currentHuntersCount: i.claimed + i.pending,
    claimedHuntersCount: i.claimed,
    failedHuntersCount: 0,
    pendingHuntersCount: i.pending,
    viewCount: 1284,
    shareCount: 12,
    isFeatured: false,
    featuredUntil: null,
    isHidden: false,
    isNsfw: false,
    visibilityType: "public",
    tags: null,
    category: i.category,
    streamSubscriptionId: null,
    streamSubscribedAt: null,
    lastEngagementCheckAt: null,
    engagementCheckErrorCount: 0,
    creator: {
      id: "fixture-creator",
      handle: "example",
      displayName: "Example Creator",
      avatarUrl: null,
      isCreatorVerified: true,
    },
    eligibility: i.eligibility,
    claimedByCurrentUser: false,
    rewardToken: null,
    inProgressCount: 0,
    lotteryJoinedCount: i.claimed + i.pending,
  };
}
