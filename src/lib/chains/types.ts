/**
 * Chain abstraction.
 *
 * Every code path that touches an RPC, an address format, a private key,
 * or a transaction is routed through a `ChainAdapter`, selected per-bounty
 * by the `chain` discriminator on the bounties / claims rows.
 *
 * The Solana adapter (./solana) wraps the existing `src/lib/solana/*` code
 * near-verbatim — the structured return types below already match what
 * that code returns. A Monad adapter (added later) implements the same
 * surface with viem.
 *
 * In practice this is a SERVER-side construct: `verifyEscrowTx` and
 * `sendReward` sign transactions and hit RPC. Client code that only needs
 * to validate an address should use a pure helper, not the full adapter.
 */
import type {
  VerifyEscrowArgs,
  VerifyEscrowResult,
} from "@/lib/solana/verify-tx";
import type { RewardResult, RewardTransfer } from "@/lib/solana/treasury";

export type Chain = "solana" | "monad";

export const SUPPORTED_CHAINS = ["solana", "monad"] as const satisfies Chain[];

export function isChain(value: unknown): value is Chain {
  return value === "solana" || value === "monad";
}

// Re-export the shared transfer / verify payload shapes so call sites and
// future adapters reference them from one place. They are already
// chain-agnostic: addresses are strings, amounts are bigint | number,
// decimals are ints — nothing Solana-specific leaks through the types.
export type {
  VerifyEscrowArgs,
  VerifyEscrowResult,
} from "@/lib/solana/verify-tx";
export type { RewardResult, RewardTransfer } from "@/lib/solana/treasury";

export interface ChainAdapter {
  readonly chain: Chain;

  /** Format / validity check for a user wallet address on this chain. */
  isValidWallet(address: string): boolean;

  /** Format / validity check for a token mint / contract address. */
  isValidTokenAddress(address: string): boolean;

  /** Canonical form of an address — identity on Solana (base58 is already
   *  canonical), EIP-55 checksum on EVM. Stored and compared in this form. */
  normalizeAddress(address: string): string;

  /** Read a token's on-chain decimals. */
  getTokenDecimals(tokenAddress: string): Promise<number>;

  /** Whether `wallet` holds at least `minAmount` whole units of `mint`. */
  hasMinTokenBalance(args: {
    wallet: string;
    mint: string;
    minAmount: number;
    decimals: number;
  }): Promise<boolean>;

  /** Verify a creator's escrow-funding transaction landed as expected. */
  verifyEscrowTx(args: VerifyEscrowArgs): Promise<VerifyEscrowResult>;

  /** Send a reward / refund from the treasury (server-side signing). */
  sendReward(transfer: RewardTransfer): Promise<RewardResult>;

  /** Is real on-chain settlement enabled for this chain (else mock)? */
  isRealTxEnabled(): boolean;

  /** Recognize a mock signature this adapter emits in non-real mode. */
  isMockSignature(signature: string | null | undefined): boolean;

  /** Look up the on-chain status of a previously submitted tx — used by
   *  recover-stuck-claims to decide whether a payout actually landed.
   *  Optional: the Solana path still uses its own recovery logic until
   *  that cron is moved onto the adapter. */
  getTxReceipt?(hash: string): Promise<{ found: boolean; success: boolean }>;
}
