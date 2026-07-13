/**
 * Chain adapter registry — Solana-only since the ANSEM migration.
 * Dispatch chain-touching operations through `getChainAdapter(chain)`;
 * callers must verify `isChain(row.chain)` first and skip historical
 * non-solana rows loudly instead of falling back.
 */
import type { Chain, ChainAdapter } from "./types";
import { solanaAdapter } from "./solana";

const ADAPTERS: Record<Chain, ChainAdapter> = {
  solana: solanaAdapter,
};

export function getChainAdapter(chain: Chain): ChainAdapter {
  return ADAPTERS[chain];
}

export * from "./types";
