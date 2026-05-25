import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { tokens } from "@/lib/db/schema";
import { getTokenDecimals } from "@/lib/solana/token-info";
import {
  enrichTokenByMint as fetchFromDexScreener,
  isValidSolanaMint,
  TokenLogoMissingError,
  TokenNotFoundError,
  TokenPriceUnavailableError,
  type EnrichedToken as DexEnriched,
} from "./dexscreener";
import { currentNetwork, getCanonicalByMint } from "./canonical";

/**
 * Server-side token enrichment.
 *
 * Composition order:
 *   1. Hit the cache (tokens row from DB) — if it exists and is fresh
 *      enough, return it without external calls.
 *   2. Fetch fresh data from DexScreener.
 *   3. Resolve decimals via Solana RPC (only on first sighting).
 *   4. Classify the token's category from its symbol.
 *   5. Upsert into the tokens table so subsequent calls are cheap.
 *
 * Used by the /api/tokens/enrich route AND by the bounty-create path
 * when a creator pastes a mint we've never seen before.
 */

const CACHE_FRESHNESS_MS = 5 * 60 * 1000;

// Canonical-token map moved to [./canonical] so it can be shared with
// the client form (default reward token) and seed scripts. The lookup
// here is network-aware via `currentNetwork()`.

export type TokenWarnings = {
  lowLiquidity: boolean;
  lowVolume: boolean;
  newToken: boolean;
  firstSeen: boolean;
};

export type EnrichedTokenRow = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  category: TokenCategory;
  priceUsd: number;
  priceUpdatedAt: Date;
  marketCapUsd: number | null;
  liquidityUsd: number;
  volume24hUsd: number;
  priceChange24hPercent: number;
  dexScreenerPairAddress: string | null;
  dexScreenerUrl: string;
  isAdminVerified: boolean;
  flaggedAsScam: boolean;
  firstSeenAt: Date;
  usageCount: number;
  warnings: TokenWarnings;
};

export type TokenCategory =
  | "stablecoin"
  | "sol_ecosystem"
  | "platform"
  | "memecoin"
  | "other";

const STABLECOINS = new Set(["USDC", "USDT", "PYUSD", "USDS", "USDH", "DAI"]);
const SOL_ECO = new Set([
  "SOL",
  "JUP",
  "JTO",
  "RNDR",
  "RAY",
  "ORCA",
  "PYTH",
  "WIF",
  "BONK",
]);

export function classifyToken(symbol: string): TokenCategory {
  const s = symbol.toUpperCase();
  if (STABLECOINS.has(s)) return "stablecoin";
  if (s === "BNTY") return "platform";
  if (SOL_ECO.has(s)) return "sol_ecosystem";
  return "memecoin";
}

export class TokenFlaggedError extends Error {
  constructor(public mint: string, public symbol: string) {
    super(`Token ${symbol} (${mint}) is flagged and cannot be used`);
    this.name = "TokenFlaggedError";
  }
}

export {
  TokenLogoMissingError,
  TokenNotFoundError,
  TokenPriceUnavailableError,
  isValidSolanaMint,
};

/**
 * Returns enriched data for a mint, hitting DB cache first then
 * external APIs. Throws `TokenNotFoundError` if DexScreener has no
 * pairs, `TokenPriceUnavailableError` if no price feed, or
 * `TokenFlaggedError` if admin has marked it as a scam.
 */
export async function enrichToken(
  mintAddress: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<EnrichedTokenRow> {
  if (!isValidSolanaMint(mintAddress)) {
    throw new Error(`Invalid Solana mint format: ${mintAddress}`);
  }
  const mint = mintAddress.trim();
  const db = getDb();

  const [existing] = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, mint))
    .limit(1);

  if (existing?.flaggedAsScam) {
    throw new TokenFlaggedError(existing.mint, existing.symbol);
  }

  // Bug 1 fix: short-circuit canonical stablecoins. DexScreener can't
  // price them directly (they only appear on the quote side of pairs),
  // so we authoritatively hardcode their data and upsert the canonical
  // row instead. Always runs even when forceRefresh is set — canonical
  // tokens don't need fresh API data, by definition.
  //
  // Network-aware: devnet USDC has a different mint than mainnet USDC;
  // `getCanonicalByMint` resolves against the current network only.
  const canonical = getCanonicalByMint(mint);
  if (canonical) {
    // Stablecoins hardcode priceUsd=1 in the registry. SOL/BNTY have
    // priceUsd=0 because their real price comes from a market. SOL we
    // can fetch from CoinGecko (DexScreener returns garbage for WSOL
    // because it's the quote side of most pairs); BNTY has no market
    // yet so it stays 0 until the token launches.
    //
    // CRITICAL: CoinGecko's free endpoint rate-limits aggressively
    // (10–30 req/min, then 429). The /create form already enriches SOL
    // once when the chip is picked; if we re-fetch on every subsequent
    // call (e.g. when /api/bounties launches a draft), the second
    // fetch eats a 429 and priceUsd drops to 0 — server-side reward
    // validation then fails with "currently ≈ $0.00" even though the
    // chip says $85.95. Re-use the cached value when it's fresh.
    let fetched: number;
    if (canonical.priceUsd > 0) {
      fetched = canonical.priceUsd;
    } else if (canonical.symbol === "SOL") {
      const cached = existing?.jupiterPriceUsd
        ? Number(existing.jupiterPriceUsd)
        : 0;
      const cachedFresh =
        existing?.jupiterPriceUpdatedAt &&
        Date.now() - existing.jupiterPriceUpdatedAt.getTime() <
          CACHE_FRESHNESS_MS;
      if (cached > 0 && cachedFresh && !opts.forceRefresh) {
        fetched = cached;
      } else {
        const live = await fetchSolPriceUsd();
        // If CoinGecko 429s and we have a stale cached price, prefer
        // the stale value over zeroing out — better to be a few
        // minutes off than to brick the launch validation.
        fetched = live > 0 ? live : cached;
      }
    } else {
      fetched = 0;
    }
    const now = new Date();
    const upserted = await db
      .insert(tokens)
      .values({
        mint,
        symbol: canonical.symbol,
        name: canonical.name,
        decimals: canonical.decimals,
        logoUrl: canonical.logoUrl,
        category: canonical.category,
        jupiterPriceUsd: fetched.toString(),
        jupiterPriceUpdatedAt: now,
        priceChange24hPercent: "0",
        firstSeenAt: canonical.firstSeenAt,
        isAdminVerified: true,
      })
      .onConflictDoUpdate({
        target: tokens.mint,
        set: {
          symbol: canonical.symbol,
          name: canonical.name,
          decimals: canonical.decimals,
          logoUrl: canonical.logoUrl,
          category: canonical.category,
          jupiterPriceUsd: fetched.toString(),
          jupiterPriceUpdatedAt: now,
          priceChange24hPercent: "0",
          isAdminVerified: true,
        },
      })
      .returning();
    return rowToEnriched(upserted[0]!);
  }

  const isFresh =
    existing &&
    existing.jupiterPriceUpdatedAt &&
    Date.now() - existing.jupiterPriceUpdatedAt.getTime() <
      CACHE_FRESHNESS_MS;
  if (existing && isFresh && !opts.forceRefresh) {
    return rowToEnriched(existing);
  }

  // Devnet escape hatch: DexScreener doesn't index devnet mints. For
  // any non-canonical mint on devnet we fall back to an on-chain probe
  // — decimals from the mint account, placeholder symbol/name/price.
  // Strict logo gating is also relaxed here (devnet test tokens rarely
  // have logos). Mainnet keeps the full DexScreener validation.
  if (currentNetwork() === "devnet") {
    return enrichDevnetFallback(mint, existing);
  }

  // Fetch fresh from DexScreener; if it throws, propagate so the route
  // handler can map to a 4xx with a useful message.
  const dex = await fetchFromDexScreener(mint);

  // Decimals are stable so we only fetch once.
  let decimals = existing?.decimals ?? dex.decimals;
  if (decimals == null) {
    decimals = await getTokenDecimals(mint);
  }

  const category = (existing?.category as TokenCategory | null) ??
    classifyToken(dex.symbol);

  const now = new Date();
  const upserted = await db
    .insert(tokens)
    .values({
      mint,
      symbol: dex.symbol,
      name: dex.name,
      decimals,
      logoUrl: dex.imageUrl,
      category,
      jupiterPriceUsd: dex.priceUsd.toString(),
      jupiterPriceUpdatedAt: now,
      marketCapUsd: dex.marketCapUsd?.toString() ?? null,
      liquidityUsd: dex.liquidityUsd.toString(),
      volume24hUsd: dex.volume24hUsd.toString(),
      priceChange24hPercent: dex.priceChange24hPercent.toString(),
      dexScreenerPairAddress: dex.dexScreenerPairAddress,
    })
    .onConflictDoUpdate({
      target: tokens.mint,
      set: {
        symbol: dex.symbol,
        name: dex.name,
        logoUrl: dex.imageUrl,
        jupiterPriceUsd: dex.priceUsd.toString(),
        jupiterPriceUpdatedAt: now,
        marketCapUsd: dex.marketCapUsd?.toString() ?? null,
        liquidityUsd: dex.liquidityUsd.toString(),
        volume24hUsd: dex.volume24hUsd.toString(),
        priceChange24hPercent: dex.priceChange24hPercent.toString(),
        dexScreenerPairAddress: dex.dexScreenerPairAddress,
      },
    })
    .returning();
  return rowToEnriched(upserted[0]!, dex);
}

/**
 * Devnet fallback enrichment path. Devnet mints aren't on DexScreener
 * so we can't price/identify them via the usual route. We probe the
 * chain for decimals and upsert a minimal row — placeholder symbol
 * (truncated mint), $0 price, no logo. Sufficient for test launches.
 */
/**
 * SOL price fetcher — DexScreener returns useless numbers for the WSOL
 * mint (it shows up as the quote-side of most pairs), so for the SOL
 * canonical we hit CoinGecko's free price endpoint. Best-effort: a
 * fetch failure returns 0, the caller treats it the same as an
 * un-priced token and the UI shows $0.
 */
async function fetchSolPriceUsd(): Promise<number> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (!res.ok) return 0;
    const body = (await res.json()) as { solana?: { usd?: number } };
    const usd = Number(body.solana?.usd ?? 0);
    return Number.isFinite(usd) && usd > 0 ? usd : 0;
  } catch {
    return 0;
  }
}

async function enrichDevnetFallback(
  mint: string,
  existing: typeof tokens.$inferSelect | undefined,
): Promise<EnrichedTokenRow> {
  const db = getDb();
  // Reuse cached decimals if we have a prior row; otherwise probe chain.
  const decimals = existing?.decimals ?? (await getTokenDecimals(mint));
  const placeholderSymbol = mint.slice(0, 4).toUpperCase();
  const placeholderName = `Devnet ${placeholderSymbol}…`;
  const now = new Date();
  const upserted = await db
    .insert(tokens)
    .values({
      mint,
      symbol: existing?.symbol ?? placeholderSymbol,
      name: existing?.name ?? placeholderName,
      decimals,
      logoUrl: existing?.logoUrl ?? null,
      category: (existing?.category as TokenCategory | null) ?? "other",
      jupiterPriceUsd: existing?.jupiterPriceUsd ?? "0",
      jupiterPriceUpdatedAt: now,
      priceChange24hPercent: "0",
      firstSeenAt: existing?.firstSeenAt ?? now,
    })
    .onConflictDoUpdate({
      target: tokens.mint,
      set: {
        decimals,
        jupiterPriceUpdatedAt: now,
      },
    })
    .returning();
  return rowToEnriched(upserted[0]!);
}

function rowToEnriched(
  row: typeof tokens.$inferSelect,
  dex?: DexEnriched,
): EnrichedTokenRow {
  const priceUsd = Number(row.jupiterPriceUsd ?? 0);
  const liquidityUsd = Number(row.liquidityUsd ?? 0);
  const volume24hUsd = Number(row.volume24hUsd ?? 0);
  const sevenDaysMs = 7 * 24 * 3600 * 1000;
  const warnings: TokenWarnings = {
    lowLiquidity: liquidityUsd > 0 && liquidityUsd < 10_000,
    lowVolume: volume24hUsd < 1_000,
    newToken: Date.now() - row.firstSeenAt.getTime() < sevenDaysMs,
    firstSeen: row.usageCount === 0,
  };
  return {
    mint: row.mint,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    logoUrl: row.logoUrl,
    category: (row.category as TokenCategory | null) ?? "other",
    priceUsd,
    priceUpdatedAt: row.jupiterPriceUpdatedAt ?? new Date(),
    marketCapUsd:
      row.marketCapUsd != null ? Number(row.marketCapUsd) : null,
    liquidityUsd,
    volume24hUsd,
    priceChange24hPercent:
      row.priceChange24hPercent != null
        ? Number(row.priceChange24hPercent)
        : 0,
    dexScreenerPairAddress: row.dexScreenerPairAddress,
    dexScreenerUrl:
      dex?.dexScreenerUrl ??
      (row.dexScreenerPairAddress
        ? `https://dexscreener.com/solana/${row.dexScreenerPairAddress}`
        : `https://dexscreener.com/solana/${row.mint}`),
    isAdminVerified: row.isAdminVerified,
    flaggedAsScam: row.flaggedAsScam,
    firstSeenAt: row.firstSeenAt,
    usageCount: row.usageCount,
    warnings,
  };
}

/** Increment usage counter when a bounty references this token. */
export async function incrementTokenUsage(mintAddress: string): Promise<void> {
  const db = getDb();
  await db
    .update(tokens)
    .set({
      usageCount: sql`${tokens.usageCount} + 1`,
      bountyCount: sql`${tokens.bountyCount} + 1`,
    })
    .where(eq(tokens.mint, mintAddress));
}
