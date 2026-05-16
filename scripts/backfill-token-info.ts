/**
 * One-off backfill: enrich every token row via DexScreener.
 *
 *   npm run tokens:backfill
 *
 * Useful after the Phase-8.5 migration adds new columns — existing
 * seeded tokens (USDC, SOL, BNTY, etc.) get their logoUrl + priceUsd +
 * marketCap/liquidity/volume populated. Skips tokens flagged as scams
 * and any mint that DexScreener can't price (logs them so an operator
 * can decide whether to keep or hide them).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  enrichToken,
  TokenNotFoundError,
  TokenPriceUnavailableError,
} from "@/lib/tokens/enrichment";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }
  const client = postgres(url, { max: 2, prepare: false });
  const db = drizzle(client, { schema });

  const rows = await db
    .select({ mint: schema.tokens.mint, symbol: schema.tokens.symbol })
    .from(schema.tokens)
    .where(eq(schema.tokens.flaggedAsScam, false));

  console.log(`Backfilling ${rows.length} tokens…`);

  let ok = 0;
  let skipped = 0;
  const failed: Array<{ mint: string; symbol: string; error: string }> = [];

  for (const row of rows) {
    try {
      await enrichToken(row.mint, { forceRefresh: true });
      ok += 1;
      process.stdout.write(".");
    } catch (err) {
      if (
        err instanceof TokenNotFoundError ||
        err instanceof TokenPriceUnavailableError
      ) {
        skipped += 1;
        process.stdout.write("s");
      } else {
        failed.push({
          mint: row.mint,
          symbol: row.symbol,
          error: err instanceof Error ? err.message : String(err),
        });
        process.stdout.write("x");
      }
    }
  }

  console.log("\n");
  console.log(`Refreshed: ${ok}`);
  console.log(`Skipped (no DexScreener data): ${skipped}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`  ${f.symbol} (${f.mint.slice(0, 8)}…): ${f.error}`);
    }
  }

  await client.end({ timeout: 5 });
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
