import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/* =========================================================================
   JSONB payload shapes — schema is the single source of truth.
   ========================================================================= */

/**
 * Reusable rules block for any "free-text action" — reply and quote
 * share the same shape since the verifier runs identical checks against
 * either the reply text or the quote-tweet text.
 *
 * Phase 6 refinement: dropped the "must include at least N of pool"
 * concept. Too complex for v1; we'll bring it back if creators ask.
 */
export type TextActionRules = {
  mustContainAll: string[];
  forbidden: string[];
  minLength: number;
  minWordCount: number;
  matchType: "word" | "string";
};

/** Back-compat alias — existing call sites that import `ReplyRules`
 *  still compile and they're structurally identical now. */
export type ReplyRules = TextActionRules;

export type FollowAction = {
  required: boolean;
  /** Twitter handle (no @ prefix, lower-cased) hunters must follow.
   *  Empty string when `required` is false. */
  targetHandle: string;
};

export type QuoteAction = {
  required: boolean;
  rules: TextActionRules;
};

export type ActionConfig = {
  /** DEPRECATED in Phase 6 — twitterapi.io only exposes the most recent
   *  ~100 likers per tweet, which makes verification unreliable on
   *  viral posts. The field stays so old rows still parse; new bounties
   *  always set this to false and the UI no longer offers it. */
  like: boolean;
  retweet: boolean;
  reply: { required: boolean; rules: TextActionRules };
  follow: FollowAction;
  quote: QuoteAction;
};

export type TweetCachedData = {
  authorId: string;
  authorHandle: string;
  authorName: string;
  text: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
  };
  capturedAt: string; // ISO 8601
};

/**
 * Smart followers config.
 *
 * Phase 6 refinement: the smart-accounts list is curated globally (the
 * `smart_accounts` table, loaded from `data/smart-accounts.txt` by an
 * admin script). Bounty creators only pick a minimum count — they don't
 * supply their own handle list anymore.
 *
 *   `enabled = minimum > 0`
 */
export type SmartFollowersConfig = {
  /** Minimum number of accounts on the global curated list that must
   *  follow the hunter. `0` = filter disabled. */
  minimum: number;
};

export type EligibilityFilters = {
  minFollowers: number | null;
  requireVerified: boolean;
  minAccountAgeMonths: number | null;
  minReputationScore: number | null;
  allowedCountries: string[] | null;
  blockedCountries: string[] | null;
  minPreviousBounties: number | null;
  requireReputationTier: string | null;
  /** Phase 6+: persisted on the bounty row, evaluated at claim time
   *  (Phase 7) once the smart-account follower cache lands. */
  smartFollowers?: SmartFollowersConfig | null;
  /** Token-holder gate. When set, POST /api/claims checks the SPL
   *  balance of the hunter's connected wallet for `mint` and rejects
   *  if it's below `minAmount` (whole-token units, not raw). Symbol
   *  is cached for the bounty card / detail badge. */
  holderRequirement?: {
    mint: string;
    minAmount: number;
    symbol: string;
    decimals: number;
  } | null;
};

export type DistributionConfig = {
  /** fixed_slot: first N hunters get full reward. quadratic: weight by sqrt(score). lottery: random N winners. tiered: bucket by quality. */
  variant: "fixed_slot" | "pool_quadratic" | "pool_lottery" | "quality_tiered";
  tiers?: Array<{ minScore: number; sharePercent: number }>;
  lotteryWinners?: number;
  qualityWeights?: Record<string, number>;
};

/* =========================================================================
   bounties — the campaign / job posting that hunters claim against
   ========================================================================= */

export const bounties = pgTable(
  "bounties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorUserId: uuid("creator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("draft"),

    /** Settlement chain. Routes escrow / verify / payout / refund through
     *  the matching ChainAdapter (src/lib/chains). Every pre-Monad row is
     *  'solana'; new bounties stamp the creator's selected chain. */
    chain: text("chain").notNull().default("solana"),

    /* Twitter target --------------------------------------------------- */
    tweetId: text("tweet_id").notNull(),
    tweetUrl: text("tweet_url").notNull(),
    tweetAuthorTwitterId: text("tweet_author_twitter_id"),
    tweetAuthorHandle: text("tweet_author_handle"),
    tweetCachedData: jsonb("tweet_cached_data")
      .$type<TweetCachedData>()
      .notNull(),
    tweetIsOwnedByCreator: boolean("tweet_is_owned_by_creator")
      .notNull()
      .default(false),

    /* Action configuration --------------------------------------------- */
    actionConfig: jsonb("action_config").$type<ActionConfig>().notNull(),
    /** Always false on new rows — kept for compatibility with Phase 2
     *  bounties that were created before we deprecated like verification. */
    requiresLike: boolean("requires_like").notNull().default(false),
    requiresRetweet: boolean("requires_retweet").notNull().default(false),
    requiresReply: boolean("requires_reply").notNull().default(false),
    requiresQuote: boolean("requires_quote").notNull().default(false),
    requiresFollow: boolean("requires_follow").notNull().default(false),
    /** Handle of the account hunters must follow (no @, lowercase).
     *  Null when `requiresFollow=false`. */
    followTargetHandle: text("follow_target_handle"),

    /* Reply rules (denormalized for filtering) ------------------------- */
    replyKeywordsRequired: text("reply_keywords_required").array(),
    replyKeywordsPool: text("reply_keywords_pool").array(),
    replyKeywordsPoolMinimum: integer("reply_keywords_pool_minimum"),
    replyKeywordsForbidden: text("reply_keywords_forbidden").array(),
    replyMinLength: integer("reply_min_length").notNull().default(0),
    replyMinWords: integer("reply_min_words").notNull().default(0),
    replyMatchType: text("reply_match_type").notNull().default("word"),

    /* Rewards ---------------------------------------------------------- */
    rewardTokenMint: text("reward_token_mint").notNull(),
    rewardTokenSymbol: text("reward_token_symbol").notNull(),
    rewardTokenDecimals: integer("reward_token_decimals").notNull(),
    rewardPerHunter: numeric("reward_per_hunter", { precision: 30, scale: 9 })
      .notNull(),
    rewardPerHunterUsd: numeric("reward_per_hunter_usd", {
      precision: 20,
      scale: 6,
    }),
    maxHunters: integer("max_hunters").notNull(),
    totalPool: numeric("total_pool", { precision: 30, scale: 9 }).notNull(),
    totalPoolUsd: numeric("total_pool_usd", { precision: 20, scale: 6 }),
    platformFeeBps: integer("platform_fee_bps").notNull().default(500),
    platformFeeAmount: numeric("platform_fee_amount", {
      precision: 30,
      scale: 9,
    }),
    /** Flat per-launch creation fee, denominated in the reward token.
     *  Collected as part of the escrow transfer; the matching USD value
     *  lands in `platform_revenue.amount_usd` for accounting. */
    creationFeeAmount: numeric("creation_fee_amount", {
      precision: 30,
      scale: 9,
    }),
    creationFeeAmountUsd: numeric("creation_fee_amount_usd", {
      precision: 20,
      scale: 6,
    }),

    /* Distribution ----------------------------------------------------- */
    distributionModel: text("distribution_model").notNull(),
    distributionConfig: jsonb("distribution_config").$type<DistributionConfig>(),

    /* Eligibility ------------------------------------------------------ */
    eligibilityFilters: jsonb("eligibility_filters")
      .$type<EligibilityFilters>()
      .notNull(),
    minFollowers: integer("min_followers"),
    requireVerified: boolean("require_verified").notNull().default(false),
    minAccountAgeMonths: integer("min_account_age_months"),
    minReputationScore: numeric("min_reputation_score", {
      precision: 8,
      scale: 2,
    }),
    allowedCountries: text("allowed_countries").array(),
    blockedCountries: text("blocked_countries").array(),
    minPreviousBounties: integer("min_previous_bounties"),
    requireReputationTier: text("require_reputation_tier"),

    /* Escrow & on-chain ------------------------------------------------ */
    escrowTxHash: text("escrow_tx_hash"),
    escrowConfirmedAt: timestamp("escrow_confirmed_at", { withTimezone: true }),
    escrowAmount: numeric("escrow_amount", { precision: 30, scale: 9 }),
    treasuryAddress: text("treasury_address"),
    onChainStatus: text("on_chain_status").notNull().default("pending"),

    /* Refund (Phase 8) ------------------------------------------------- */
    /** Tx that returned the unclaimed pool to the creator after the
     *  bounty ended. Null when no refund was owed or it hasn't run yet. */
    refundTxHash: text("refund_tx_hash"),
    refundedAmount: numeric("refunded_amount", { precision: 30, scale: 9 }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),

    /* Lifecycle -------------------------------------------------------- */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),

    /* Denormalized counters ------------------------------------------- */
    currentHuntersCount: integer("current_hunters_count")
      .notNull()
      .default(0),
    claimedHuntersCount: integer("claimed_hunters_count")
      .notNull()
      .default(0),
    failedHuntersCount: integer("failed_hunters_count").notNull().default(0),
    pendingHuntersCount: integer("pending_hunters_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),

    /* Visibility & discovery ------------------------------------------ */
    isFeatured: boolean("is_featured").notNull().default(false),
    featuredUntil: timestamp("featured_until", { withTimezone: true }),
    isHidden: boolean("is_hidden").notNull().default(false),
    isNsfw: boolean("is_nsfw").notNull().default(false),
    visibilityType: text("visibility_type").notNull().default("public"),
    tags: text("tags").array(),
    category: text("category"),

    /* Stream / verification ops --------------------------------------- */
    streamSubscriptionId: text("stream_subscription_id"),
    streamSubscribedAt: timestamp("stream_subscribed_at", {
      withTimezone: true,
    }),
    lastEngagementCheckAt: timestamp("last_engagement_check_at", {
      withTimezone: true,
    }),
    engagementCheckErrorCount: integer("engagement_check_error_count")
      .notNull()
      .default(0),
  },
  (table) => [
    index("bounties_creator_idx").on(table.creatorUserId),
    index("bounties_tweet_id_idx").on(table.tweetId),
    index("bounties_status_ends_at_idx").on(table.status, table.endsAt),
    index("bounties_status_created_at_idx").on(
      table.status,
      table.createdAt.desc(),
    ),
    index("bounties_status_reward_usd_idx").on(
      table.status,
      table.rewardPerHunterUsd.desc(),
    ),
    index("bounties_status_almost_full_idx").on(
      table.status,
      table.currentHuntersCount.asc(),
      table.maxHunters,
    ),
    index("bounties_category_status_idx").on(table.category, table.status),
    index("bounties_tags_gin_idx").using("gin", table.tags),
    index("bounties_featured_idx")
      .on(table.isFeatured, table.featuredUntil)
      .where(sql`${table.isFeatured} = true`),
    index("bounties_slug_idx").on(table.slug),
    // Replay protection on escrow: a given tx hash can never anchor more
    // than one bounty. Keyed on (chain, hash) because a Solana base58
    // signature and a Monad 0x hash share this text column and could
    // otherwise collide. Partial unique so draft rows (NULL hash) coexist.
    uniqueIndex("bounties_escrow_tx_hash_unique")
      .on(table.chain, table.escrowTxHash)
      .where(sql`${table.escrowTxHash} IS NOT NULL`),
    // Replay protection on refund: same as above for refund txs.
    uniqueIndex("bounties_refund_tx_hash_unique")
      .on(table.chain, table.refundTxHash)
      .where(sql`${table.refundTxHash} IS NOT NULL`),
  ],
);
