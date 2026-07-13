"use client";

import { useWalletConnection } from "@/hooks/useWalletConnection";

/**
 * The wallet that RECEIVES payouts for a bounty. Every bounty settles on
 * Solana since the ANSEM migration, so this is a thin projection of
 * useWalletConnection kept for its narrower, serializable shape.
 */
export type BountyWallet = {
  chain: "solana";
  address: string | null;
  isConnected: boolean;
  walletName: string | null;
  openConnectModal: () => void;
};

export function useBountyWallet(): BountyWallet {
  const sol = useWalletConnection();
  return {
    chain: "solana",
    address: sol.address,
    isConnected: sol.isConnected,
    walletName: sol.walletName,
    openConnectModal: sol.openConnectModal,
  };
}

/** Registers the connected Solana wallet so the server-side payout
 *  routes to it (the claim endpoint reads user_wallets by chain). Safe to
 *  call before every claim — it no-ops server-side when nothing changed. */
export async function registerWallet(
  address: string,
  provider: string | null,
): Promise<void> {
  await fetch("/api/users/connect-wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address, provider, chain: "solana" }),
  }).catch(() => {
    /* best-effort — the claim will surface a clear error if unregistered */
  });
}
