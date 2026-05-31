"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { wagmiConfig } from "@/lib/chains/evm/wagmi-config";
import { EvmConnectModal } from "@/components/shared/evm-connect-modal";

/** Opens the Monad (EVM) wallet-selection modal. No-op outside the
 *  provider, so calling it is always safe. */
const EvmConnectModalContext = createContext<{ open: () => void }>({
  open: () => {},
});

export function useEvmConnectModal() {
  return useContext(EvmConnectModalContext);
}

/**
 * Monad (EVM) wallet shell — wagmi + react-query + the wallet-selection
 * modal. Sits beside SolanaWalletProvider; no-op until a component opens
 * the modal or reads a wagmi hook.
 */
export function EvmWalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <EvmModalGate>{children}</EvmModalGate>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function EvmModalGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ctx = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <EvmConnectModalContext.Provider value={ctx}>
      {children}
      <EvmConnectModal open={open} onClose={() => setOpen(false)} />
    </EvmConnectModalContext.Provider>
  );
}
