import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { bounties } from "./bounties";
import { claims } from "./claims";

/* =========================================================================
   buybacks — record of every BNTY buyback execution
   ========================================================================= */

export type JupiterRouteSnapshot = Record<string, unknown>;

export const buybacks = pgTable(
  "buybacks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buybackTxHash: text("buyback_tx_hash"),
    revenueIncludedUsd: numeric("revenue_included_usd", {
      precision: 20,
      scale: 6,
    }).notNull(),
    bntyAmountBought: numeric("bnty_amount_bought", {
      precision: 30,
      scale: 9,
    }).notNull(),
    bntyAmountBurned: numeric("bnty_amount_burned", {
      precision: 30,
      scale: 9,
    }).notNull(),
    bntyAmountToStakers: numeric("bnty_amount_to_stakers", {
      precision: 30,
      scale: 9,
    }).notNull(),
    jupiterRoute: jsonb("jupiter_route").$type<JupiterRouteSnapshot>(),
    priceImpactPercent: numeric("price_impact_percent", {
      precision: 8,
      scale: 4,
    }),
    executedAt: timestamp("executed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("buybacks_executed_at_idx").on(table.executedAt.desc()),
    index("buybacks_status_idx").on(table.status),
  ],
);

/* =========================================================================
   platform_revenue — every fee event we earned, fuels the buyback pipeline
   ========================================================================= */

export const platformRevenue = pgTable(
  "platform_revenue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: text("source_type").notNull(),
    claimId: uuid("claim_id").references(() => claims.id, {
      onDelete: "set null",
    }),
    bountyId: uuid("bounty_id").references(() => bounties.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 30, scale: 9 }).notNull(),
    amountUsd: numeric("amount_usd", { precision: 20, scale: 6 }).notNull(),
    tokenMint: text("token_mint").notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    includedInBuyback: boolean("included_in_buyback").notNull().default(false),
    buybackId: uuid("buyback_id").references((): AnyPgColumn => buybacks.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("platform_revenue_source_idx").on(table.sourceType, table.createdAt),
    index("platform_revenue_buyback_idx").on(
      table.includedInBuyback,
      table.createdAt,
    ),
    index("platform_revenue_buyback_id_idx").on(table.buybackId),
  ],
);

/* =========================================================================
   api_call_log — external API spend & error monitoring
   ========================================================================= */

export type ApiRequestMetadata = Record<string, unknown>;

export const apiCallLog = pgTable(
  "api_call_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service: text("service").notNull(),
    endpoint: text("endpoint").notNull(),
    method: text("method").notNull().default("GET"),
    statusCode: integer("status_code"),
    success: boolean("success").notNull().default(true),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 12,
      scale: 8,
    })
      .notNull()
      .default("0"),
    responseTimeMs: integer("response_time_ms"),
    bountyId: uuid("bounty_id").references(() => bounties.id, {
      onDelete: "set null",
    }),
    claimId: uuid("claim_id").references(() => claims.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    requestMetadata: jsonb("request_metadata").$type<ApiRequestMetadata>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("api_call_log_service_idx").on(table.service, table.createdAt.desc()),
    index("api_call_log_bounty_idx").on(table.bountyId, table.createdAt),
    index("api_call_log_errors_idx").on(
      table.success,
      table.statusCode,
      table.createdAt,
    ),
    index("api_call_log_created_idx").on(table.createdAt.desc()),
  ],
);

/* =========================================================================
   audit_log — state changes for compliance & debugging
   ========================================================================= */

export type AuditState = Record<string, unknown>;

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    beforeState: jsonb("before_state").$type<AuditState>(),
    afterState: jsonb("after_state").$type<AuditState>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_entity_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt.desc(),
    ),
    index("audit_log_actor_idx").on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
    index("audit_log_action_idx").on(table.action, table.createdAt.desc()),
  ],
);

/* =========================================================================
   daily_metrics — pre-aggregated daily snapshots
   ========================================================================= */

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().unique(),
    totalActiveBounties: integer("total_active_bounties").notNull().default(0),
    totalActiveHunters: integer("total_active_hunters").notNull().default(0),
    newUsersCount: integer("new_users_count").notNull().default(0),
    newBountiesCount: integer("new_bounties_count").notNull().default(0),
    completedClaimsCount: integer("completed_claims_count")
      .notNull()
      .default(0),
    totalRewardsDistributedUsd: numeric("total_rewards_distributed_usd", {
      precision: 20,
      scale: 6,
    })
      .notNull()
      .default("0"),
    totalRevenueUsd: numeric("total_revenue_usd", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    totalApiCostUsd: numeric("total_api_cost_usd", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    topTokenSymbol: text("top_token_symbol"),
    topCreatorUserId: uuid("top_creator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    topHunterUserId: uuid("top_hunter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("daily_metrics_date_idx").on(table.date)],
);
