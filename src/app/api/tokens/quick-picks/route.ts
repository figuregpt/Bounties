import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { tokens } from "@/lib/db/schema";
import { getCanonicalTokens } from "@/lib/tokens/canonical";

export const dynamic = "force-dynamic";

/**
 * GET /api/tokens/quick-picks — list of tokens for the create-bounty
 * chip row.
 *
 * Composition:
 *   • Always include the current-network canonical defaults (USDC, SOL,
 *     and BNTY on mainnet).
 *   • Plus the top-N most-used non-flagged tokens, ranked by usage_count.
 *   • Cap at 8 total. De-duplicate by mint.
 *
 * Network-aware: on devnet `getCanonicalTokens()` returns devnet USDC's
 * mint, so the quick-pick chip points at the right on-chain token.
 */

const MAX = 8;

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }
  const db = getDb();

  const canonicalTokens = Object.values(getCanonicalTokens());
  const defaultMints = canonicalTokens.map((t) => t.mint);

  // Strict gating: only surface tokens with a logo. Logoless rows can
  // exist from earlier enrichment passes that didn't gate; quick-picks
  // is a friendly UI affordance and we don't want broken cards there.
  const defaultsFromDb = await db
    .select()
    .from(tokens)
    .where(
      and(
        inArray(tokens.mint, defaultMints),
        eq(tokens.flaggedAsScam, false),
        isNotNull(tokens.logoUrl),
      ),
    );

  // Fresh DB (or first-launch) → tokens table doesn't have the
  // canonical rows yet because nobody's enriched USDC/SOL/BNTY yet.
  // Fall back to the static registry so the chips still render; the
  // first click on a chip triggers enrichToken which persists the
  // canonical row with live price/decimals.
  const seenMints = new Set(defaultsFromDb.map((d) => d.mint));
  const dbShape = defaultsFromDb.map((row) => ({
    mint: row.mint,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    logoUrl: row.logoUrl,
    category: row.category,
    priceUsd:
      row.jupiterPriceUsd != null ? Number(row.jupiterPriceUsd) : null,
    usageCount: row.usageCount,
  }));
  const fallbackShape = canonicalTokens
    .filter((t) => !seenMints.has(t.mint))
    .map((t) => ({
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      logoUrl: t.logoUrl,
      category: t.category,
      priceUsd: t.priceUsd > 0 ? t.priceUsd : null,
      usageCount: 0,
    }));
  const defaults = [...dbShape, ...fallbackShape];

  const popularRows = await db
    .select()
    .from(tokens)
    .where(
      and(
        ne(tokens.flaggedAsScam, true),
        ne(tokens.usageCount, 0),
        isNotNull(tokens.logoUrl),
      ),
    )
    .orderBy(desc(tokens.usageCount))
    .limit(MAX);

  const popular = popularRows.map((row) => ({
    mint: row.mint,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    logoUrl: row.logoUrl,
    category: row.category,
    priceUsd:
      row.jupiterPriceUsd != null ? Number(row.jupiterPriceUsd) : null,
    usageCount: row.usageCount,
  }));

  const merged: Array<(typeof defaults)[number]> = [];
  const seen = new Set<string>();
  for (const list of [defaults, popular]) {
    for (const row of list) {
      if (seen.has(row.mint)) continue;
      seen.add(row.mint);
      merged.push(row);
      if (merged.length >= MAX) break;
    }
    if (merged.length >= MAX) break;
  }

  return NextResponse.json({ ok: true, tokens: merged });
}
