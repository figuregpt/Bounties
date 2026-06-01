/**
 * Chain adapter registry. Dispatch every chain-touching operation through
 * `getChainAdapter(bounty.chain)` instead of importing `src/lib/solana`
 * directly — that keeps the Monad path (registered later) a drop-in.
 */
import type { Chain, ChainAdapter } from "./types";
import { solanaAdapter } from "./solana";
import { createEvmAdapter } from "./evm/adapter";

const ADAPTERS: Partial<Record<Chain, ChainAdapter>> = {
  solana: solanaAdapter,
  monad: createEvmAdapter("monad"),
  base: createEvmAdapter("base"),
};

export function getChainAdapter(chain: Chain): ChainAdapter {
  const adapter = ADAPTERS[chain];
  if (!adapter) {
    throw new Error(
      `No ChainAdapter registered for chain "${chain}". ` +
        `Supported right now: ${Object.keys(ADAPTERS).join(", ")}.`,
    );
  }
  return adapter;
}

export * from "./types";
