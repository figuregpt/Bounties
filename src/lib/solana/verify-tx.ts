import "server-only";
import {
  Connection,
  PublicKey,
  type ParsedAccountData,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { rpcEndpoint } from "./escrow";

/**
 * Strict server-side verification for an *incoming* escrow tx submitted
 * by the bounty creator.
 *
 * This is the security perimeter for Phase 9A. We assume:
 *   • The client is hostile — anything in the request body could be
 *     forged. Trust ONLY our own RPC's view of the chain.
 *   • Amounts are BigInt end-to-end. Number loses precision past 2^53.
 *
 * Defenses applied (matches threat model #6, #7, #12):
 *   1. Tx exists + landed without error
 *   2. Mint matches the bounty's reward token (or null for native SOL)
 *   3. Recipient ATA's *owner* is the configured treasury (not just an
 *      address that happens to hold the ATA address)
 *   4. Sender ATA's *owner* is the wallet we expect (creator's wallet)
 *   5. Transferred amount ≥ expected amount (overshoot OK — covers
 *      priority fees and any rounding)
 *
 * Returns `{ ok: true, confirmedAt, actualAmount }` on pass. Any failure
 * is surfaced with a structured reason — never blindly forwarded to the
 * client (route handler scrubs detail through a friendlier string).
 */

export type VerifyEscrowArgs = {
  signature: string;
  /** Wallet that should appear as the *source* of the transfer. For
   *  SPL transfers this is the ATA owner, not the ATA address itself. */
  expectedFromWallet: string;
  /** Treasury wallet that should appear as the *destination*. Same
   *  shape as `expectedFromWallet` for SPL. */
  expectedTreasuryWallet: string;
  /** Raw token units (already scaled by 10^decimals). Use BigInt. */
  expectedAmount: bigint;
  /** Token mint, or `null` for native SOL transfers. */
  expectedMint: string | null;
};

export type VerifyEscrowResult =
  | { ok: true; confirmedAt: Date; actualAmount: bigint }
  | { ok: false; reason: string; code: VerifyFailureCode };

export type VerifyFailureCode =
  | "tx_not_found"
  | "tx_failed_on_chain"
  | "no_matching_transfer"
  | "mint_mismatch"
  | "sender_mismatch"
  | "recipient_mismatch"
  | "amount_too_low"
  | "rpc_error";

export async function verifyEscrowTx(
  args: VerifyEscrowArgs,
): Promise<VerifyEscrowResult> {
  const connection = new Connection(rpcEndpoint(), "confirmed");

  let tx;
  try {
    tx = await connection.getParsedTransaction(args.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  } catch (err) {
    return {
      ok: false,
      code: "rpc_error",
      reason: `RPC error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}`,
    };
  }

  if (!tx) {
    return { ok: false, code: "tx_not_found", reason: "Transaction not found or not yet confirmed" };
  }
  if (tx.meta?.err) {
    return {
      ok: false,
      code: "tx_failed_on_chain",
      reason: `Tx failed on-chain: ${JSON.stringify(tx.meta.err).slice(0, 200)}`,
    };
  }

  /* ---- Native SOL branch ----------------------------------------- */
  if (args.expectedMint === null) {
    const match = pickParsedTransfer(tx.transaction.message.instructions).find(
      (i) =>
        i.program === "system" &&
        i.parsed?.type === "transfer" &&
        (i.parsed.info?.destination as string | undefined) === args.expectedTreasuryWallet,
    );
    if (!match) {
      return {
        ok: false,
        code: "recipient_mismatch",
        reason: "No SOL transfer to the configured treasury found in this tx",
      };
    }
    const source = match.parsed?.info?.source as string | undefined;
    if (source !== args.expectedFromWallet) {
      return {
        ok: false,
        code: "sender_mismatch",
        reason: `Sender mismatch: expected ${args.expectedFromWallet}, got ${source}`,
      };
    }
    const lamports = BigInt(String(match.parsed?.info?.lamports ?? "0"));
    if (lamports < args.expectedAmount) {
      return {
        ok: false,
        code: "amount_too_low",
        reason: `Transferred ${lamports} lamports, expected ≥ ${args.expectedAmount}`,
      };
    }
    return {
      ok: true,
      confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
      actualAmount: lamports,
    };
  }

  /* ---- SPL token branch ------------------------------------------ */
  const transfer = pickParsedTransfer(tx.transaction.message.instructions).find(
    (i) =>
      (i.program === "spl-token" || i.program === "spl-token-2022") &&
      (i.parsed?.type === "transfer" || i.parsed?.type === "transferChecked"),
  );
  if (!transfer) {
    return {
      ok: false,
      code: "no_matching_transfer",
      reason: "No SPL transfer instruction in this tx",
    };
  }

  const info = transfer.parsed?.info as
    | {
        source?: string;
        destination?: string;
        mint?: string;
        amount?: string;
        tokenAmount?: { amount?: string; mint?: string };
      }
    | undefined;

  // `transferChecked` carries `mint` directly. Plain `transfer` doesn't,
  // so we resolve it from the source ATA's owner record below.
  const declaredMint = info?.mint ?? info?.tokenAmount?.mint ?? null;
  if (declaredMint && declaredMint !== args.expectedMint) {
    return {
      ok: false,
      code: "mint_mismatch",
      reason: `Token mint mismatch: expected ${args.expectedMint}, got ${declaredMint}`,
    };
  }

  const sourceAta = info?.source;
  const destAta = info?.destination;
  if (!sourceAta || !destAta) {
    return {
      ok: false,
      code: "no_matching_transfer",
      reason: "Parsed transfer is missing source/destination",
    };
  }

  // Verify ATA ownership. This is the critical check that stops spoof
  // attacks: an attacker can pass any signature, but the ATA owner is
  // recorded on-chain inside the token account itself — they can't fake
  // the relationship between the address that signed and the ATA used.
  const [srcInfo, dstInfo] = await Promise.all([
    connection.getParsedAccountInfo(new PublicKey(sourceAta)),
    connection.getParsedAccountInfo(new PublicKey(destAta)),
  ]);

  const srcOwner = readAtaOwner(srcInfo.value?.data);
  const dstOwner = readAtaOwner(dstInfo.value?.data);
  const srcMint = readAtaMint(srcInfo.value?.data);
  const dstMint = readAtaMint(dstInfo.value?.data);

  if (srcOwner !== args.expectedFromWallet) {
    return {
      ok: false,
      code: "sender_mismatch",
      reason: `Sender mismatch: ATA ${sourceAta} is owned by ${srcOwner ?? "unknown"}, expected ${args.expectedFromWallet}`,
    };
  }
  if (dstOwner !== args.expectedTreasuryWallet) {
    return {
      ok: false,
      code: "recipient_mismatch",
      reason: `Recipient mismatch: ATA ${destAta} is owned by ${dstOwner ?? "unknown"}, expected treasury ${args.expectedTreasuryWallet}`,
    };
  }
  if (srcMint !== args.expectedMint || dstMint !== args.expectedMint) {
    return {
      ok: false,
      code: "mint_mismatch",
      reason: `ATA mint mismatch: src=${srcMint}, dst=${dstMint}, expected ${args.expectedMint}`,
    };
  }

  const rawAmount = BigInt(
    info?.tokenAmount?.amount ?? info?.amount ?? "0",
  );
  if (rawAmount < args.expectedAmount) {
    return {
      ok: false,
      code: "amount_too_low",
      reason: `Transferred ${rawAmount} raw units, expected ≥ ${args.expectedAmount}`,
    };
  }

  return {
    ok: true,
    confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
    actualAmount: rawAmount,
  };
}

/* =========================================================================
   Helpers
   ========================================================================= */

type ParsedAnyInstruction = ParsedInstruction | PartiallyDecodedInstruction;

function pickParsedTransfer(
  instructions: readonly ParsedAnyInstruction[],
): Array<ParsedInstruction> {
  return instructions.filter(
    (i): i is ParsedInstruction => "parsed" in i && i.parsed != null,
  );
}

function readAtaOwner(data: unknown): string | null {
  const p = data as ParsedAccountData | undefined;
  const info = p?.parsed?.info as { owner?: string } | undefined;
  return info?.owner ?? null;
}

function readAtaMint(data: unknown): string | null {
  const p = data as ParsedAccountData | undefined;
  const info = p?.parsed?.info as { mint?: string } | undefined;
  return info?.mint ?? null;
}

/**
 * Validates that an address is a real Solana account that can sign
 * (i.e., on the ed25519 curve), not a PDA / contract address. Use this
 * before sending rewards — paying out to a PDA would lock the funds.
 */
export function isValidSolanaWallet(address: string): boolean {
  try {
    const pk = new PublicKey(address);
    return PublicKey.isOnCurve(pk.toBytes());
  } catch {
    return false;
  }
}
