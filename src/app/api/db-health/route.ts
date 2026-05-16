import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/db-health — extended health probe used by the design-system page.
 *
 * Returns:
 *  • connection status (implicit via 200 vs 503)
 *  • row counts for every user-facing table
 *  • the latest migration's filename + applied_at
 *  • list of indexes on the `public` schema
 *  • a sample COUNT(*) latency measurement
 *
 * Intentionally read-only and safe to expose in dev / staging. Production
 * deploys should gate this behind admin auth.
 */

const TABLES = [
  "users",
  "bounties",
  "claims",
  "tokens",
  "notifications",
  "social_follows",
  "social_activities",
  "tweet_engagement_cache",
  "tweet_engagers",
  "tweet_stream_subscriptions",
  "platform_revenue",
  "buybacks",
  "api_call_log",
  "audit_log",
  "feature_flags",
  "daily_metrics",
] as const;

export async function GET() {
  const db = getDb();
  try {
    /* ---- row counts ---------------------------------------------------- */
    // One round-trip via UNION ALL so we don't fan out 16 queries.
    const countSql = TABLES.map(
      (t) => `SELECT '${t}'::text AS table_name, COUNT(*)::int AS row_count FROM ${t}`,
    ).join(" UNION ALL ");
    const countRows = (await db.execute(
      sql.raw(countSql),
    )) as unknown as Array<{ table_name: string; row_count: number }>;
    const tables = countRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.table_name] = Number(r.row_count);
      return acc;
    }, {});

    /* ---- migrations --------------------------------------------------- */
    let lastMigration: { hash: string | null; createdAt: string | null } = {
      hash: null,
      createdAt: null,
    };
    try {
      const migRows = (await db.execute(sql`
        SELECT hash, created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY id DESC
        LIMIT 1
      `)) as unknown as Array<{ hash: string; created_at: string | number | Date }>;
      if (migRows[0]) {
        const c = migRows[0].created_at;
        const createdAt =
          typeof c === "number"
            ? new Date(c).toISOString()
            : c instanceof Date
              ? c.toISOString()
              : String(c);
        lastMigration = { hash: migRows[0].hash, createdAt };
      }
    } catch {
      // table doesn't exist yet (db:push was used instead of db:migrate)
    }

    /* ---- indexes ------------------------------------------------------ */
    const indexRows = (await db.execute(sql`
      SELECT schemaname, tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `)) as unknown as Array<{
      schemaname: string;
      tablename: string;
      indexname: string;
    }>;
    const indexes = indexRows.map((r) => ({
      table: r.tablename,
      name: r.indexname,
    }));

    /* ---- sample latency ---------------------------------------------- */
    const t0 = performance.now();
    await db.execute(sql`SELECT COUNT(*) FROM users`);
    const sampleLatencyMs = Math.round(performance.now() - t0);

    return NextResponse.json({
      ok: true,
      tables,
      lastMigration,
      indexes,
      sampleLatencyMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
