import { sql } from "drizzle-orm";
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* =========================================================================
   JSONB payload shapes
   ========================================================================= */

export type NotificationPreferences = {
  web?: { enabled: boolean; types?: string[] };
  push?: { enabled: boolean; types?: string[] };
  email?: { enabled: boolean; types?: string[] };
};

/** Full twitterapi.io profile snapshot. Stored verbatim for forward-compat. */
export type TwitterRawProfile = Record<string, unknown>;

/* =========================================================================
   users
   ========================================================================= */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // DEPRECATED: pre-NextAuth identifier. Nullable since the
    // Privy-removal migration. Kept so historical lookups don't lose
    // the linkage between old auth records and current users.
    privyId: text("privy_id").unique(),
    /** Solana wallet that signs txs + receives rewards. Nullable now —
     *  users authenticate via Twitter only, then connect a wallet
     *  lazily when they create or claim. */
    walletAddress: text("wallet_address").unique(),
    walletConnectedAt: timestamp("wallet_connected_at", {
      withTimezone: true,
    }),
    /** Wallet adapter name (e.g. "Phantom", "Solflare") — purely
     *  informational, used for "Connected via X" UX strings. */
    walletProvider: text("wallet_provider"),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),

    /* Twitter profile (synced from twitterapi.io) ----------------------- */
    twitterId: text("twitter_id").notNull().unique(),
    twitterHandle: text("twitter_handle").notNull(),
    twitterVerified: boolean("twitter_verified").notNull().default(false),
    twitterFollowers: integer("twitter_followers").notNull().default(0),
    twitterFollowing: integer("twitter_following").notNull().default(0),
    twitterTweetCount: integer("twitter_tweet_count").notNull().default(0),
    twitterAccountCreatedAt: timestamp("twitter_account_created_at", {
      withTimezone: true,
    }),
    twitterLastSyncedAt: timestamp("twitter_last_synced_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    twitterRawProfile: jsonb("twitter_raw_profile").$type<TwitterRawProfile>(),

    /* Reputation & scoring --------------------------------------------- */
    reputationScore: numeric("reputation_score", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    totalBountiesCompleted: integer("total_bounties_completed")
      .notNull()
      .default(0),
    totalBountiesFailed: integer("total_bounties_failed").notNull().default(0),
    totalRewardsEarnedUsd: numeric("total_rewards_earned_usd", {
      precision: 20,
      scale: 6,
    })
      .notNull()
      .default("0"),
    totalRewardsClaimedUsd: numeric("total_rewards_claimed_usd", {
      precision: 20,
      scale: 6,
    })
      .notNull()
      .default("0"),
    streakDays: integer("streak_days").notNull().default(0),
    longestStreakDays: integer("longest_streak_days").notNull().default(0),
    accountTier: text("account_tier").notNull().default("standard"),

    /* Platform engagement (creator-side) -------------------------------- */
    totalBountiesCreated: integer("total_bounties_created")
      .notNull()
      .default(0),
    totalSpentAsCreatorUsd: numeric("total_spent_as_creator_usd", {
      precision: 20,
      scale: 6,
    })
      .notNull()
      .default("0"),
    isCreatorVerified: boolean("is_creator_verified").notNull().default(false),

    /* Settings & preferences ------------------------------------------- */
    emailAddress: text("email_address"),
    emailVerified: boolean("email_verified").notNull().default(false),
    notificationPreferences: jsonb("notification_preferences")
      .$type<NotificationPreferences>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    referralCode: text("referral_code").unique(),
    referredByUserId: uuid("referred_by_user_id").references(
      (): AnyPgColumn => users.id,
      { onDelete: "set null" },
    ),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en"),

    /* Moderation -------------------------------------------------------- */
    isBanned: boolean("is_banned").notNull().default(false),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    bannedReason: text("banned_reason"),
    bannedByUserId: uuid("banned_by_user_id").references(
      (): AnyPgColumn => users.id,
      { onDelete: "set null" },
    ),
    shadowBanned: boolean("shadow_banned").notNull().default(false),

    /* Smart followers — denormalized so eligibility checks are a single
     *  indexed lookup, not a join over the smart_account_followers
     *  table on every claim.
     *
     *  Maintained:
     *   • inline on /api/auth/sync (twitter signup populates fresh)
     *   • by the smart-account sync workers when a hunter's follower
     *     status changes (Phase 7+ background job)
     *   • on demand when `smartFollowerLastCheckedAt` is older than 24h */
    smartFollowerCount: integer("smart_follower_count").notNull().default(0),
    smartFollowerLastCheckedAt: timestamp("smart_follower_last_checked_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("users_handle_lower_unique").on(sql`lower(${table.handle})`),
    index("users_reputation_score_idx").on(table.reputationScore.desc()),
    index("users_total_rewards_earned_idx").on(
      table.totalRewardsEarnedUsd.desc(),
    ),
    index("users_created_at_idx").on(table.createdAt.desc()),
    index("users_referral_code_idx").on(table.referralCode),
    index("users_active_idx")
      .on(table.id)
      .where(sql`${table.isBanned} = false`),
    index("users_smart_follower_count_idx").on(
      table.smartFollowerCount.desc(),
    ),
  ],
);
