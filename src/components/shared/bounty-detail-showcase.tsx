"use client";

import { useMemo, useState } from "react";
import { ActionChecklist } from "@/components/bounties/action-checklist";
import { CTAButton } from "@/components/bounties/cta-button";
import { HunterList } from "@/components/bounties/hunter-list";
import { ReplyRulesDisplay } from "@/components/bounties/reply-rules-display";
import { ReplyTester } from "@/components/bounties/reply-tester";
import { ShareMenu } from "@/components/bounties/share-menu";
import { cn } from "@/lib/utils";
import { getBountyUIState, type BountyUIStateKind } from "@/lib/bounties/state";
import type { EligibilityResult } from "@/lib/bounties/eligibility";
import type {
  ActionConfig,
  Bounty,
  Claim,
  ClaimStatus,
  ReplyRules,
  User,
} from "@/types/database";
import type { HunterRow } from "@/lib/db/queries/claims";

/* ──────────────────────────────────────────────────────────────────────────
   Phase 5 showcase — wires every detail-page primitive against fixture
   data. The "UI states" picker drives the same state machine that runs
   on the real page, so each entry is a screenshot of an actual code
   path, not bespoke chrome.
   ────────────────────────────────────────────────────────────────────────── */

const RULES: ReplyRules = {
  mustContainAll: ["$BNTY"],
  forbidden: ["airdrop"],
  minLength: 12,
  minWordCount: 3,
  matchType: "word",
};

const ACTION_CONFIG: ActionConfig = {
  like: false,
  retweet: true,
  follow: { required: false, targetHandle: "" },
  reply: { required: true, rules: RULES },
  quote: {
    required: false,
    rules: {
      mustContainAll: [],
      forbidden: [],
      minLength: 0,
      minWordCount: 0,
      matchType: "word",
    },
  },
};

const ELIGIBLE: EligibilityResult = {
  eligible: true,
  requirements: [
    {
      key: "followers",
      label: "Followers",
      requiredLabel: "1,000+ followers",
      actualLabel: "you have 12,450",
      met: true,
    },
    {
      key: "verified",
      label: "Verified on X",
      requiredLabel: "Verified",
      actualLabel: "Verified",
      met: true,
    },
  ],
  summary: "",
};

const INELIGIBLE: EligibilityResult = {
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

const HUNTERS: HunterRow[] = [
  {
    id: "fx-1",
    status: "claimed_reward" as ClaimStatus,
    createdAt: new Date(Date.now() - 1000 * 60 * 12),
    claimedAt: new Date(Date.now() - 1000 * 60 * 6),
    finalVerifiedAt: new Date(Date.now() - 1000 * 60 * 7),
    rewardAmount: "250",
    rewardTokenSymbol: "BNTY",
    failureCategory: null,
    hunter: {
      id: "h-1",
      handle: "0xyigo",
      displayName: "yigo",
      avatarUrl: null,
      accountTier: "verified",
    },
  },
  {
    id: "fx-2",
    status: "verified" as ClaimStatus,
    createdAt: new Date(Date.now() - 1000 * 60 * 32),
    claimedAt: null,
    finalVerifiedAt: new Date(Date.now() - 1000 * 60),
    rewardAmount: "250",
    rewardTokenSymbol: "BNTY",
    failureCategory: null,
    hunter: {
      id: "h-2",
      handle: "figuregpt",
      displayName: "Figure",
      avatarUrl: null,
      accountTier: "premium",
    },
  },
  {
    id: "fx-3",
    status: "awaiting_final" as ClaimStatus,
    createdAt: new Date(Date.now() - 1000 * 60 * 60),
    claimedAt: null,
    finalVerifiedAt: null,
    rewardAmount: "250",
    rewardTokenSymbol: "BNTY",
    failureCategory: null,
    hunter: {
      id: "h-3",
      handle: "hunter_2",
      displayName: "Hunter 3",
      avatarUrl: null,
      accountTier: "standard",
    },
  },
  {
    id: "fx-4",
    status: "failed" as ClaimStatus,
    createdAt: new Date(Date.now() - 1000 * 60 * 90),
    claimedAt: null,
    finalVerifiedAt: null,
    rewardAmount: "250",
    rewardTokenSymbol: "BNTY",
    failureCategory: null,
    hunter: {
      id: "h-4",
      handle: "hunter_4",
      displayName: "Hunter 5",
      avatarUrl: null,
      accountTier: "standard",
    },
  },
];

const FIXTURE_BOUNTY = makeBounty();
const FIXTURE_USER = makeUser();

const STATE_OPTIONS: {
  label: string;
  build: () => {
    user: User | null;
    claim: Claim | null;
    bounty: Bounty;
    eligibility: EligibilityResult;
  };
}[] = [
  {
    label: "not_started",
    build: () => ({
      user: FIXTURE_USER,
      claim: null,
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "not_eligible",
    build: () => ({
      user: FIXTURE_USER,
      claim: null,
      bounty: { ...FIXTURE_BOUNTY, requireVerified: true } as Bounty,
      eligibility: INELIGIBLE,
    }),
  },
  {
    label: "campaign_full",
    build: () => ({
      user: FIXTURE_USER,
      claim: null,
      bounty: {
        ...FIXTURE_BOUNTY,
        currentHuntersCount: FIXTURE_BOUNTY.maxHunters,
        claimedHuntersCount: FIXTURE_BOUNTY.maxHunters,
      } as Bounty,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "campaign_ended",
    build: () => ({
      user: FIXTURE_USER,
      claim: null,
      bounty: {
        ...FIXTURE_BOUNTY,
        endsAt: new Date(Date.now() - 86_400_000),
      } as Bounty,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "action_in_progress",
    build: () => ({
      user: FIXTURE_USER,
      claim: makeClaim("awaiting_action"),
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "awaiting_initial",
    build: () => ({
      user: FIXTURE_USER,
      claim: makeClaim("action_claimed"),
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "awaiting_final",
    build: () => ({
      user: FIXTURE_USER,
      claim: makeClaim("awaiting_final", {
        likeVerified: true,
        retweetVerified: true,
        replyVerified: true,
      }),
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "ready_to_claim",
    build: () => ({
      user: FIXTURE_USER,
      claim: makeClaim("verified", {
        likeVerified: true,
        retweetVerified: true,
        replyVerified: true,
      }),
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "claimed",
    build: () => ({
      user: FIXTURE_USER,
      claim: makeClaim("claimed_reward", {
        likeVerified: true,
        retweetVerified: true,
        replyVerified: true,
      }),
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "verification_failed",
    build: () => ({
      user: FIXTURE_USER,
      claim: makeClaim("failed", {
        likeVerified: true,
        retweetVerified: true,
        replyVerified: false,
        failureReason:
          "Reply was missing required keyword: $BNTY",
        failureCategory: "reply_rules_failed",
      }),
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "claim_expired",
    build: () => ({
      user: FIXTURE_USER,
      claim: makeClaim("expired"),
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
  {
    label: "is_creator",
    build: () => ({
      user: { ...FIXTURE_USER, id: FIXTURE_BOUNTY.creatorUserId } as User,
      claim: null,
      bounty: FIXTURE_BOUNTY,
      eligibility: ELIGIBLE,
    }),
  },
];

export function BountyDetailShowcase() {
  const [stateLabel, setStateLabel] = useState<string>("not_started");

  const active = useMemo(
    () => STATE_OPTIONS.find((s) => s.label === stateLabel) ?? STATE_OPTIONS[0],
    [stateLabel],
  );

  const built = active.build();
  const ui = getBountyUIState(built);

  return (
    <div className="space-y-10">
      {/* ─── State picker ────────────────────────────────────────────── */}
      <Group label={`UI state machine · current: ${ui.kind as BountyUIStateKind}`}>
        <div className="flex flex-wrap gap-1.5">
          {STATE_OPTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setStateLabel(s.label)}
              className={cn(
                "press rounded-[var(--radius-pill)] px-3 py-1 text-caption font-mono transition-colors",
                stateLabel === s.label
                  ? "bg-accent-primary text-[#0E0E10]"
                  : "bg-bg-elevated text-text-secondary hover:text-text-primary",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-5">
          <p className="text-caption uppercase tracking-wider text-text-tertiary">
            {ui.title}
          </p>
          <p className="mt-1 text-small text-text-secondary">{ui.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ui.primaryCta && (
              <CTAButton config={ui.primaryCta} size="lg" />
            )}
            {ui.secondaryCta && (
              <CTAButton config={ui.secondaryCta} />
            )}
            {!ui.primaryCta && !ui.secondaryCta && (
              <p className="text-caption text-text-tertiary">
                No CTAs for this state.
              </p>
            )}
          </div>
        </div>
      </Group>

      {/* ─── Action checklist ────────────────────────────────────────── */}
      <Group label="Action checklist">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-2 text-caption uppercase tracking-wider text-text-tertiary">
              Pre-hunt (no claim)
            </p>
            <ActionChecklist actionConfig={ACTION_CONFIG} hideReplyInline />
          </div>
          <div>
            <p className="mb-2 text-caption uppercase tracking-wider text-text-tertiary">
              Post-verification
            </p>
            <ActionChecklist
              actionConfig={ACTION_CONFIG}
              claim={makeClaim("verified", {
                likeVerified: true,
                retweetVerified: true,
                replyVerified: true,
              })}
              hideReplyInline
            />
          </div>
        </div>
      </Group>

      {/* ─── Reply rules ─────────────────────────────────────────────── */}
      <Group label="Reply rules display">
        <div className="rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-5">
          <ReplyRulesDisplay rules={RULES} />
        </div>
      </Group>

      {/* ─── Reply tester ────────────────────────────────────────────── */}
      <Group label="Reply tester · interactive">
        <ReplyTester rules={RULES} />
      </Group>

      {/* ─── Hunter list ─────────────────────────────────────────────── */}
      <Group label="Hunter list">
        <HunterList hunters={HUNTERS} />
      </Group>

      {/* ─── Share menu ──────────────────────────────────────────────── */}
      <Group label="Share menu">
        <div className="inline-flex">
          <ShareMenu
            bountyUrl="http://localhost:3001/bounties/example"
            creatorHandle="creator_0"
            rewardAmount="250"
            rewardSymbol="BNTY"
          />
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

/* =========================================================================
   Fixture builders
   ========================================================================= */

function makeUser(): User {
  return {
    id: "user-fixture",
    privyId: null,
    walletAddress: "FixtureWalletAddress11111111111111111111111111",
    walletConnectedAt: new Date(),
    walletProvider: "Phantom",
    handle: "fixture-user",
    displayName: "Fixture",
    avatarUrl: null,
    bio: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: new Date(),
    twitterId: "tw_fixture",
    twitterHandle: "fixture",
    twitterVerified: true,
    twitterFollowers: 12_450,
    twitterFollowing: 320,
    twitterTweetCount: 8200,
    twitterAccountCreatedAt: new Date("2018-01-01"),
    twitterLastSyncedAt: new Date(),
    twitterRawProfile: null,
    reputationScore: "750.00",
    totalBountiesCompleted: 12,
    totalBountiesFailed: 1,
    totalRewardsEarnedUsd: "245.50",
    totalRewardsClaimedUsd: "245.50",
    streakDays: 4,
    longestStreakDays: 14,
    accountTier: "verified",
    totalBountiesCreated: 0,
    totalSpentAsCreatorUsd: "0",
    isCreatorVerified: false,
    emailAddress: null,
    emailVerified: false,
    notificationPreferences: {},
    referralCode: "DEMO1234",
    referredByUserId: null,
    timezone: "UTC",
    locale: "en",
    isBanned: false,
    bannedAt: null,
    bannedReason: null,
    bannedByUserId: null,
    shadowBanned: false,
    smartFollowerCount: 0,
    smartFollowerLastCheckedAt: null,
  };
}

function makeBounty(): Bounty {
  const now = new Date();
  return {
    id: "bounty-fixture",
    creatorUserId: "creator-fixture",
    slug: "fixture-bounty",
    status: "active",
    chain: "solana",
    tweetId: "tweet-fixture",
    tweetUrl: "https://x.com/example/status/1",
    tweetAuthorTwitterId: "tw_example",
    tweetAuthorHandle: "example",
    tweetCachedData: {
      authorId: "tw_example",
      authorHandle: "example",
      authorName: "Example Creator",
      text: "Reply with your favorite Solana primitive 👇",
      metrics: { likes: 1287, retweets: 412, replies: 87, quotes: 14 },
      capturedAt: now.toISOString(),
    },
    tweetIsOwnedByCreator: true,
    actionConfig: ACTION_CONFIG,
    requiresLike: false,
    requiresRetweet: true,
    requiresReply: true,
    requiresQuote: false,
    requiresFollow: false,
    followTargetHandle: null,
    replyKeywordsRequired: ["$BNTY"],
    replyKeywordsPool: ["solana", "memecoin", "alpha"],
    replyKeywordsPoolMinimum: 1,
    replyKeywordsForbidden: ["airdrop"],
    replyMinLength: 12,
    replyMinWords: 3,
    replyMatchType: "word",
    rewardTokenMint: "fixture-mint",
    rewardTokenSymbol: "BNTY",
    rewardTokenDecimals: 9,
    rewardPerHunter: "250",
    rewardPerHunterUsd: "10.52",
    maxHunters: 500,
    totalPool: "125000",
    totalPoolUsd: "5260.00",
    platformFeeBps: 500,
    platformFeeAmount: "12500",
    creationFeeAmount: null,
    creationFeeAmountUsd: null,
    distributionModel: "pool_quadratic",
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
    escrowTxHash: "escrow_fixture_tx",
    escrowConfirmedAt: now,
    escrowAmount: "125000",
    treasuryAddress: null,
    onChainStatus: "escrowed",
    refundTxHash: null,
    refundedAmount: null,
    refundedAt: null,
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 3),
    updatedAt: now,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 60 * 3),
    endsAt: new Date(now.getTime() + 1000 * 60 * 60 * 72),
    completedAt: null,
    cancelledAt: null,
    pausedAt: null,
    currentHuntersCount: 132,
    claimedHuntersCount: 110,
    failedHuntersCount: 12,
    pendingHuntersCount: 22,
    viewCount: 4218,
    shareCount: 87,
    isFeatured: true,
    featuredUntil: new Date(now.getTime() + 1000 * 60 * 60 * 72),
    isHidden: false,
    isNsfw: false,
    visibilityType: "public",
    tags: ["community", "rt"],
    category: "community_engagement",
    streamSubscriptionId: null,
    streamSubscribedAt: null,
    lastEngagementCheckAt: null,
    engagementCheckErrorCount: 0,
  };
}

function makeClaim(
  status: ClaimStatus,
  overrides: Partial<Claim> = {},
): Claim {
  const now = new Date();
  return {
    id: `claim-${status}`,
    bountyId: FIXTURE_BOUNTY.id,
    hunterUserId: "user-fixture",
    status,
    createdAt: now,
    updatedAt: now,
    huntStartedAt: now,
    actionClaimedAt: null,
    initialVerifiedAt: null,
    finalCheckScheduledAt: null,
    finalCheckAttemptedAt: null,
    finalVerifiedAt: null,
    claimWindowEndsAt: null,
    claimedAt: null,
    failedAt: null,
    cancelledAt: null,
    expiredAt: null,
    verificationDetails: null,
    likeVerified: null,
    retweetVerified: null,
    replyVerified: null,
    replyTweetId: null,
    replyText: null,
    quoteVerified: null,
    quoteTweetId: null,
    quoteText: null,
    failureReason: null,
    failureCategory: null,
    verificationAttempts: 0,
    rewardAmount: "250",
    rewardAmountUsd: "10.52",
    rewardTokenMint: "fixture-mint",
    rewardTokenSymbol: "BNTY",
    platformFeeAmount: "12.5",
    claimTxHash: null,
    claimTxConfirmedAt: null,
    claimTxError: null,
    ipAddress: null,
    userAgent: null,
    deviceFingerprint: null,
    sessionDurationSeconds: null,
    mouseEventsCount: null,
    referrer: null,
    userTwitterFollowersAtHunt: 12_450,
    userTwitterVerifiedAtHunt: true,
    userReputationScoreAtHunt: "750.00",
    ...overrides,
  } as Claim;
}
