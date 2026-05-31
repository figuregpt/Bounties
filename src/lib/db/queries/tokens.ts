import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { tokens } from "@/lib/db/schema";

/**
 * Fetch the cached tokens row for a mint, or null if we've never seen
 * it. Read-only — does NOT call out to DexScreener. The bounty-create
 * path triggers enrichment when the mint isn't on file; consumers in
 * the read path (bounty detail, feed) settle for whatever we have
 * cached and let the refresh-prices cron keep things fresh.
 */

export type TokenInfo = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  category: string | null;
  priceUsd: number | null;
  priceUpdatedAt: Date | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPercent: number | null;
  dexScreenerUrl: string | null;
  isAdminVerified: boolean;
  flaggedAsScam: boolean;
};

export async function getTokenInfo(
  mint: string,
  chain?: string,
): Promise<TokenInfo | null> {
  const db = getDb();
  // tokens is unique on (chain, mint) post-migration; scope by chain when
  // the caller knows it so we never return a wrong-chain row.
  const where = chain
    ? and(eq(tokens.chain, chain), eq(tokens.mint, mint))
    : eq(tokens.mint, mint);
  const [row] = await db.select().from(tokens).where(where).limit(1);
  if (!row) return null;
  return {
    mint: row.mint,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    logoUrl: row.logoUrl,
    category: row.category,
    priceUsd: row.jupiterPriceUsd ? Number(row.jupiterPriceUsd) : null,
    priceUpdatedAt: row.jupiterPriceUpdatedAt,
    marketCapUsd: row.marketCapUsd ? Number(row.marketCapUsd) : null,
    liquidityUsd: row.liquidityUsd ? Number(row.liquidityUsd) : null,
    volume24hUsd: row.volume24hUsd ? Number(row.volume24hUsd) : null,
    priceChange24hPercent:
      row.priceChange24hPercent != null
        ? Number(row.priceChange24hPercent)
        : null,
    dexScreenerUrl: row.dexScreenerPairAddress
      ? `https://dexscreener.com/${row.chain}/${row.dexScreenerPairAddress}`
      : null,
    isAdminVerified: row.isAdminVerified,
    flaggedAsScam: row.flaggedAsScam,
  };
}
