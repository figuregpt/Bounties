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
  /** Optional: when a separate revenue wallet is configured the tx
   *  should also contain a second transfer of `fee.amount` to
   *  `fee.recipientWallet`. If we can't find it but the treasury
   *  transfer covered `expectedAmount + fee.amount` (the legacy single-
   *  transfer combined mode), the call still succeeds — that's how we
   *  keep stale-browser-tab launches from bricking right after we
   *  flip on REVENUE_WALLET_PUBLIC_KEY.
   */
  expectedFee?: {
    recipientWallet: string;
    amount: bigint;
  };
};

export type VerifyEscrowResult =
  | {
      ok: true;
      confirmedAt: Date;
      actualAmount: bigint;
      /** Where the creation fee actually landed. "revenue" = expected
       *  new path; "treasury_legacy" = single-transfer fallback,
       *  caller should sweep manually after activation. */
      feeRoutedTo?: "revenue" | "treasury_legacy" | "none";
    }
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
    const systemTransfers = pickParsedTransfer(
      tx.transaction.message.instructions,
    ).filter(
      (i) => i.program === "system" && i.parsed?.type === "transfer",
    );
    const toTreasury = systemTransfers.find(
      (i) =>
        (i.parsed.info?.destination as string | undefined) ===
        args.expectedTreasuryWallet,
    );
    if (!toTreasury) {
      return {
        ok: false,
        code: "recipient_mismatch",
        reason: "No SOL transfer to the configured treasury found in this tx",
      };
    }
    const source = toTreasury.parsed?.info?.source as string | undefined;
    if (source !== args.expectedFromWallet) {
      return {
        ok: false,
        code: "sender_mismatch",
        reason: `Sender mismatch: expected ${args.expectedFromWallet}, got ${source}`,
      };
    }
    const treasuryLamports = BigInt(
      String(toTreasury.parsed?.info?.lamports ?? "0"),
    );

    // No fee expectation → classic single-transfer verification.
    if (!args.expectedFee) {
      if (treasuryLamports < args.expectedAmount) {
        return {
          ok: false,
          code: "amount_too_low",
          reason: `Transferred ${treasuryLamports} lamports, expected ≥ ${args.expectedAmount}`,
        };
      }
      return {
        ok: true,
        confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
        actualAmount: treasuryLamports,
        feeRoutedTo: "none",
      };
    }

    // Fee expectation set. Two paths:
    //   • new client → second transfer to revenue wallet, treasury gets
    //     exactly `expectedAmount`, revenue gets `expectedFee.amount`
    //   • old client (stale tab) → single transfer to treasury for the
    //     combined amount; fall back so we don't brick the launch
    const toRevenue = systemTransfers.find(
      (i) =>
        (i.parsed.info?.destination as string | undefined) ===
          args.expectedFee?.recipientWallet &&
        (i.parsed.info?.source as string | undefined) ===
          args.expectedFromWallet,
    );
    if (toRevenue) {
      const feeLamports = BigInt(
        String(toRevenue.parsed?.info?.lamports ?? "0"),
      );
      if (treasuryLamports < args.expectedAmount) {
        return {
          ok: false,
          code: "amount_too_low",
          reason: `Treasury transfer: ${treasuryLamports} lamports, expected ≥ ${args.expectedAmount}`,
        };
      }
      if (feeLamports < args.expectedFee.amount) {
        return {
          ok: false,
          code: "amount_too_low",
          reason: `Revenue transfer: ${feeLamports} lamports, expected ≥ ${args.expectedFee.amount}`,
        };
      }
      return {
        ok: true,
        confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
        actualAmount: treasuryLamports,
        feeRoutedTo: "revenue",
      };
    }

    // Legacy fallback: combined amount went to treasury.
    const combined = args.expectedAmount + args.expectedFee.amount;
    if (treasuryLamports < combined) {
      return {
        ok: false,
        code: "amount_too_low",
        reason: `Single-transfer fallback: treasury got ${treasuryLamports} lamports, expected ≥ ${combined}`,
      };
    }
    return {
      ok: true,
      confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
      actualAmount: treasuryLamports,
      feeRoutedTo: "treasury_legacy",
    };
  }

  /* ---- SPL token branch ------------------------------------------ */
  const splTransfers = pickParsedTransfer(
    tx.transaction.message.instructions,
  ).filter(
    (i) =>
      (i.program === "spl-token" || i.program === "spl-token-2022") &&
      (i.parsed?.type === "transfer" || i.parsed?.type === "transferChecked"),
  );
  if (splTransfers.length === 0) {
    return {
      ok: false,
      code: "no_matching_transfer",
      reason: "No SPL transfer instruction in this tx",
    };
  }

  // Resolve every SPL transfer's source/destination ATA owners up-front
  // so we can pick which one is the treasury leg and which (if any) is
  // the revenue leg without re-walking instructions.
  type ResolvedTransfer = {
    rawAmount: bigint;
    srcOwner: string | null;
    dstOwner: string | null;
    srcMint: string | null;
    dstMint: string | null;
  };
  const resolved: ResolvedTransfer[] = await Promise.all(
    splTransfers.map(async (t) => {
      const info = t.parsed?.info as
        | {
            source?: string;
            destination?: string;
            amount?: string;
            tokenAmount?: { amount?: string };
          }
        | undefined;
      const sourceAta = info?.source;
      const destAta = info?.destination;
      if (!sourceAta || !destAta) {
        return {
          rawAmount: BigInt(0),
          srcOwner: null,
          dstOwner: null,
          srcMint: null,
          dstMint: null,
        };
      }
      const [srcInfo, dstInfo] = await Promise.all([
        connection.getParsedAccountInfo(new PublicKey(sourceAta)),
        connection.getParsedAccountInfo(new PublicKey(destAta)),
      ]);
      return {
        rawAmount: BigInt(info?.tokenAmount?.amount ?? info?.amount ?? "0"),
        srcOwner: readAtaOwner(srcInfo.value?.data),
        dstOwner: readAtaOwner(dstInfo.value?.data),
        srcMint: readAtaMint(srcInfo.value?.data),
        dstMint: readAtaMint(dstInfo.value?.data),
      };
    }),
  );

  const toTreasury = resolved.find(
    (r) =>
      r.srcOwner === args.expectedFromWallet &&
      r.dstOwner === args.expectedTreasuryWallet &&
      r.srcMint === args.expectedMint &&
      r.dstMint === args.expectedMint,
  );
  if (!toTreasury) {
    // Check whether we found a transfer that's close-but-wrong so we
    // can give a useful failure code.
    const wrongMint = resolved.find(
      (r) =>
        (r.srcMint && r.srcMint !== args.expectedMint) ||
        (r.dstMint && r.dstMint !== args.expectedMint),
    );
    if (wrongMint) {
      return {
        ok: false,
        code: "mint_mismatch",
        reason: `ATA mint mismatch: src=${wrongMint.srcMint}, dst=${wrongMint.dstMint}, expected ${args.expectedMint}`,
      };
    }
    return {
      ok: false,
      code: "recipient_mismatch",
      reason: `No SPL transfer to treasury (${args.expectedTreasuryWallet}) from creator (${args.expectedFromWallet}) for mint ${args.expectedMint}`,
    };
  }

  // No fee expectation → classic single-transfer.
  if (!args.expectedFee) {
    if (toTreasury.rawAmount < args.expectedAmount) {
      return {
        ok: false,
        code: "amount_too_low",
        reason: `Transferred ${toTreasury.rawAmount} raw units, expected ≥ ${args.expectedAmount}`,
      };
    }
    return {
      ok: true,
      confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
      actualAmount: toTreasury.rawAmount,
      feeRoutedTo: "none",
    };
  }

  // Fee expected — try new path first (second transfer to revenue),
  // then fall back to legacy combined-amount-to-treasury mode.
  const toRevenue = resolved.find(
    (r) =>
      r !== toTreasury &&
      r.srcOwner === args.expectedFromWallet &&
      r.dstOwner === args.expectedFee?.recipientWallet &&
      r.srcMint === args.expectedMint &&
      r.dstMint === args.expectedMint,
  );
  if (toRevenue) {
    if (toTreasury.rawAmount < args.expectedAmount) {
      return {
        ok: false,
        code: "amount_too_low",
        reason: `Treasury transfer: ${toTreasury.rawAmount} raw units, expected ≥ ${args.expectedAmount}`,
      };
    }
    if (toRevenue.rawAmount < args.expectedFee.amount) {
      return {
        ok: false,
        code: "amount_too_low",
        reason: `Revenue transfer: ${toRevenue.rawAmount} raw units, expected ≥ ${args.expectedFee.amount}`,
      };
    }
    return {
      ok: true,
      confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
      actualAmount: toTreasury.rawAmount,
      feeRoutedTo: "revenue",
    };
  }

  // Legacy fallback — combined amount in the single treasury transfer.
  const combined = args.expectedAmount + args.expectedFee.amount;
  if (toTreasury.rawAmount < combined) {
    return {
      ok: false,
      code: "amount_too_low",
      reason: `Single-transfer fallback: treasury got ${toTreasury.rawAmount} raw units, expected ≥ ${combined}`,
    };
  }
  return {
    ok: true,
    confirmedAt: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
    actualAmount: toTreasury.rawAmount,
    feeRoutedTo: "treasury_legacy",
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
