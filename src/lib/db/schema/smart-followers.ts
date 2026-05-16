import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ──────────────────────────────────────────────────────────────────────────
   Smart followers — reverse-cache approach.

   Instead of checking each hunter against the curated list at signup
   ($0.20/hunter), we cache the FOLLOWER LIST of each smart account in
   `smart_account_followers`. Hunter eligibility becomes a single indexed
   SELECT against `(follower_twitter_id, smart_account_id)` — zero API
   calls per claim.

   Storage profile:
     • ~200 smart accounts × 50K-1M followers each
     • 10-30M rows, 1-3 GB on disk
     • Single index on `follower_twitter_id` keeps the hot lookup
       sub-millisecond.

   Refresh model:
     • Tier-driven cadence (tier1/tier2/standard) — see `tier` column
     • Incremental: walks `followers_last_cursor` from where we stopped
     • Full re-sync: clears cursor + reloads to catch un-follows
     • Cron job picks "due" accounts; manual triggers via
       `npm run smart-accounts:refresh` until Phase 8 lands a worker
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Curated list of "smart" Twitter accounts whose follower set we treat
 * as a trust signal. Maintained by admin via `smart-accounts:seed`.
 */
export const smartAccounts = pgTable(
  "smart_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Twitter handle without @, lowercase. */
    handle: text("handle").notNull().unique(),
    /** Stable Twitter snowflake id, captured during seeding. Lets us
     *  detect handle renames without losing the cached follower list. */
    twitterId: text("twitter_id"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    /** Active = participates in eligibility checks. Soft-disable via
     *  `isActive=false` instead of deleting so we keep historical data. */
    isActive: boolean("is_active").notNull().default(true),
    /** Refresh prioritization. Higher tiers refresh more often. */
    tier: text("tier").notNull().default("standard"),
    /** Follower count snapshot at last sync. Used for cost planning
     *  and the audience-estimator denominator. */
    followerCountSnapshot: integer("follower_count_snapshot")
      .notNull()
      .default(0),
    followersCachedAt: timestamp("followers_cached_at", {
      withTimezone: true,
    }),
    /** True once we've walked the entire follower list at least once.
     *  Refresh jobs prefer accounts where this is false. */
    followersFullySynced: boolean("followers_fully_synced")
      .notNull()
      .default(false),
    /** Cursor returned by twitterapi.io's last call — resume from here
     *  on the next incremental refresh. */
    followersLastCursor: text("followers_last_cursor"),
    /** Cumulative USD cost of all twitterapi.io calls attributable to
     *  this account. Maintained by the sync worker. */
    estimatedRefreshCost: numeric("estimated_refresh_cost", {
      precision: 12,
      scale: 6,
    })
      .notNull()
      .default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("smart_accounts_active_idx").on(table.isActive),
    index("smart_accounts_tier_idx").on(table.tier, table.followersCachedAt),
    index("smart_accounts_due_idx").on(table.followersCachedAt),
  ],
);

/**
 * One row per (smart_account, twitter_follower). The hot lookup index
 * is on `follower_twitter_id` because hunter signup hits it on every
 * `/api/auth/sync` call.
 *
 * Phase 7+: we also write `cached_at` per row so a future cleanup job
 * can prune followers whose smart-account hasn't seen them in N days
 * (catches unfollows that the cursor walk missed).
 */
export const smartAccountFollowers = pgTable(
  "smart_account_followers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    smartAccountId: uuid("smart_account_id")
      .notNull()
      .references(() => smartAccounts.id, { onDelete: "cascade" }),
    followerTwitterId: text("follower_twitter_id").notNull(),
    followerHandle: text("follower_handle"),
    cachedAt: timestamp("cached_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("smart_account_followers_unique").on(
      table.smartAccountId,
      table.followerTwitterId,
    ),
    // Hot path: "how many smart accounts follow this hunter?"
    index("smart_account_followers_follower_idx").on(
      table.followerTwitterId,
    ),
    // Refresh ordering inside a single account.
    index("smart_account_followers_account_cached_idx").on(
      table.smartAccountId,
      table.cachedAt,
    ),
  ],
);

export type SmartAccountTier = "tier1" | "tier2" | "standard";

/** Refresh cadence per tier. Read by `refreshAllDueAccounts`. */
export const TIER_REFRESH_INTERVALS_MS: Record<
  SmartAccountTier,
  { incrementalMs: number; fullResyncMs: number }
> = {
  tier1: {
    incrementalMs: 7 * 24 * 60 * 60 * 1000,
    fullResyncMs: 30 * 24 * 60 * 60 * 1000,
  },
  tier2: {
    incrementalMs: 14 * 24 * 60 * 60 * 1000,
    fullResyncMs: 60 * 24 * 60 * 60 * 1000,
  },
  standard: {
    incrementalMs: 30 * 24 * 60 * 60 * 1000,
    fullResyncMs: 90 * 24 * 60 * 60 * 1000,
  },
};
