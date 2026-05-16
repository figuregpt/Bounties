import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  smartAccountFollowers,
  smartAccounts,
  users,
} from "@/lib/db/schema";

/**
 * Hot-path eligibility check: how many ACTIVE smart accounts follow
 * this Twitter id?
 *
 * Reads `smart_account_followers` joined with `smart_accounts.is_active`.
 * The hot index is on `follower_twitter_id`, so the lookup is O(log n)
 * + the count of matching rows — sub-millisecond for typical hunters.
 *
 * Re-staleness: after this call we usually also bump
 * `users.smart_follower_last_checked_at` via `recomputeAndPersist` so
 * future signals know how fresh the denorm is.
 */
export async function getSmartFollowerCount(
  hunterTwitterId: string,
): Promise<number> {
  if (!hunterTwitterId) return 0;
  const [row] = await getDb()
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(smartAccountFollowers)
    .innerJoin(
      smartAccounts,
      eq(smartAccountFollowers.smartAccountId, smartAccounts.id),
    )
    .where(
      and(
        eq(smartAccountFollowers.followerTwitterId, hunterTwitterId),
        eq(smartAccounts.isActive, true),
      ),
    );
  return Number(row?.count ?? 0);
}

/**
 * Counts that the audience estimator and the create-bounty page header
 * need at server-render time. One round-trip, all the snapshots we
 * surface in the UI.
 *
 * `hunterBuckets` lets us answer "approximately how many hunters have
 * at least N smart followers?" without scanning the table for every
 * filter change — the UI interpolates between the precomputed
 * thresholds.
 */
export async function getSmartFollowerSnapshots(): Promise<{
  smartAccountCount: number;
  totalActiveHunters: number;
  hunterBuckets: Array<{ minimum: number; count: number }>;
}> {
  const db = getDb();
  const thresholds = [1, 3, 5, 10, 25] as const;

  const [accountRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(smartAccounts)
    .where(eq(smartAccounts.isActive, true));

  const [hunterRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(eq(users.isBanned, false));

  // Single SQL statement gathers all bucket counts to keep the page TTFB
  // tight. We aggregate over `users.smart_follower_count` directly
  // because that column is maintained inline at signup.
  const bucketRows = (await db.execute(sql`
    SELECT
      ${sql.raw(
        thresholds
          .map(
            (t) =>
              `COUNT(*) FILTER (WHERE smart_follower_count >= ${t})::int AS t${t}`,
          )
          .join(", "),
      )}
    FROM users
    WHERE is_banned = false
  `)) as unknown as Array<Record<string, number>>;
  const bucketCounts = bucketRows[0] ?? {};

  return {
    smartAccountCount: Number(accountRow?.count ?? 0),
    totalActiveHunters: Number(hunterRow?.count ?? 0),
    hunterBuckets: thresholds.map((t) => ({
      minimum: t,
      count: Number(bucketCounts[`t${t}`] ?? 0),
    })),
  };
}

/**
 * Recomputes a single user's `smartFollowerCount` and persists it +
 * `smartFollowerLastCheckedAt`. Cheap — one COUNT, one UPDATE.
 *
 * Returns the fresh count so call sites (auth/sync, lazy refresh) can
 * use it without a second SELECT.
 */
export async function recomputeAndPersistSmartFollowerCount(args: {
  userId: string;
  twitterId: string;
}): Promise<number> {
  const count = await getSmartFollowerCount(args.twitterId);
  await getDb()
    .update(users)
    .set({
      smartFollowerCount: count,
      smartFollowerLastCheckedAt: new Date(),
    })
    .where(eq(users.id, args.userId));
  return count;
}

/**
 * Approximate audience estimator that uses the precomputed buckets to
 * answer "≈ N hunters have ≥ X smart followers" without a count query
 * per filter change. Returns the largest bucket count that's ≤ the
 * requested minimum (a conservative under-estimate).
 */
export function interpolateHunterBucket(
  buckets: Array<{ minimum: number; count: number }>,
  minimum: number,
): number {
  if (minimum <= 0) return 0;
  // Sort ascending just in case the caller passed an unordered array.
  const sorted = [...buckets].sort((a, b) => a.minimum - b.minimum);
  let candidate = sorted[0]?.count ?? 0;
  for (const b of sorted) {
    if (b.minimum > minimum) break;
    candidate = b.count;
  }
  return candidate;
}
