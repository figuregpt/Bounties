import "server-only";
import { and, count, eq, gte, like, or, sql, sum } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiCallLog, smartAccounts } from "@/lib/db/schema";

/**
 * Spend / activity report for the smart-followers infra.
 *
 * Everything pulls from `api_call_log` filtered to the followers
 * endpoint, plus the smart-account rows for refresh planning. No
 * separate accounting store needed.
 */

export type SmartFollowersCostReport = {
  totalCallsAllTime: number;
  totalCostAllTimeUsd: number;
  callsLast7Days: number;
  costLast7DaysUsd: number;
  /** Smart accounts whose cache is past its tier's incremental cadence. */
  nextScheduledRefreshAccounts: number;
  /** Rough projection — sum of follower snapshots × per-page cost / 200
   *  followers/page × refreshes/month. */
  estimatedMonthlyRefreshCostUsd: number;
};

const ENDPOINT_PREFIX = "/twitter/user/followers";

export async function getSmartFollowersCostReport(): Promise<SmartFollowersCostReport> {
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // All-time and 7-day spend counted from the api_call_log table — same
  // row stream that the broader /admin/spend view consumes, so the
  // numbers stay in sync without us double-bookkeeping.
  const [totalsRow] = await db
    .select({
      calls: count(),
      cost: sum(apiCallLog.estimatedCostUsd),
    })
    .from(apiCallLog)
    .where(
      and(
        eq(apiCallLog.service, "twitterapi"),
        like(apiCallLog.endpoint, `${ENDPOINT_PREFIX}%`),
      ),
    );

  const [recentRow] = await db
    .select({
      calls: count(),
      cost: sum(apiCallLog.estimatedCostUsd),
    })
    .from(apiCallLog)
    .where(
      and(
        eq(apiCallLog.service, "twitterapi"),
        like(apiCallLog.endpoint, `${ENDPOINT_PREFIX}%`),
        gte(apiCallLog.createdAt, sevenDaysAgo),
      ),
    );

  // Accounts with stale caches are anything whose `followers_cached_at`
  // is past its tier's incremental cadence. We compute it inline as
  // `now() - interval` per tier to avoid a JS-side fan-out.
  const [dueRow] = await db
    .select({ count: count() })
    .from(smartAccounts)
    .where(
      and(
        eq(smartAccounts.isActive, true),
        or(
          eq(smartAccounts.followersFullySynced, false),
          sql`(${smartAccounts.tier} = 'tier1' AND ${smartAccounts.followersCachedAt} < now() - interval '7 days')`,
          sql`(${smartAccounts.tier} = 'tier2' AND ${smartAccounts.followersCachedAt} < now() - interval '14 days')`,
          sql`(${smartAccounts.tier} = 'standard' AND ${smartAccounts.followersCachedAt} < now() - interval '30 days')`,
        ),
      ),
    );

  // Monthly projection: each account refreshes ~2-4 times/month
  // depending on tier; for each refresh we walk ceil(followers/200)
  // pages at ~$0.00015/page. We use the snapshot count as the proxy.
  const [projRow] = await db.execute<{ est: string }>(sql`
    SELECT COALESCE(SUM(
      CEIL(GREATEST(follower_count_snapshot, 0)::numeric / 200.0)
      * 0.00015
      * CASE tier
          WHEN 'tier1' THEN 4
          WHEN 'tier2' THEN 2
          ELSE 1
        END
    ), 0)::text AS est
    FROM smart_accounts
    WHERE is_active = true
  `);

  return {
    totalCallsAllTime: Number(totalsRow?.calls ?? 0),
    totalCostAllTimeUsd: Number(totalsRow?.cost ?? 0),
    callsLast7Days: Number(recentRow?.calls ?? 0),
    costLast7DaysUsd: Number(recentRow?.cost ?? 0),
    nextScheduledRefreshAccounts: Number(dueRow?.count ?? 0),
    estimatedMonthlyRefreshCostUsd: Number(projRow?.est ?? 0),
  };
}
