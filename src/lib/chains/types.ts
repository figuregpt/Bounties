/**
 * Chain abstraction — Solana-only since the ANSEM migration.
 *
 * The app settles exclusively on Solana now (Monad/Base EVM support was
 * removed), but the `chain` discriminator column survives on bounties /
 * claims / tokens / user_wallets rows, so the adapter surface stays as
 * the single dispatch point for RPC / address / signing operations.
 * Historical rows with chain != 'solana' must be skipped loudly, never
 * routed through the Solana adapter — see getChainAdapter call sites.
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

export type Chain = "solana";

export const SUPPORTED_CHAINS = ["solana"] as const satisfies Chain[];

export function isChain(value: unknown): value is Chain {
  return value === "solana";
}

// Re-export the shared transfer / verify payload shapes so call sites
// reference them from one place.
export type {
  VerifyEscrowArgs,
  VerifyEscrowResult,
} from "@/lib/solana/verify-tx";
export type { RewardResult, RewardTransfer } from "@/lib/solana/treasury";

export interface ChainAdapter {
  readonly chain: Chain;

  /** Format / validity check for a user wallet address on this chain. */
  isValidWallet(address: string): boolean;

  /** Format / validity check for a token mint address. */
  isValidTokenAddress(address: string): boolean;

  /** Canonical form of an address — identity on Solana (base58 is already
   *  canonical). Stored and compared in this form. */
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

  /** Is real on-chain settlement enabled (else mock)? */
  isRealTxEnabled(): boolean;

  /** Recognize a mock signature this adapter emits in non-real mode. */
  isMockSignature(signature: string | null | undefined): boolean;

  /** Look up the on-chain status of a previously submitted tx — used by
   *  recover-stuck-claims to decide whether a payout actually landed. */
  getTxReceipt?(hash: string): Promise<{ found: boolean; success: boolean }>;
}
