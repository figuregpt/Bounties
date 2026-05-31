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

/* =========================================================================
   tokens — registry of every token used on the platform
   ========================================================================= */

export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Chain this token lives on. The same symbol (e.g. USDC) exists on
     *  both Solana and Monad with different addresses, so `mint` alone is
     *  no longer unique — see the composite (chain, mint) index below. */
    chain: text("chain").notNull().default("solana"),
    mint: text("mint").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    decimals: integer("decimals").notNull(),
    logoUrl: text("logo_url"),
    category: text("category"),
    isWhitelisted: boolean("is_whitelisted").notNull().default(false),
    whitelistedAt: timestamp("whitelisted_at", { withTimezone: true }),
    isVerified: boolean("is_verified").notNull().default(false),
    coingeckoId: text("coingecko_id"),
    /** Reference USD price. Phase 8.5 writes DexScreener's quote here;
     *  column name kept for back-compat with seed + earlier code. */
    jupiterPriceUsd: numeric("jupiter_price_usd", { precision: 20, scale: 8 }),
    jupiterPriceUpdatedAt: timestamp("jupiter_price_updated_at", {
      withTimezone: true,
    }),
    totalVolumeAsRewardUsd: numeric("total_volume_as_reward_usd", {
      precision: 20,
      scale: 6,
    })
      .notNull()
      .default("0"),
    bountyCount: integer("bounty_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /* Phase 8.5 — DexScreener enrichment + admin moderation -------------- */
    marketCapUsd: numeric("market_cap_usd", { precision: 24, scale: 2 }),
    liquidityUsd: numeric("liquidity_usd", { precision: 24, scale: 2 }),
    volume24hUsd: numeric("volume_24h_usd", { precision: 24, scale: 2 }),
    priceChange24hPercent: numeric("price_change_24h_percent", {
      precision: 12,
      scale: 4,
    }),
    dexScreenerPairAddress: text("dex_screener_pair_address"),
    /** Admin manually marked this token as trusted (skips warnings). */
    isAdminVerified: boolean("is_admin_verified").notNull().default(false),
    /** Admin flagged this as a known scam — bounty creation is blocked. */
    flaggedAsScam: boolean("flagged_as_scam").notNull().default(false),
    /** First time we saw this mint (different from `createdAt`, which is
     *  when seed inserted it — for tokens enriched on-the-fly these
     *  values match). Used for the "newly listed" warning. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Incremented every time a bounty is created with this token —
     *  drives the "quick picks" chip list in /create. */
    usageCount: integer("usage_count").notNull().default(0),
  },
  (table) => [
    // A token is identified by (chain, mint) — the same address space is
    // not shared across chains, and the same symbol recurs per chain.
    uniqueIndex("tokens_chain_mint_unique").on(table.chain, table.mint),
    index("tokens_symbol_idx").on(table.symbol),
    index("tokens_category_whitelist_idx").on(
      table.category,
      table.isWhitelisted,
    ),
    index("tokens_whitelist_volume_idx").on(
      table.isWhitelisted,
      table.totalVolumeAsRewardUsd.desc(),
    ),
    index("tokens_usage_idx").on(table.usageCount.desc()),
    index("tokens_flagged_idx").on(table.flaggedAsScam),
  ],
);
