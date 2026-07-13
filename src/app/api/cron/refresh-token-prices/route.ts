import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, lt, or, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bounties, tokens } from "@/lib/db/schema";
import { verifyCronRequest } from "@/lib/cron/auth";
import { enrichToken } from "@/lib/tokens/enrichment";
import { ANSEM_MINT } from "@/lib/tokens/ansem";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/refresh-token-prices — every 5 minutes.
 *
 * ANSEM is ALWAYS refreshed, even with zero active bounties: the $1
 * creation fee is converted to ANSEM from the cached price at launch
 * time, so a stale row would misprice (or block) every launch.
 * Tokens referenced by still-active legacy bounties keep refreshing
 * until those bounties reach a terminal state.
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

  // ANSEM + distinct mints still in use by active (legacy) bounties.
  const activeMints = await db
    .selectDistinct({ mint: bounties.rewardTokenMint })
    .from(bounties)
    .where(eq(bounties.status, "active"));
  const mintSet = new Set<string>([
    ANSEM_MINT,
    ...activeMints.map((r) => r.mint),
  ]);

  const candidates = await db
    .select({ mint: tokens.mint })
    .from(tokens)
    .where(
      and(
        eq(tokens.chain, "solana"),
        inArray(tokens.mint, [...mintSet]),
        eq(tokens.flaggedAsScam, false),
        or(
          isNull(tokens.jupiterPriceUpdatedAt),
          lt(tokens.jupiterPriceUpdatedAt, cutoff),
        ),
      ),
    )
    .limit(BATCH);

  // ANSEM is included whenever it's missing OR stale — the unordered
  // LIMIT above could otherwise fill the batch with legacy mints and
  // silently starve the one token the fee conversion depends on.
  const mintsToRefresh = new Set(candidates.map((r) => r.mint));
  const [ansemRow] = await db
    .select({ updatedAt: tokens.jupiterPriceUpdatedAt })
    .from(tokens)
    .where(and(eq(tokens.chain, "solana"), eq(tokens.mint, ANSEM_MINT)))
    .limit(1);
  const ansemFresh =
    ansemRow?.updatedAt != null && ansemRow.updatedAt > cutoff;
  if (!ansemFresh) {
    mintsToRefresh.add(ANSEM_MINT);
  }

  let refreshed = 0;
  const errors: Array<{ mint: string; error: string }> = [];
  for (const mint of mintsToRefresh) {
    try {
      await enrichToken(mint, { forceRefresh: true });
      refreshed += 1;
    } catch (err) {
      errors.push({
        mint,
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
    attempted: mintsToRefresh.size,
    refreshed,
    errorCount: errors.length,
    errors: errors.slice(0, 5),
  });
}
