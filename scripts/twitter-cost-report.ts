/**
 * Twitter API cost report — slices `api_call_log` rows by service and
 * endpoint and prints the per-bucket sum + a 7-day projection.
 *
 *   npm run twitter:cost-report           # last 24h
 *   npm run twitter:cost-report -- 168    # last 7d (hours)
 *   npm run twitter:cost-report -- 1      # last 1h
 *
 * Use after a wave of verifications to confirm Phase 7's two-layer
 * model is actually cheaper than naive per-claim REST polling. A
 * "healthy" reading is dominated by `/oapi/tweet_filter/*` (free) and a
 * small tail of `/twitter/tweet/replies` from the cache miss path.
 */

import { and, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

async function main() {
  const hoursArg = process.argv[2] ? Number(process.argv[2]) : 24;
  if (!Number.isFinite(hoursArg) || hoursArg <= 0) {
    console.error("Usage: twitter-cost-report.ts [hours]");
    process.exit(2);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }
  const client = postgres(url, { max: 2, prepare: false });
  const db = drizzle(client, { schema });
  const { apiCallLog } = schema;

  const cutoff = new Date(Date.now() - hoursArg * 3_600_000);

  const rows = await db
    .select({
      endpoint: apiCallLog.endpoint,
      calls: sql<number>`count(*)::int`.as("calls"),
      errors: sql<number>`sum(case when ${apiCallLog.success} then 0 else 1 end)::int`.as(
        "errors",
      ),
      cost: sql<string>`coalesce(sum(${apiCallLog.estimatedCostUsd}), 0)::text`.as(
        "cost",
      ),
    })
    .from(apiCallLog)
    .where(
      and(
        gte(apiCallLog.createdAt, cutoff),
        sql`${apiCallLog.service} = 'twitterapi.io'`,
      ),
    )
    .groupBy(apiCallLog.endpoint)
    .orderBy(sql`coalesce(sum(${apiCallLog.estimatedCostUsd}), 0) desc`);

  const total = rows.reduce((acc, r) => acc + Number(r.cost), 0);
  const projection = (total / hoursArg) * 24 * 7;

  console.log(`Window: ${hoursArg}h, since ${cutoff.toISOString()}`);
  console.log("");
  const header = `${pad("endpoint", 48)} ${pad("calls", 8)} ${pad("err", 6)} ${pad("$ usd", 12)}`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of rows) {
    console.log(
      `${pad(r.endpoint, 48)} ${pad(String(r.calls), 8)} ${pad(String(r.errors), 6)} ${pad(usd(r.cost), 12)}`,
    );
  }
  console.log("-".repeat(header.length));
  console.log(`${pad("TOTAL", 48)} ${pad("", 8)} ${pad("", 6)} ${pad(usd(total), 12)}`);
  console.log("");
  console.log(`7d projection at current rate: ${usd(projection)}`);

  await client.end({ timeout: 5 });
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function usd(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
