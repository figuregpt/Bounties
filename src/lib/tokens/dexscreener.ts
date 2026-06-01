/**
 * DexScreener token enrichment.
 *
 * Free public API at https://api.dexscreener.com/latest/dex/tokens/{mint}.
 * No key, no documented rate limit — we still keep a 60s in-memory cache
 * so spammy retries during a debug session don't get us politely throttled.
 *
 * We pick the most-liquid Solana pair for the mint and normalize the
 * fields we actually use. Everything else from the API is ignored.
 */

import { isEvmChain } from "@/lib/chains/evm/config";

export type EnrichedToken = {
  mint: string;
  symbol: string;
  name: string;
  /** Filled by the caller after a Solana RPC roundtrip — DexScreener
   *  doesn't return decimals. */
  decimals: number | null;
  priceUsd: number;
  /** Non-null by enrichment-time invariant. Strict gating throws
   *  `TokenLogoMissingError` if DexScreener doesn't have a logo. */
  imageUrl: string;
  marketCapUsd: number | null;
  liquidityUsd: number;
  volume24hUsd: number;
  priceChange24hPercent: number;
  dexScreenerPairAddress: string | null;
  dexScreenerUrl: string;
};

export class TokenNotFoundError extends Error {
  constructor(public mint: string) {
    super(`DexScreener has no pairs for mint ${mint}`);
    this.name = "TokenNotFoundError";
  }
}

export class TokenPriceUnavailableError extends Error {
  constructor(public mint: string) {
    super(`DexScreener has no tracked price for ${mint}`);
    this.name = "TokenPriceUnavailableError";
  }
}

/**
 * Strict-gating error: the token exists on DexScreener but has no
 * `info.imageUrl` populated. Without a logo the bounty card / activity
 * row / picker would have to render a letter fallback — which we've
 * deliberately removed because it makes obvious scam tokens look as
 * "real" as canonical ones. Reject upstream and surface a fix-it
 * message in the UI.
 */
export class TokenLogoMissingError extends Error {
  code = "token_logo_missing" as const;
  constructor(public mint: string, public symbol: string) {
    super(
      `${symbol} doesn't have a logo registered on DexScreener. ` +
        `Token creators can add one via DexScreener's enhanced token info.`,
    );
    this.name = "TokenLogoMissingError";
  }
}

/** Crude but adequate Solana address shape check. */
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaMint(mint: string): boolean {
  return MINT_RE.test(mint.trim());
}

/** EVM contract-address shape check (0x + 40 hex). */
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
export function isValidEvmToken(addr: string): boolean {
  return EVM_ADDR_RE.test(addr.trim());
}

type CacheEntry = { value: EnrichedToken; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

export async function enrichTokenByMint(
  mintAddress: string,
  chain: string = "solana",
): Promise<EnrichedToken> {
  const mint = mintAddress.trim();
  const valid = isEvmChain(chain)
    ? isValidEvmToken(mint)
    : isValidSolanaMint(mint);
  if (!valid) {
    throw new Error(`Invalid ${chain} token address: ${mintAddress}`);
  }

  const cacheKey = `${chain}:${mint}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`;
  let payload: unknown;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) throw new TokenNotFoundError(mint);
    if (!res.ok) {
      throw new Error(
        `DexScreener returned ${res.status} ${res.statusText}`,
      );
    }
    payload = await res.json();
  } catch (err) {
    if (err instanceof TokenNotFoundError) throw err;
    if ((err as Error).name === "TimeoutError") {
      throw new Error("DexScreener timed out — try again in a moment");
    }
    throw err;
  }

  const pairs = (
    payload as { pairs?: Array<Record<string, unknown>> } | null
  )?.pairs;
  if (!pairs || pairs.length === 0) {
    throw new TokenNotFoundError(mint);
  }

  // DexScreener mixes chains in the response — keep only pairs on the
  // chain we're enriching for. Our chain names ('solana' | 'monad') match
  // DexScreener's chainId slugs exactly.
  const chainPairs = pairs.filter((p) => p.chainId === chain);
  if (chainPairs.length === 0) {
    throw new Error(`Token exists on DexScreener but no ${chain} pair`);
  }

  // DexScreener returns every pair the mint participates in — both as
  // baseToken AND as quoteToken. The `priceUsd` field is always the BASE
  // token's price, so if we don't filter we end up writing the OTHER
  // side of the pair (e.g. querying USDC's mint returns SOL/USDC,
  // BONK/USDC, etc — most-liquid baseToken is SOL/BONK/PUMP, not USDC).
  // Strict filter: keep only pairs where our mint IS the base.
  const baseSidePairs = chainPairs.filter((p) => {
    const baseAddress = (
      p.baseToken as { address?: string } | undefined
    )?.address;
    return baseAddress?.toLowerCase() === mint.toLowerCase();
  });
  if (baseSidePairs.length === 0) {
    // Mint only appears as a quote — typical for stablecoins. Caller
    // can choose to short-circuit those via a canonical map (see
    // enrichment.ts) so we never get here for USDC/USDT.
    throw new TokenPriceUnavailableError(mint);
  }

  // Most-liquid base-side pair wins.
  const best = baseSidePairs.reduce((acc, p) => {
    const a = liquidity(acc);
    const b = liquidity(p);
    return b > a ? p : acc;
  });

  const priceUsdRaw = best.priceUsd as string | number | undefined;
  const priceUsd =
    typeof priceUsdRaw === "string"
      ? parseFloat(priceUsdRaw)
      : typeof priceUsdRaw === "number"
        ? priceUsdRaw
        : NaN;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new TokenPriceUnavailableError(mint);
  }

  const baseToken = best.baseToken as
    | { address?: string; symbol?: string; name?: string }
    | undefined;
  const info = best.info as { imageUrl?: string } | undefined;
  const pairAddress = (best.pairAddress as string | undefined) ?? null;
  const symbol = baseToken?.symbol ?? "UNKNOWN";

  // Strict gating: logo is required. Without it the token can't render
  // properly across feed / detail / activity and we'd have to fall back
  // to letter circles — which we've intentionally removed.
  if (!info?.imageUrl) {
    throw new TokenLogoMissingError(mint, symbol);
  }

  const enriched: EnrichedToken = {
    mint,
    symbol,
    name: baseToken?.name ?? baseToken?.symbol ?? "Unknown token",
    decimals: null,
    priceUsd,
    imageUrl: info.imageUrl,
    marketCapUsd:
      typeof best.marketCap === "number"
        ? (best.marketCap as number)
        : typeof best.fdv === "number"
          ? (best.fdv as number)
          : null,
    liquidityUsd: liquidity(best),
    volume24hUsd: pickNumber(best.volume, "h24"),
    priceChange24hPercent: pickNumber(best.priceChange, "h24"),
    dexScreenerPairAddress: pairAddress,
    dexScreenerUrl: pairAddress
      ? `https://dexscreener.com/${chain}/${pairAddress}`
      : `https://dexscreener.com/${chain}/${mint}`,
  };

  cache.set(cacheKey, { value: enriched, expiresAt: now + TTL_MS });
  return enriched;
}

function liquidity(pair: Record<string, unknown>): number {
  const liq = pair.liquidity as { usd?: number } | undefined;
  return typeof liq?.usd === "number" ? liq.usd : 0;
}

function pickNumber(
  obj: unknown,
  key: string,
): number {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  return 0;
}
