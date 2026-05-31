"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/chains/evm/wagmi-config";

/**
 * Monad (EVM) wallet shell — wagmi + its required react-query client.
 * Sits beside SolanaWalletProvider; no-op until a component actually calls
 * a wagmi hook or opens the connect flow. WagmiProvider must wrap
 * QueryClientProvider (wagmi hooks consume react-query underneath).
 */
export function EvmWalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
