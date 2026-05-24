/**
 * Solana escrow utilities for the create-bounty flow.
 *
 * The transfer itself happens client-side (Privy embedded wallet signs +
 * submits). This module is import-safe from BOTH client and server —
 * none of its functions read env vars that aren't available in the
 * browser. `buildEscrowTransaction` takes the treasury address as a
 * parameter; the page-component server shell resolves it via the
 * server-only helper in [./env.ts] and passes it down.
 *
 *   • `buildEscrowTransaction()` — composes the SOL or SPL transfer
 *     instructions for either devnet or mainnet
 *   • `escrowMode()` + `rpcEndpoint()` — env readers (server-side, but
 *     both fall back to safe defaults so they're harmless on the client
 *     where Next.js inlines `process.env.NODE_ENV` only)
 *
 * Server-side env reads (the treasury keys) live in [./env.ts].
 * Server-side verification of a submitted tx hash lives in [./verify-tx]
 * (strict ATA owner + mint + amount checks).
 *
 * Mock mode: when `BOUNTIES_ESCROW_MODE=mock` (or env is unset in dev),
 * the launch endpoint can skip on-chain verification entirely. This is
 * what makes local /create testing tolerable without spending real SOL.
 * Production deployments MUST set the mode to `devnet` or `mainnet`.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

/* =========================================================================
   Env readers
   ========================================================================= */

export type EscrowMode = "mock" | "devnet" | "mainnet";

export function escrowMode(): EscrowMode {
  const v = (process.env.BOUNTIES_ESCROW_MODE ?? "mock").toLowerCase();
  if (v === "devnet" || v === "mainnet") return v;
  return "mock";
}

export function rpcEndpoint(): string {
  const explicit = process.env.SOLANA_RPC_URL?.trim();
  if (explicit) return explicit;
  return escrowMode() === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

/* =========================================================================
   Transaction builder (client-side)
   ========================================================================= */

export type EscrowTransferKind =
  | { kind: "sol"; lamports: bigint }
  | {
      kind: "spl";
      mint: string;
      /** Raw token amount (already multiplied by 10^decimals). */
      rawAmount: bigint;
      decimals: number;
    };

/**
 * Optional second transfer for the creation fee. When provided, the
 * built tx becomes a two-instruction transfer (pool to treasury + fee
 * to revenue wallet) so platform earnings stay physically separated
 * from hunter rewards. Same SOL-vs-SPL discriminator as the pool kind;
 * we require them to match — mixing SOL pool with SPL fee (or vice
 * versa) makes no sense and would silently break verification.
 */
export type EscrowFeeTransfer =
  | { kind: "sol"; lamports: bigint }
  | {
      kind: "spl";
      mint: string;
      rawAmount: bigint;
      decimals: number;
    };

/**
 * Builds an unsigned transaction transferring `transfer` from the user
 * to the treasury wallet. The caller signs + submits via Privy.
 *
 * For SPL transfers we don't import the full `@solana/spl-token` package
 * (too heavy for the client bundle); instead we build the transfer
 * instruction manually via `@solana/web3.js` primitives. This works for
 * Token Program v1 (the original SPL Token), which is what USDC/SOL/BNTY
 * all use.
 */
export async function buildEscrowTransaction(args: {
  connection: Connection;
  from: PublicKey;
  /** Base58 treasury public key. Required — pass the value resolved
   *  by the page-component server shell via getTreasuryPublicKey(). */
  treasuryAddress: string;
  transfer: EscrowTransferKind;
  /** Optional creation-fee transfer routed to a separate revenue wallet.
   *  When omitted, the tx is single-instruction and the entire amount
   *  (pool + fee) is expected on `transfer`. */
  fee?: {
    revenueAddress: string;
    transfer: EscrowFeeTransfer;
  };
}): Promise<Transaction> {
  if (!args.treasuryAddress) {
    throw new Error(
      "buildEscrowTransaction: treasuryAddress is required (resolve on server, pass as prop)",
    );
  }
  if (args.fee && args.fee.transfer.kind !== args.transfer.kind) {
    throw new Error(
      "buildEscrowTransaction: pool and fee transfer kinds must match (both 'sol' or both 'spl')",
    );
  }
  const to = new PublicKey(args.treasuryAddress);
  const feeTo = args.fee ? new PublicKey(args.fee.revenueAddress) : null;
  const tx = new Transaction();

  if (args.transfer.kind === "sol") {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: args.from,
        toPubkey: to,
        lamports: Number(args.transfer.lamports),
      }),
    );
    if (feeTo && args.fee && args.fee.transfer.kind === "sol") {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: args.from,
          toPubkey: feeTo,
          lamports: Number(args.fee.transfer.lamports),
        }),
      );
    }
  } else {
    // For SPL we delegate to the dedicated builder in spl-transfer.ts so
    // this file doesn't pull in `@solana/spl-token` types unless an SPL
    // bounty is being created.
    const { buildSplTransferInstruction } = await import("./spl-transfer");
    tx.add(
      ...(await buildSplTransferInstruction({
        connection: args.connection,
        from: args.from,
        to,
        mint: new PublicKey(args.transfer.mint),
        rawAmount: args.transfer.rawAmount,
      })),
    );
    if (feeTo && args.fee && args.fee.transfer.kind === "spl") {
      tx.add(
        ...(await buildSplTransferInstruction({
          connection: args.connection,
          from: args.from,
          to: feeTo,
          mint: new PublicKey(args.fee.transfer.mint),
          rawAmount: args.fee.transfer.rawAmount,
        })),
      );
    }
  }

  const { blockhash, lastValidBlockHeight } =
    await args.connection.getLatestBlockhash("confirmed");
  tx.feePayer = args.from;
  tx.recentBlockhash = blockhash;
  // Stored on the tx for the caller, used to expire if confirmation lags.
  // @solana/web3.js doesn't carry this on Transaction natively — we tuck
  // it on as a side channel so the UI can show a deadline.
  (tx as Transaction & { lastValidBlockHeight?: number }).lastValidBlockHeight =
    lastValidBlockHeight;
  return tx;
}

// Amount helpers moved to `./amount` so any caller (including the
// client bundle) can import them without dragging in the verifier or
// the @solana/web3.js Connection type. We re-export so existing imports
// keep working.
export { toRawAmount, fromRawAmount, solToLamports, lamportsToSol } from "./amount";

