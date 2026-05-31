/**
 * SolanaAdapter — a thin pass-through over the existing `src/lib/solana`
 * code. Each method delegates to the exact function the call sites used
 * before the adapter layer existed, so wrapping introduces ZERO behaviour
 * change. Base58 addresses are already canonical, so `normalizeAddress`
 * is the identity function.
 */
import { Connection } from "@solana/web3.js";
import { isValidSolanaMint } from "@/lib/tokens/dexscreener";
import { getTokenDecimals } from "@/lib/solana/token-info";
import { hasMinTokenBalance } from "@/lib/solana/token-balance";
import { isValidSolanaWallet, verifyEscrowTx } from "@/lib/solana/verify-tx";
import { rpcEndpoint } from "@/lib/solana/escrow";
import {
  isMockSignature,
  isRealTxEnabled,
  sendReward,
} from "@/lib/solana/treasury";
import type { ChainAdapter } from "./types";

/** Look up a finalized Solana tx — used by recover-stuck-claims to decide
 *  whether a stuck payout actually landed. Mirrors the prior inline
 *  getParsedTransaction logic. */
async function solanaGetTxReceipt(
  hash: string,
): Promise<{ found: boolean; success: boolean }> {
  try {
    const conn = new Connection(rpcEndpoint(), "confirmed");
    const tx = await conn.getParsedTransaction(hash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return { found: false, success: false };
    return { found: true, success: !tx.meta?.err };
  } catch {
    return { found: false, success: false };
  }
}

export const solanaAdapter: ChainAdapter = {
  chain: "solana",
  isValidWallet: isValidSolanaWallet,
  isValidTokenAddress: isValidSolanaMint,
  normalizeAddress: (address) => address,
  getTokenDecimals,
  hasMinTokenBalance,
  verifyEscrowTx,
  sendReward,
  isRealTxEnabled,
  isMockSignature,
  getTxReceipt: solanaGetTxReceipt,
};
