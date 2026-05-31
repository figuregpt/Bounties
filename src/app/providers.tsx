"use client";

import { SessionProvider } from "next-auth/react";
import { SolanaWalletProvider } from "./wallet-provider";
import { EvmWalletProvider } from "./evm-provider";
import type { ReactNode } from "react";

/**
 * Top-level client providers.
 *
 *   SessionProvider       — NextAuth, exposes `useSession()` to client.
 *   EvmWalletProvider     — wagmi/viem, handles Monad (EVM) wallets.
 *   SolanaWalletProvider  — wallet-adapter, handles Phantom / Solflare.
 *
 * The two wallet stacks are independent runtimes mounted side by side; a
 * component picks the right one by the bounty's chain. All are no-op until
 * they receive their dependencies (JWT cookie / wallet selection). Render
 * order: session first so wallet hooks can read the authed user.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <EvmWalletProvider>
        <SolanaWalletProvider>{children}</SolanaWalletProvider>
      </EvmWalletProvider>
    </SessionProvider>
  );
}
