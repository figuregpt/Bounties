import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { EVM_CHAINS, evmClientRpc } from "./config";

/**
 * wagmi config for the EVM wallet stack (Monad + Base). Mounted alongside
 * the Solana wallet-adapter — the two runtimes don't share globals, so they
 * coexist. `injected()` covers every browser-extension EVM wallet
 * (MetaMask, Rabby, Phantom-EVM, …); more connectors can be added later.
 *
 * Chains + RPC transports are derived from the EVM_CHAINS registry, so
 * adding an EVM chain there wires it through here automatically. The RPC
 * endpoint is overridable per chain via NEXT_PUBLIC_<PREFIX>_RPC_URL so ops
 * can point a client at a private / paid node (the public RPCs are
 * rate-limited); the override flows through `transports`, not a redefined
 * chain, so explorer / native-currency metadata stay canonical.
 *
 * `ssr: true` + `cookieStorage` keep Next's server render and the client
 * hydration in agreement so a reconnect on mount doesn't throw a
 * hydration mismatch.
 */
export const wagmiConfig = createConfig({
  chains: [EVM_CHAINS.monad.viemChain, EVM_CHAINS.base.viemChain],
  connectors: [injected()],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [EVM_CHAINS.monad.viemChain.id]: http(evmClientRpc("monad")),
    [EVM_CHAINS.base.viemChain.id]: http(evmClientRpc("base")),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
