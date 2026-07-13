/**
 * $ANSEM — the platform token. The ONLY token the product touches:
 *
 *   • the only reward token a bounty can pay
 *   • the only holder-requirement token a bounty can gate on
 *   • the currency the $1 creation fee is collected in
 *
 * Deliberately NOT in the canonical registry (src/lib/tokens/canonical.ts):
 * canonical tokens with `priceUsd: 0` short-circuit enrichment and would
 * freeze the cached price at $0, which bricks the $1-fee → ANSEM
 * conversion at launch. ANSEM is priced live through the DexScreener
 * path instead; these constants only pin identity (mint / symbol /
 * decimals) and a logo fallback.
 *
 * Client-safe: plain constants, no server-only imports.
 */

export const ANSEM_MINT = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump";
export const ANSEM_SYMBOL = "ANSEM";
export const ANSEM_NAME = "The Black Bull";
/** Verified on-chain via getTokenSupply — pump.fun mints are 6 decimals. */
export const ANSEM_DECIMALS = 6;
/** DexScreener-hosted logo. Used as a fallback so the strict logo gate
 *  can never block enrichment of the one token the app depends on. */
export const ANSEM_LOGO_URL =
  "https://cdn.dexscreener.com/cms/images/A8aHRXC8VPrpfPIF?width=800&height=800&quality=95&format=auto";

/**
 * Minimum reward per winner, denominated in ANSEM (replaces the old
 * USD floors). A 1000-ANSEM pool can pay at most 1000 winners.
 */
export const MIN_REWARD_PER_HUNTER_ANSEM = 1;

export function isAnsemMint(mint: string): boolean {
  return mint === ANSEM_MINT;
}
