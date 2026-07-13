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
 * Both are no-op until they receive their dependencies (JWT cookie /
 * wallet selection). Render order: session first so wallet hooks can
 * read the authed user.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SolanaWalletProvider>{children}</SolanaWalletProvider>
    </SessionProvider>
  );
}
