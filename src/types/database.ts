/**
 * Inferred row types and enum unions for every Drizzle table.
 *
 * Import from here when you only need types — keeps client bundles from
 * pulling in `drizzle-orm/pg-core`.
 */
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
  users,
  bounties,
  claims,
  tweetEngagementCache,
  tweetEngagers,
  tweetStreamSubscriptions,
  streamEventsLog,
  tokens,
  notifications,
  socialFollows,
  socialActivities,
  platformRevenue,
  buybacks,
  apiCallLog,
  auditLog,
  featureFlags,
  dailyMetrics,
  smartAccounts,
  smartAccountFollowers,
} from "@/lib/db/schema";

/* users ------------------------------------------------------------------ */
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

/* bounties --------------------------------------------------------------- */
export type Bounty = InferSelectModel<typeof bounties>;
export type NewBounty = InferInsertModel<typeof bounties>;

/* claims ----------------------------------------------------------------- */
export type Claim = InferSelectModel<typeof claims>;
export type NewClaim = InferInsertModel<typeof claims>;

/* engagement / verification --------------------------------------------- */
export type TweetEngagementCache = InferSelectModel<typeof tweetEngagementCache>;
export type NewTweetEngagementCache = InferInsertModel<
  typeof tweetEngagementCache
>;
export type TweetEngager = InferSelectModel<typeof tweetEngagers>;
export type NewTweetEngager = InferInsertModel<typeof tweetEngagers>;
export type TweetStreamSubscription = InferSelectModel<
  typeof tweetStreamSubscriptions
>;
export type NewTweetStreamSubscription = InferInsertModel<
  typeof tweetStreamSubscriptions
>;
export type StreamEventLog = InferSelectModel<typeof streamEventsLog>;
export type NewStreamEventLog = InferInsertModel<typeof streamEventsLog>;

/* tokens ----------------------------------------------------------------- */
export type Token = InferSelectModel<typeof tokens>;
export type NewToken = InferInsertModel<typeof tokens>;

/* notifications ---------------------------------------------------------- */
export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;

/* social ----------------------------------------------------------------- */
export type SocialFollow = InferSelectModel<typeof socialFollows>;
export type NewSocialFollow = InferInsertModel<typeof socialFollows>;
export type SocialActivity = InferSelectModel<typeof socialActivities>;
export type NewSocialActivity = InferInsertModel<typeof socialActivities>;

/* analytics -------------------------------------------------------------- */
export type PlatformRevenue = InferSelectModel<typeof platformRevenue>;
export type NewPlatformRevenue = InferInsertModel<typeof platformRevenue>;
export type Buyback = InferSelectModel<typeof buybacks>;
export type NewBuyback = InferInsertModel<typeof buybacks>;
export type ApiCallLog = InferSelectModel<typeof apiCallLog>;
export type NewApiCallLog = InferInsertModel<typeof apiCallLog>;
export type AuditLog = InferSelectModel<typeof auditLog>;
export type NewAuditLog = InferInsertModel<typeof auditLog>;
export type DailyMetric = InferSelectModel<typeof dailyMetrics>;
export type NewDailyMetric = InferInsertModel<typeof dailyMetrics>;

/* smart followers -------------------------------------------------------- */
export type SmartAccount = InferSelectModel<typeof smartAccounts>;
export type NewSmartAccount = InferInsertModel<typeof smartAccounts>;
export type SmartAccountFollower = InferSelectModel<
  typeof smartAccountFollowers
>;
export type NewSmartAccountFollower = InferInsertModel<
  typeof smartAccountFollowers
>;

/* flags ------------------------------------------------------------------ */
export type FeatureFlag = InferSelectModel<typeof featureFlags>;
export type NewFeatureFlag = InferInsertModel<typeof featureFlags>;

/* =========================================================================
   String-union enums (kept here to dodge pg_enum migrations every time we
   add a status). When app code needs to constrain a status, import these.
   ========================================================================= */

export type UserAccountTier =
  | "standard"
  | "verified"
  | "premium"
  | "banned";

export type BountyStatus =
  | "draft"
  | "active"
  | "finalizing"
  | "completed"
  | "refunded"
  | "broken"
  | "cancelled"
  | "paused";

export type BountyOnChainStatus =
  | "pending"
  | "escrowed"
  | "distributed"
  | "refunded";

export type BountyVisibility = "public" | "unlisted" | "private";

export type ClaimStatus =
  | "awaiting_action"
  | "action_claimed"
  | "initial_verified"
  | "awaiting_final"
  | "verified"
  | "claiming"
  | "failed"
  | "claimed_reward"
  | "expired"
  | "cancelled";

export type ClaimFailureCategory =
  | "action_not_done"
  | "action_withdrawn"
  | "retweet_not_done"
  | "follow_not_active"
  | "reply_rules_failed"
  | "reply_missing_keyword"
  | "reply_has_forbidden_keyword"
  | "reply_too_short"
  | "reply_deleted"
  | "quote_missing_keyword"
  | "quote_has_forbidden_keyword"
  | "quote_too_short"
  | "quote_deleted"
  | "tweet_deleted"
  | "author_suspended"
  | "eligibility_failed"
  | "verification_limit_exceeded"
  | "rate_limited"
  | "internal_error"
  | "other";

export type DistributionModel =
  | "fixed_slot"
  | "pool_quadratic"
  | "pool_lottery"
  | "quality_tiered";

export type BountyCategory =
  | "memecoin_launch"
  | "brand_marketing"
  | "community_engagement"
  | "product_launch"
  | "creator_promo"
  | "other";

export type EngagementType = "like" | "retweet" | "reply" | "quote";

export type NotificationType =
  | "claim_initial_verified"
  | "claim_final_verified"
  | "claim_failed"
  | "claim_ready_to_claim"
  | "claim_window_expiring"
  | "claim_expired"
  | "bounty_filled"
  | "bounty_ended"
  | "bounty_paused"
  | "new_eligible_bounty"
  | "new_follower"
  | "new_reply"
  | "buyback_completed"
  | "maintenance_notice"
  | "referral_signup"
  | "reputation_tier_up";

export type NotificationChannel = "web" | "push" | "email";

export type TokenCategory =
  | "stablecoin"
  | "platform"
  | "sol_ecosystem"
  | "memecoin"
  | "bags_creator"
  | "other";

export type ActivityType =
  | "bounty_created"
  | "bounty_completed"
  | "bounty_claimed"
  | "claim_started"
  | "claim_verified"
  | "claim_failed"
  | "level_up"
  | "achievement"
  | "follow"
  | "referral_joined";

export type RevenueSourceType =
  | "claim_fee"
  | "creator_fee"
  | "swap_fee"
  | "other";

export type BuybackStatus = "pending" | "executed" | "failed";

export type AuditActorType = "user" | "admin" | "system" | "cron";

export type ApiService =
  | "twitterapi"
  | "jupiter"
  | "helius"
  | "solana"
  | "other";

/* JSONB payloads (re-exported so callers don't pull from schema files) -- */
export type {
  NotificationPreferences,
  TwitterRawProfile,
} from "@/lib/db/schema/users";
export type {
  ActionConfig,
  ReplyRules,
  TextActionRules,
  FollowAction,
  QuoteAction,
  SmartFollowersConfig,
  TweetCachedData,
  EligibilityFilters,
  DistributionConfig,
} from "@/lib/db/schema/bounties";
export type { ClaimVerificationDetails } from "@/lib/db/schema/claims";
export type { SocialActivityMetadata } from "@/lib/db/schema/social";
export type {
  JupiterRouteSnapshot,
  ApiRequestMetadata,
  AuditState,
} from "@/lib/db/schema/analytics";
