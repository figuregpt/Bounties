import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, lt, or, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bounties, tokens } from "@/lib/db/schema";
import { verifyCronRequest } from "@/lib/cron/auth";
import { enrichToken } from "@/lib/tokens/enrichment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/refresh-token-prices — every 5 minutes.
 *
 * Refreshes DexScreener price / liquidity / volume for tokens currently
 * referenced by an active bounty whose data has gone stale. Idempotent:
 * the enrichment service writes through to the `tokens` row with the
 * fresh timestamp so the next cron run will skip anything refreshed in
 * the last 5 minutes.
 *
 * Failures on individual tokens are logged + skipped — one bad mint
 * shouldn't take down the whole batch.
 */

const STALE_AFTER_MS = 5 * 60 * 1000;
const BATCH = 30;

export async function POST(req: NextRequest) {
  const denial = verifyCronRequest(req);
  if (denial) return denial;

  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  // Subquery: distinct mints in use by active bounties.
  const activeMints = await db
    .selectDistinct({ mint: bounties.rewardTokenMint })
    .from(bounties)
    .where(eq(bounties.status, "active"));
  if (activeMints.length === 0) {
    return NextResponse.json({ ok: true, refreshed: 0, attempted: 0 });
  }

  const candidates = await db
    .select({ mint: tokens.mint, chain: tokens.chain })
    .from(tokens)
    .where(
      and(
        inArray(
          tokens.mint,
          activeMints.map((r) => r.mint),
        ),
        eq(tokens.flaggedAsScam, false),
        or(
          isNull(tokens.jupiterPriceUpdatedAt),
          lt(tokens.jupiterPriceUpdatedAt, cutoff),
        ),
      ),
    )
    .limit(BATCH);

  let refreshed = 0;
  const errors: Array<{ mint: string; error: string }> = [];
  for (const row of candidates) {
    try {
      // Enrich on the token's OWN chain — a Monad ERC-20 must not be sent
      // down the Solana/DexScreener-solana path (it would throw + go stale).
      await enrichToken(row.mint, {
        chain: row.chain === "monad" ? "monad" : "solana",
        forceRefresh: true,
      });
      refreshed += 1;
    } catch (err) {
      errors.push({
        mint: row.mint,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Touch the table's updatedAt on rows we couldn't refresh so we don't
  // immediately retry them next minute. Use a short cooldown — 60s.
  if (errors.length > 0) {
    await db
      .update(tokens)
      .set({
        jupiterPriceUpdatedAt: sql`COALESCE(${tokens.jupiterPriceUpdatedAt}, now() - interval '4 minutes')`,
      })
      .where(
        inArray(
          tokens.mint,
          errors.map((e) => e.mint),
        ),
      );
  }

  return NextResponse.json({
    ok: true,
    attempted: candidates.length,
    refreshed,
    errorCount: errors.length,
    errors: errors.slice(0, 5),
  });
}
