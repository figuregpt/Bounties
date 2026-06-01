"use client";

import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useEvmWallet } from "@/hooks/useEvmWallet";
import { isEvmChain } from "@/lib/chains/evm/config";

/**
 * Picks the chain-appropriate wallet for a bounty's settlement chain.
 * Both underlying hooks are always called (React hook rules), and we
 * return whichever one matches `chain`. Use this anywhere a hunter has to
 * connect / read the wallet that will RECEIVE a payout — an EVM bounty
 * (Monad / Base) pays an EVM address, a Solana bounty pays a Solana
 * address. All EVM chains share one injected wallet (chain id differs).
 */
export type BountyWallet = {
  chain: "solana" | "monad" | "base";
  address: string | null;
  isConnected: boolean;
  walletName: string | null;
  openConnectModal: () => void;
};

export function useBountyWallet(chain: string | null | undefined): BountyWallet {
  const sol = useWalletConnection();
  const evm = useEvmWallet();
  if (chain && isEvmChain(chain)) {
    return {
      chain,
      address: evm.address,
      isConnected: evm.isConnected,
      walletName: evm.walletName,
      openConnectModal: evm.openConnectModal,
    };
  }
  return {
    chain: "solana",
    address: sol.address,
    isConnected: sol.isConnected,
    walletName: sol.walletName,
    openConnectModal: sol.openConnectModal,
  };
}

/** Registers the connected wallet for its chain so the server-side payout
 *  routes to it (the claim endpoint reads user_wallets by chain). Safe to
 *  call before every claim — it no-ops server-side when nothing changed. */
export async function registerWalletForChain(
  address: string,
  chain: "solana" | "monad" | "base",
  provider: string | null,
): Promise<void> {
  await fetch("/api/users/connect-wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address, provider, chain }),
  }).catch(() => {
    /* best-effort — the claim will surface a clear error if unregistered */
  });
}
