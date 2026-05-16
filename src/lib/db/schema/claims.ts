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
import { bounties } from "./bounties";

/* =========================================================================
   JSONB payload shapes
   ========================================================================= */

export type ClaimVerificationDetails = {
  actions: {
    like?: { verified: boolean; checkedAt: string; source?: string };
    retweet?: { verified: boolean; checkedAt: string; source?: string };
    reply?: { verified: boolean; checkedAt: string; tweetId?: string };
    quote?: { verified: boolean; checkedAt: string; tweetId?: string };
  };
  replyRulesPassed?: string[];
  replyRulesFailed?: string[];
  /** Layer-1 vs layer-2 stage marker, free-form for ops. */
  stage?: "initial" | "final";
};

/* =========================================================================
   claims — the user-bounty record (formerly "raids")
   ========================================================================= */

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bountyId: uuid("bounty_id")
      .notNull()
      .references(() => bounties.id, { onDelete: "cascade" }),
    hunterUserId: uuid("hunter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("awaiting_action"),

    /* Lifecycle ------------------------------------------------------- */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    huntStartedAt: timestamp("hunt_started_at", { withTimezone: true }),
    actionClaimedAt: timestamp("action_claimed_at", { withTimezone: true }),
    initialVerifiedAt: timestamp("initial_verified_at", { withTimezone: true }),
    finalCheckScheduledAt: timestamp("final_check_scheduled_at", {
      withTimezone: true,
    }),
    finalCheckAttemptedAt: timestamp("final_check_attempted_at", {
      withTimezone: true,
    }),
    finalVerifiedAt: timestamp("final_verified_at", { withTimezone: true }),
    claimWindowEndsAt: timestamp("claim_window_ends_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),

    /* Verification details ------------------------------------------- */
    verificationDetails: jsonb("verification_details")
      .$type<ClaimVerificationDetails>(),
    likeVerified: boolean("like_verified"),
    retweetVerified: boolean("retweet_verified"),
    replyVerified: boolean("reply_verified"),
    replyTweetId: text("reply_tweet_id"),
    replyText: text("reply_text"),
    quoteVerified: boolean("quote_verified"),
    quoteTweetId: text("quote_tweet_id"),
    quoteText: text("quote_text"),
    /** Phase 8.5: denormalized follow result so the action checklist
     *  UI can render a green check without parsing verificationDetails
     *  JSON on every render. Set by Layer 1 (REST follow check); Layer 2
     *  never touches it because the stream can't see follow events. */
    followVerified: boolean("follow_verified"),
    failureReason: text("failure_reason"),
    failureCategory: text("failure_category"),
    verificationAttempts: integer("verification_attempts").notNull().default(0),
    lastVerificationAttemptAt: timestamp("last_verification_attempt_at", {
      withTimezone: true,
    }),

    /* Reward (frozen at hunt time) ----------------------------------- */
    rewardAmount: numeric("reward_amount", { precision: 30, scale: 9 }).notNull(),
    rewardAmountUsd: numeric("reward_amount_usd", { precision: 20, scale: 6 }),
    rewardTokenMint: text("reward_token_mint").notNull(),
    rewardTokenSymbol: text("reward_token_symbol").notNull(),
    platformFeeAmount: numeric("platform_fee_amount", {
      precision: 30,
      scale: 9,
    }),
    claimTxHash: text("claim_tx_hash"),
    claimTxConfirmedAt: timestamp("claim_tx_confirmed_at", {
      withTimezone: true,
    }),
    claimTxError: text("claim_tx_error"),
    /** Stamped when the claim flips to `claiming`. The stuck-claim
     *  recovery cron looks for rows whose claimAttemptedAt is older
     *  than 5 min — that means a sendReward call started but never
     *  finalized (process crash, network hiccup, RPC stall). */
    claimAttemptedAt: timestamp("claim_attempted_at", { withTimezone: true }),

    /* Bot-detection signals (future ML) ------------------------------- */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    deviceFingerprint: text("device_fingerprint"),
    sessionDurationSeconds: integer("session_duration_seconds"),
    mouseEventsCount: integer("mouse_events_count"),
    referrer: text("referrer"),

    /* Eligibility snapshot (audit) ----------------------------------- */
    userTwitterFollowersAtHunt: integer("user_twitter_followers_at_hunt"),
    userTwitterVerifiedAtHunt: boolean("user_twitter_verified_at_hunt"),
    userReputationScoreAtHunt: numeric("user_reputation_score_at_hunt", {
      precision: 8,
      scale: 2,
    }),
  },
  (table) => [
    uniqueIndex("claims_bounty_hunter_unique").on(
      table.bountyId,
      table.hunterUserId,
    ),
    index("claims_bounty_idx").on(table.bountyId),
    index("claims_hunter_idx").on(table.hunterUserId),
    index("claims_status_final_check_idx").on(
      table.status,
      table.finalCheckScheduledAt,
    ),
    index("claims_bounty_status_idx").on(table.bountyId, table.status),
    index("claims_hunter_status_idx").on(table.hunterUserId, table.status),
    index("claims_hunter_created_idx").on(
      table.hunterUserId,
      table.createdAt.desc(),
    ),
    index("claims_status_window_idx").on(
      table.status,
      table.claimWindowEndsAt,
    ),
    index("claims_status_action_claimed_idx").on(
      table.status,
      table.actionClaimedAt,
    ),
    index("claims_tx_hash_idx").on(table.claimTxHash),
    // Replay protection: a given Solana tx signature can never be
    // recorded against more than one claim. Partial unique so NULL
    // (the default for pre-claim rows) doesn't collide.
    uniqueIndex("claims_claim_tx_hash_unique")
      .on(table.claimTxHash)
      .where(sql`${table.claimTxHash} IS NOT NULL`),
    index("claims_status_attempted_idx").on(
      table.status,
      table.claimAttemptedAt,
    ),
  ],
);
