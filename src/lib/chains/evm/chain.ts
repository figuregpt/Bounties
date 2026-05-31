import { monad } from "viem/chains";

/**
 * Monad mainnet (chain id 143, native MON, 18 decimals). We use viem's
 * built-in `monad` definition as-is; only the RPC endpoint is overridable
 * so ops can point the client at a private / paid node — the public
 * rpc.monad.xyz is rate-limited (25 rps). The override flows through the
 * wagmi `transports` map, not a redefined chain, so the explorer / native
 * currency metadata stay canonical.
 *
 * Client-safe (NEXT_PUBLIC_). The server-side MonadAdapter reads its own
 * MONAD_RPC_URL — never import this from server payout code.
 */
export const monadChain = monad;

export const MONAD_RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim() ||
  monad.rpcUrls.default.http[0];
