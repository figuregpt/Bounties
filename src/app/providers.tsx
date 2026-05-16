"use client";

import { SessionProvider } from "next-auth/react";
import { SolanaWalletProvider } from "./wallet-provider";
import type { ReactNode } from "react";

/**
 * Top-level client providers.
 *
 *   SessionProvider       — NextAuth, exposes `useSession()` to client.
 *   SolanaWalletProvider  — wallet-adapter, handles Phantom / Solflare.
 *
 * Both providers are no-op until they receive their dependencies (JWT
 * cookie / wallet selection). Render order matters: session first so
 * wallet hooks can read the authed user if they need it.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SolanaWalletProvider>{children}</SolanaWalletProvider>
    </SessionProvider>
  );
}
