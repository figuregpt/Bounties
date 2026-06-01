import { base, baseSepolia, monad, monadTestnet } from "viem/chains";
import type { Chain as ViemChain } from "viem";

/**
 * EVM chain registry. Adding an EVM chain = one entry here; the adapter,
 * env readers, clients, and UI all derive from it. Client-safe (no
 * server-only / secrets) so the create UI can read native symbols, logos,
 * and canonical addresses too.
 */
export type EvmChainKey = "monad" | "base";

export type EvmChainConfig = {
  key: EvmChainKey;
  label: string;
  viemChain: ViemChain;
  testnetChain: ViemChain;
  /** Native currency symbol — the create flow treats a reward token with
   *  this symbol as a native value transfer, not an ERC-20. */
  nativeSymbol: string;
  /** Env-var prefix: `${envPrefix}_RPC_URL`, `${envPrefix}_TREASURY_…`. */
  envPrefix: string;
  defaultRpc: string;
  /** Wrapped-native token address — used to price/enrich native rewards
   *  (DexScreener has no entry for the bare native asset). */
  nativeWrapped: string;
  /** Logo for the native-currency quick-pick chip (pre-enrichment). */
  nativeLogo: string;
  /** Canonical USDC on this chain (quote-side on DexScreener → no logo,
   *  so it's hardcoded in the canonical registry). */
  usdc: string;
  explorerTxBase: string;
};

export const EVM_CHAINS: Record<EvmChainKey, EvmChainConfig> = {
  monad: {
    key: "monad",
    label: "Monad",
    viemChain: monad,
    testnetChain: monadTestnet,
    nativeSymbol: "MON",
    envPrefix: "MONAD",
    defaultRpc: "https://rpc.monad.xyz",
    nativeWrapped: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
    nativeLogo:
      "https://cdn.dexscreener.com/cms/images/dbdf1b40bce8361da6215642ec5d4ad7aba0c748daa09eee62e3d6446008d469?width=800&height=800&quality=95&format=auto",
    usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    explorerTxBase: "https://monadscan.com/tx/",
  },
  base: {
    key: "base",
    label: "Base",
    viemChain: base,
    testnetChain: baseSepolia,
    nativeSymbol: "ETH",
    envPrefix: "BASE",
    defaultRpc: "https://mainnet.base.org",
    nativeWrapped: "0x4200000000000000000000000000000000000006",
    nativeLogo:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
    usdc: "0x833589fCd6edb6E08f4c7c32D4f71b54bdA02913",
    explorerTxBase: "https://basescan.org/tx/",
  },
};

export function isEvmChain(chain: string): chain is EvmChainKey {
  return chain === "monad" || chain === "base";
}

export function evmConfig(chain: string): EvmChainConfig | null {
  return isEvmChain(chain) ? EVM_CHAINS[chain] : null;
}

/** Native-currency symbol for a chain, or null for non-EVM. */
export function nativeSymbol(chain: string): string | null {
  return isEvmChain(chain) ? EVM_CHAINS[chain].nativeSymbol : null;
}

/** Human label for a chain ("Solana" / "Monad" / "Base"). */
export function chainLabel(chain: string): string {
  return isEvmChain(chain) ? EVM_CHAINS[chain].label : "Solana";
}

/** Client-safe RPC URL for the wagmi config (NEXT_PUBLIC_ override → default). */
export function evmClientRpc(chain: EvmChainKey): string {
  const p = EVM_CHAINS[chain].envPrefix;
  return (
    process.env[`NEXT_PUBLIC_${p}_RPC_URL`]?.trim() || EVM_CHAINS[chain].defaultRpc
  );
}
