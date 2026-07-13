/**
 * Network-aware canonical token registry.
 *
 * The bug this fixes: pre-Phase-9A code hardcoded mainnet USDC's mint
 * (`EPjFWdd5...`) everywhere — quick-picks defaults, create-form
 * defaults, enrichment short-circuits. Devnet has a different USDC mint
 * (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`), so the SPL builder
 * threw "Could not read decimals for mint" the moment we tested a real
 * launch on devnet.
 *
 * Network resolution:
 *   NEXT_PUBLIC_SOLANA_NETWORK > SOLANA_NETWORK > 'mainnet-beta' default
 *
 * NEXT_PUBLIC_ prefix is required for the client bundle to see the
 * value (Next.js inlines NEXT_PUBLIC_* into the browser; raw env vars
 * are server-only). SOLANA_NETWORK kept as a fallback so server-only
 * call sites work even without the NEXT_PUBLIC_ duplicate.
 *
 * Safe to import from BOTH client and server. No `server-only` marker —
 * the form's `defaultCreateBountyValues` is a client call.
 */

export type SolanaNetwork = "mainnet-beta" | "devnet";

export type CanonicalToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Hardcoded for stablecoins; price-refresh cron may overwrite the
   *  cache row for non-pegged tokens (SOL etc). */
  priceUsd: number;
  category: "stablecoin" | "sol_ecosystem" | "platform" | "memecoin" | "other";
  /** Required — strict logo gating means every canonical needs one. */
  logoUrl: string;
  /** Set far enough in the past that the `newToken` warning never fires
   *  for blue-chips. */
  firstSeenAt: Date;
};

/* =========================================================================
   Per-network registries
   ========================================================================= */

const USDC_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png";
const SOL_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
const USDT_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg";

// Wrapped SOL has the same mint on both networks (the System program
// address `So11...11112` is canonical across Solana clusters). USDC is
// network-specific — Circle deploys separately on devnet.
const WSOL_MINT = "So11111111111111111111111111111111111111112";

const MAINNET: Record<string, CanonicalToken> = {
  USDC: {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    priceUsd: 1,
    category: "stablecoin",
    logoUrl: USDC_LOGO,
    firstSeenAt: new Date("2021-01-01T00:00:00Z"),
  },
  USDT: {
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    priceUsd: 1,
    category: "stablecoin",
    logoUrl: USDT_LOGO,
    firstSeenAt: new Date("2021-01-01T00:00:00Z"),
  },
  SOL: {
    mint: WSOL_MINT,
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    priceUsd: 0, // Real price comes from DexScreener / price cron.
    category: "sol_ecosystem",
    logoUrl: SOL_LOGO,
    firstSeenAt: new Date("2020-03-23T00:00:00Z"),
  },
  BNTY: {
    // Placeholder until launch. Real mint slot is reserved for Phase 9.
    mint: "BNTYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    symbol: "BNTY",
    name: "bounties.fm",
    decimals: 9,
    priceUsd: 0,
    category: "platform",
    logoUrl: "/token-placeholder.svg",
    firstSeenAt: new Date("2026-01-01T00:00:00Z"),
  },
};

const REGISTRY: Record<SolanaNetwork, Record<string, CanonicalToken>> = {
  "mainnet-beta": MAINNET,
  // Devnet registry was dropped on the mainnet flip — the launch is
  // mainnet-only from here on. Re-introduce a DEVNET map if a future
  // dev environment needs canonical tokens against the test cluster.
  devnet: MAINNET,
};

/* =========================================================================
   Network resolution
   ========================================================================= */

/**
 * Reads NEXT_PUBLIC_SOLANA_NETWORK first (visible in both bundles),
 * SOLANA_NETWORK as a server-only fallback, defaults to `mainnet-beta`.
 *
 * IMPORTANT: For the client bundle to pick up devnet, set
 * `NEXT_PUBLIC_SOLANA_NETWORK=devnet` in `.env.local` AND restart the
 * dev server — Next.js inlines NEXT_PUBLIC_* at build/HMR time.
 */
export function currentNetwork(): SolanaNetwork {
  const v =
    process.env.NEXT_PUBLIC_SOLANA_NETWORK?.toLowerCase() ??
    process.env.SOLANA_NETWORK?.toLowerCase() ??
    "mainnet-beta";
  if (v === "devnet" || v === "testnet") return "devnet";
  return "mainnet-beta";
}

/* =========================================================================
   Lookups
   ========================================================================= */

/** Tokens for the *current* network, keyed by symbol (USDC / SOL / …). */
export function getCanonicalTokens(): Record<string, CanonicalToken> {
  return REGISTRY[currentNetwork()];
}

/** Every canonical token across every network — used by seed scripts. */
export function getAllCanonicalTokens(): CanonicalToken[] {
  return Object.values(REGISTRY).flatMap((m) => Object.values(m));
}

/** Lookup by mint within the current network. */
export function getCanonicalByMint(mint: string): CanonicalToken | null {
  for (const t of Object.values(getCanonicalTokens())) {
    if (t.mint === mint) return t;
  }
  return null;
}

/** Cross-network mint lookup — useful for migrations / cleanup paths. */
export function getCanonicalByMintAnyNetwork(
  mint: string,
): CanonicalToken | null {
  for (const t of getAllCanonicalTokens()) {
    if (t.mint === mint) return t;
  }
  return null;
}

/** Lookup by symbol within the current network. */
export function getCanonicalBySymbol(symbol: string): CanonicalToken | null {
  return getCanonicalTokens()[symbol.toUpperCase()] ?? null;
}

/** True if a mint is a canonical in the *current* network. */
export function isCanonicalMint(mint: string): boolean {
  return getCanonicalByMint(mint) !== null;
}
