"use client";

import {
  ConnectionProvider,
  useWallet,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { useEffect, useMemo, type ReactNode } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Solana wallet-adapter shell. Replaces Privy's embedded-wallet
 * provider. We register the two wallets we expect on devnet/mainnet:
 *   • Phantom — the dominant Solana wallet, ~80% market share.
 *   • Solflare — second-most-common; also the only one with deep
 *     ledger / hardware support.
 *
 * RPC endpoint is the same URL the server uses (NEXT_PUBLIC_ mirror).
 * Falls back to public devnet when unset so a fresh clone doesn't
 * crash before anyone touches .env.local.
 *
 * `autoConnect` is on so users who've connected once on this device
 * skip the modal next visit. The wallet adapter persists the chosen
 * provider in localStorage.
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com");

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ScrollLockGuard />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/**
 * @solana/wallet-adapter-react-ui locks body scroll while its modal is
 * open. Under some flows (auto-close after wallet selection, hot
 * reload mid-modal, modal closed via Escape race) the cleanup misses
 * and the body is left at `overflow: hidden` — the user sees a frozen
 * page after connecting. We force-restore body overflow whenever the
 * wallet state settles to `connected`, which fires after every
 * successful pick.
 */
function ScrollLockGuard() {
  const { connected, connecting } = useWallet();
  useEffect(() => {
    if (connected || !connecting) {
      document.body.style.overflow = "";
    }
  }, [connected, connecting]);
  return null;
}
