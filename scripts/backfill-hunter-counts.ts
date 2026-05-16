/**
 * Recompute `users.smart_follower_count` for every existing user.
 *
 * Usage:
 *   npm run smart-accounts:backfill-hunters
 *
 * Run after a major sync (initial seed, big refresh batch) so all the
 * denorm counts reflect the cache. Inside the request path this work
 * happens inline on /api/auth/sync; this script catches users who
 * signed up before the cache existed.
 *
 * Cost: zero API spend — pure local joins.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { users } from "../src/lib/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set — load via dotenv-cli");
  }
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema: { users } });

  console.log("🔄  backfilling users.smart_follower_count");

  // Single SQL statement: for every user, compute the count of distinct
  // active smart accounts that follow them, then write it back. Avoids
  // a fan-out of N+1 queries from the JS side.
  const result = await db.execute(sql`
    WITH counts AS (
      SELECT
        u.id AS user_id,
        COUNT(*)::int AS smart_count
      FROM users u
      JOIN smart_account_followers saf
        ON saf.follower_twitter_id = u.twitter_id
      JOIN smart_accounts sa
        ON sa.id = saf.smart_account_id AND sa.is_active = true
      GROUP BY u.id
    )
    UPDATE users
    SET
      smart_follower_count = COALESCE(counts.smart_count, 0),
      smart_follower_last_checked_at = now()
    FROM counts
    WHERE users.id = counts.user_id
  `);

  // Also zero out users who lost their smart followers (or never had any).
  await db.execute(sql`
    UPDATE users
    SET smart_follower_count = 0,
        smart_follower_last_checked_at = now()
    WHERE smart_follower_count > 0
      AND NOT EXISTS (
        SELECT 1
        FROM smart_account_followers saf
        JOIN smart_accounts sa ON sa.id = saf.smart_account_id AND sa.is_active = true
        WHERE saf.follower_twitter_id = users.twitter_id
      )
  `);

  const updated = (result as unknown as { count?: number }).count ?? 0;
  console.log(`✅  backfill complete · touched ${updated} user rows`);

  // Show the new top hunters for a sanity check.
  const top = await db
    .select({
      handle: users.handle,
      smartFollowerCount: users.smartFollowerCount,
    })
    .from(users)
    .where(eq(users.isBanned, false))
    .orderBy(sql`smart_follower_count DESC`)
    .limit(5);
  if (top.length > 0) {
    console.log("\nTop hunters by smart follower count:");
    for (const row of top) {
      console.log(
        `  @${row.handle}: ${row.smartFollowerCount}`,
      );
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
