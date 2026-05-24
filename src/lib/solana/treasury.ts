import "server-only";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiCallLog, auditLog, users } from "@/lib/db/schema";
import { escrowMode, rpcEndpoint } from "./escrow";
import { getTreasuryPrivateKey } from "./env";
import { solToLamports, toRawAmount, lamportsToSol } from "./amount";
import { buildSplTransferInstruction } from "./spl-transfer";
import { isValidSolanaWallet } from "./verify-tx";

/**
 * Treasury wallet — the keypair that holds escrowed funds and signs
 * outbound reward / refund transactions.
 *
 * Phase 9A defenses (matches threat model items #7, #8, #11, #12):
 *
 *   • Recipient validation — every `sendReward` call validates the
 *     destination is on-curve AND belongs to a registered user. Random
 *     addresses are rejected before any tx is built.
 *   • BigInt amounts — `toRawAmount` is the only path from human numbers
 *     to raw token units. Number precision drift can't sneak through.
 *   • Balance preflight — refuses to send when treasury SOL or token
 *     balance is below the requested transfer. Clear "treasury low"
 *     error beats a partial on-chain failure.
 *   • Retry with priority fee — three attempts with backoff; mainnet
 *     priority fee bumps on retry to escape congestion.
 *   • Audit trail — every outbound tx gets a row in `audit_log` AND
 *     `api_call_log` (the same accounting we use for twitterapi.io).
 *
 * Kill switch: ENABLE_REAL_TX=false forces mock mode regardless of
 * BOUNTIES_ESCROW_MODE. Flip live txs off in an incident without a
 * redeploy.
 */

const MOCK_PREFIX = "mock_tx_" as const;
const MIN_TREASURY_SOL_RESERVE = 0.05; // ~10K txs worth of fees

export type RewardTransfer = {
  toWalletAddress: string;
  tokenMint: string;
  tokenSymbol: string;
  amount: number;
  decimals: number;
  /** Free-form tag attached to logs for tracing — usually the claim id
   *  or bounty id we're settling. */
  reference: string;
  /** Optional FK so audit/api-call rows attribute the spend to the
   *  right entity. Pass exactly one of these per call. */
  bountyId?: string | null;
  claimId?: string | null;
  /** When set, skips the "recipient must be a registered user" check.
   *  Use only for system-side payouts (refunds to the bounty creator,
   *  who is always registered — set this true to skip the redundant
   *  lookup). */
  recipientPreverified?: boolean;
  /** Optional fee co-transfer — bundles a second transfer to the
   *  revenue wallet in the SAME on-chain tx so the payout and the fee
   *  collection are atomic. Recipient is treated as system-side (no
   *  user-table lookup). */
  fee?: {
    toWalletAddress: string;
    amount: number;
  };
};

export type RewardResult =
  | { ok: true; signature: string; mock: boolean }
  | { ok: false; error: string; errorCode: RewardErrorCode };

export type RewardErrorCode =
  | "invalid_recipient"
  | "recipient_not_registered"
  | "treasury_low_sol"
  | "treasury_low_token"
  | "tx_failed"
  | "rpc_error";

export function isRealTxEnabled(): boolean {
  if (process.env.ENABLE_REAL_TX === "false") return false;
  const mode = escrowMode();
  return mode === "devnet" || mode === "mainnet";
}

let cachedKeypair: Keypair | null = null;

export function getTreasuryKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;
  const secret = bs58.decode(getTreasuryPrivateKey());
  cachedKeypair = Keypair.fromSecretKey(secret);
  return cachedKeypair;
}

export function treasuryPublicKey(): PublicKey {
  return getTreasuryKeypair().publicKey;
}

/**
 * Sends a reward or refund from the treasury wallet to a recipient.
 *
 * Real-mode flow:
 *   1. Validate recipient (curve check + optional user lookup)
 *   2. Pre-flight: treasury has enough SOL for fees, enough token for
 *      the transfer
 *   3. Build tx with priority fee + transfer ix
 *   4. Send + confirm, retrying up to 3 times with backoff
 *   5. Write audit_log + api_call_log rows
 *
 * Caller is responsible for the claim row update; we don't touch claim
 * state from here.
 */
export async function sendReward(
  transfer: RewardTransfer,
): Promise<RewardResult> {
  const t0 = Date.now();

  /* ---- Mock short-circuit ---------------------------------------- */
  if (!isRealTxEnabled()) {
    const sig = `${MOCK_PREFIX}${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    console.log(
      `[treasury] mock tx → ${transfer.toWalletAddress} ` +
        `${transfer.amount} ${transfer.tokenSymbol} ` +
        `(ref=${transfer.reference}, sig=${sig})`,
    );
    await recordApiCall({
      transfer,
      signature: sig,
      success: true,
      durationMs: Date.now() - t0,
      mock: true,
    });
    return { ok: true, signature: sig, mock: true };
  }

  /* ---- Recipient validation -------------------------------------- */
  if (!isValidSolanaWallet(transfer.toWalletAddress)) {
    return failResult(
      "invalid_recipient",
      `Recipient address ${transfer.toWalletAddress} is not a valid on-curve Solana wallet`,
      transfer,
      t0,
    );
  }
  if (!transfer.recipientPreverified) {
    const db = getDb();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.walletAddress, transfer.toWalletAddress))
      .limit(1);
    if (!existing) {
      return failResult(
        "recipient_not_registered",
        `Recipient wallet ${transfer.toWalletAddress} is not registered in our user table`,
        transfer,
        t0,
      );
    }
  }

  /* ---- Build + send ---------------------------------------------- */
  try {
    const keypair = getTreasuryKeypair();
    const connection = new Connection(rpcEndpoint(), "confirmed");
    const recipient = new PublicKey(transfer.toWalletAddress);
    const isNative =
      transfer.tokenSymbol === "SOL" || transfer.tokenMint === "native";

    await ensureTreasuryHasSolFee(connection, keypair.publicKey);
    const rawAmount = isNative
      ? solToLamports(transfer.amount)
      : toRawAmount(transfer.amount, transfer.decimals);

    // Fee co-transfer to the revenue wallet, bundled in the same tx.
    // Validated against on-curve here so a bad env can't put the
    // treasury into a corrupt tx at signing time.
    const feeRecipient =
      transfer.fee && transfer.fee.amount > 0
        ? (() => {
            if (!isValidSolanaWallet(transfer.fee!.toWalletAddress)) {
              throw new Error(
                `Fee recipient ${transfer.fee!.toWalletAddress} is not a valid on-curve Solana wallet`,
              );
            }
            return new PublicKey(transfer.fee!.toWalletAddress);
          })()
        : null;
    const feeRawAmount =
      transfer.fee && transfer.fee.amount > 0
        ? isNative
          ? solToLamports(transfer.fee.amount)
          : toRawAmount(transfer.fee.amount, transfer.decimals)
        : BigInt(0);
    const totalOutflow = rawAmount + feeRawAmount;

    if (!isNative) {
      await ensureTreasuryHasToken(
        connection,
        keypair.publicKey,
        transfer.tokenMint,
        totalOutflow,
      );
    } else {
      await ensureTreasuryHasSol(connection, keypair.publicKey, totalOutflow);
    }

    const signature = await sendWithRetry({
      connection,
      keypair,
      buildInstructions: async (priorityMicroLamports) => {
        const ixs: TransactionInstruction[] = [
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityMicroLamports,
          }),
        ];
        if (isNative) {
          ixs.push(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: recipient,
              lamports: Number(rawAmount),
            }),
          );
          if (feeRecipient && feeRawAmount > BigInt(0)) {
            ixs.push(
              SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: feeRecipient,
                lamports: Number(feeRawAmount),
              }),
            );
          }
        } else {
          const mint = new PublicKey(transfer.tokenMint);
          ixs.push(
            ...(await buildSplTransferInstruction({
              connection,
              from: keypair.publicKey,
              to: recipient,
              mint,
              rawAmount,
            })),
          );
          if (feeRecipient && feeRawAmount > BigInt(0)) {
            ixs.push(
              ...(await buildSplTransferInstruction({
                connection,
                from: keypair.publicKey,
                to: feeRecipient,
                mint,
                rawAmount: feeRawAmount,
              })),
            );
          }
        }
        return ixs;
      },
    });

    console.log(
      `[treasury] sent ${transfer.amount} ${transfer.tokenSymbol} → ` +
        `${transfer.toWalletAddress} (ref=${transfer.reference}, sig=${signature})`,
    );
    await Promise.all([
      recordApiCall({
        transfer,
        signature,
        success: true,
        durationMs: Date.now() - t0,
        mock: false,
      }),
      recordAuditLog({
        action: "reward_sent",
        entityType: transfer.claimId ? "claim" : "bounty",
        entityId: transfer.claimId ?? transfer.bountyId ?? "",
        after: {
          txHash: signature,
          amount: transfer.amount,
          tokenMint: transfer.tokenMint,
          tokenSymbol: transfer.tokenSymbol,
          recipient: transfer.toWalletAddress,
          reference: transfer.reference,
        },
      }),
    ]);
    return { ok: true, signature, mock: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[treasury] tx failed for ref=${transfer.reference}: ${message}`,
    );
    const code: RewardErrorCode = message.startsWith("Treasury SOL low")
      ? "treasury_low_sol"
      : message.startsWith("Treasury token low")
        ? "treasury_low_token"
        : message.includes("RPC")
          ? "rpc_error"
          : "tx_failed";
    return failResult(code, message, transfer, t0);
  }
}

export function isMockSignature(signature: string | null | undefined): boolean {
  return typeof signature === "string" && signature.startsWith(MOCK_PREFIX);
}

/* =========================================================================
   Balance pre-flight checks
   ========================================================================= */

async function ensureTreasuryHasSolFee(
  connection: Connection,
  treasury: PublicKey,
): Promise<void> {
  const lamports = await connection.getBalance(treasury, "confirmed");
  const reserveLamports = Number(solToLamports(MIN_TREASURY_SOL_RESERVE));
  if (lamports < reserveLamports) {
    throw new Error(
      `Treasury SOL low: have ${lamportsToSol(BigInt(lamports))} SOL, need ≥ ${MIN_TREASURY_SOL_RESERVE} for fees`,
    );
  }
}

async function ensureTreasuryHasSol(
  connection: Connection,
  treasury: PublicKey,
  required: bigint,
): Promise<void> {
  const lamports = await connection.getBalance(treasury, "confirmed");
  if (BigInt(lamports) < required) {
    throw new Error(
      `Treasury SOL low: have ${lamportsToSol(BigInt(lamports))} SOL, need ${lamportsToSol(required)} SOL`,
    );
  }
}

async function ensureTreasuryHasToken(
  connection: Connection,
  treasury: PublicKey,
  mintAddress: string,
  required: bigint,
): Promise<void> {
  // Derive the treasury's ATA the same way spl-transfer does — but we
  // don't need the program detection here, just the parsed balance.
  const mint = new PublicKey(mintAddress);
  const { value } = await connection.getParsedTokenAccountsByOwner(treasury, {
    mint,
  });
  if (value.length === 0) {
    throw new Error(
      `Treasury token low: no ATA for mint ${mintAddress} on treasury wallet`,
    );
  }
  let total = BigInt(0);
  for (const acc of value) {
    const info = (acc.account.data.parsed as { info?: { tokenAmount?: { amount?: string } } })
      ?.info?.tokenAmount?.amount;
    if (info) total += BigInt(info);
  }
  if (total < required) {
    throw new Error(
      `Treasury token low: have ${total} raw units of ${mintAddress}, need ${required}`,
    );
  }
}

/* =========================================================================
   Retry loop with priority fee escalation
   ========================================================================= */

async function sendWithRetry(args: {
  connection: Connection;
  keypair: Keypair;
  buildInstructions: (
    priorityMicroLamports: number,
  ) => Promise<TransactionInstruction[]>;
}): Promise<string> {
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Devnet doesn't really need priority fees; mainnet does during
    // congestion. Escalate per retry. 1k → 5k → 25k microlamports/CU.
    const priority = 1000 * 5 ** attempt;
    try {
      const ixs = await args.buildInstructions(priority);
      const { blockhash, lastValidBlockHeight } =
        await args.connection.getLatestBlockhash("confirmed");

      const tx = new Transaction();
      tx.add(...ixs);
      tx.recentBlockhash = blockhash;
      tx.feePayer = args.keypair.publicKey;
      tx.sign(args.keypair);

      const signature = await args.connection.sendRawTransaction(
        tx.serialize(),
        { skipPreflight: false, maxRetries: 0 },
      );
      const { value } = await args.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (value.err) {
        throw new Error(
          `Tx ${signature} failed on-chain: ${JSON.stringify(value.err)}`,
        );
      }
      return signature;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[treasury] sendTransaction attempt ${attempt + 1}/${maxAttempts} failed:`,
        err instanceof Error ? err.message.slice(0, 200) : err,
      );
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`sendWithRetry exhausted: ${String(lastErr)}`);
}

/* =========================================================================
   Audit + api-call logging
   ========================================================================= */

async function recordApiCall(args: {
  transfer: RewardTransfer;
  signature: string;
  success: boolean;
  durationMs: number;
  mock: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    await getDb()
      .insert(apiCallLog)
      .values({
        service: "solana",
        endpoint: `treasury.sendReward${args.mock ? ":mock" : ""}`,
        method: "POST",
        statusCode: args.success ? 200 : 500,
        success: args.success,
        responseTimeMs: args.durationMs,
        bountyId: args.transfer.bountyId ?? null,
        claimId: args.transfer.claimId ?? null,
        errorMessage: args.errorMessage ?? null,
        requestMetadata: {
          signature: args.signature,
          tokenMint: args.transfer.tokenMint,
          tokenSymbol: args.transfer.tokenSymbol,
          amount: args.transfer.amount,
          recipient: args.transfer.toWalletAddress,
          reference: args.transfer.reference,
          mock: args.mock,
        },
      });
  } catch (err) {
    // Audit logging is best-effort. Don't fail the tx because we
    // couldn't write its log row.
    console.warn(
      "[treasury] api_call_log insert failed:",
      err instanceof Error ? err.message.slice(0, 200) : err,
    );
  }
}

async function recordAuditLog(args: {
  action: string;
  entityType: string;
  entityId: string;
  after: Record<string, unknown>;
  before?: Record<string, unknown>;
}): Promise<void> {
  if (!args.entityId) return;
  try {
    await getDb()
      .insert(auditLog)
      .values({
        actorType: "system",
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        beforeState: args.before ?? null,
        afterState: args.after,
      });
  } catch (err) {
    console.warn(
      "[treasury] audit_log insert failed:",
      err instanceof Error ? err.message.slice(0, 200) : err,
    );
  }
}

async function failResult(
  code: RewardErrorCode,
  message: string,
  transfer: RewardTransfer,
  startedAtMs: number,
): Promise<RewardResult> {
  await recordApiCall({
    transfer,
    signature: "",
    success: false,
    durationMs: Date.now() - startedAtMs,
    mock: false,
    errorMessage: message,
  });
  // Keep `error` on the public surface for back-compat with the old
  // RewardResult shape — but add `errorCode` for new callers.
  return { ok: false, error: message, errorCode: code };
}

