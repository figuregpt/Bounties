import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadChain, MONAD_RPC_URL } from "./chain";

/**
 * wagmi config for the Monad (EVM) wallet stack. Mounted alongside the
 * Solana wallet-adapter — the two runtimes don't share globals, so they
 * coexist. `injected()` covers every browser-extension EVM wallet
 * (MetaMask, Rabby, Phantom-EVM, …); more connectors can be added later.
 *
 * `ssr: true` + `cookieStorage` keep Next's server render and the client
 * hydration in agreement so a reconnect on mount doesn't throw a
 * hydration mismatch.
 */
export const wagmiConfig = createConfig({
  chains: [monadChain],
  connectors: [injected()],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [monadChain.id]: http(MONAD_RPC_URL),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
