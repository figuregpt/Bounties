import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  auditLog,
  bounties,
  claims,
  notifications,
  users,
  userWallets,
} from "@/lib/db/schema";
import { getChainAdapter, isChain } from "@/lib/chains";
import type { Bounty } from "@/types/database";

/**
 * Unclaimed-pool refund.
 *
 * Runs once per bounty after final verification. Counts how much of the
 * reward pool actually went to verified hunters; the remainder ships
 * back to the creator's wallet. The refund is idempotent — if the row
 * already has `refundTxHash` set, this is a no-op.
 *
 * Status semantics:
 *   • verified / claiming / claimed_reward → reward stays with hunter
 *     (or is reserved for them).
 *   • everything else (failed, cancelled, awaiting_action that never
 *     got verified) → returns to the creator.
 */

const VERIFIED_CLAIM_STATUSES = [
  "verified",
  "claiming",
  "claimed_reward",
] as const;

export type RefundResult =
  | { kind: "noop"; reason: string }
  | {
      kind: "refunded";
      amount: number;
      tokenSymbol: string;
      txSignature: string;
      mock: boolean;
    }
  | { kind: "failed"; error: string };

export async function processUnclaimedRefund(
  bountyId: string,
): Promise<RefundResult> {
  const db = getDb();

  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.id, bountyId))
    .limit(1);
  if (!bounty) return { kind: "noop", reason: "Bounty not found" };

  if (bounty.refundTxHash) {
    return { kind: "noop", reason: "Already refunded" };
  }

  // Count claims that are entitled to the reward (verified or claimed
  // already). Anything else means the slot's reward returns to creator.
  const verifiedRows = await db
    .select({ count: sql<number>`count(*)::int`.as("count") })
    .from(claims)
    .where(
      and(
        eq(claims.bountyId, bountyId),
        inArray(claims.status, VERIFIED_CLAIM_STATUSES),
      ),
    );
  const verifiedCount = verifiedRows[0]?.count ?? 0;

  const rewardPerHunter = Number(bounty.rewardPerHunter);
  const totalPool = Number(bounty.totalPool);
  const claimedAmount = verifiedCount * rewardPerHunter;
  const refundAmount = totalPool - claimedAmount;

  if (refundAmount <= 0) {
    return { kind: "noop", reason: "Pool fully distributed" };
  }

  const chain = isChain(bounty.chain) ? bounty.chain : "solana";
  const adapter = getChainAdapter(chain);

  const [creator] = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
      twitterHandle: users.twitterHandle,
    })
    .from(users)
    .where(eq(users.id, bounty.creatorUserId))
    .limit(1);
  if (!creator) {
    return { kind: "failed", error: "Creator not found" };
  }

  // The refund must settle on the bounty's chain — resolve the creator's
  // wallet for THAT chain (Solana falls back to the legacy column). A
  // Monad bounty refunds to the creator's Monad address, never Solana.
  const [creatorWalletRow] = await db
    .select({ address: userWallets.address })
    .from(userWallets)
    .where(
      and(eq(userWallets.userId, creator.id), eq(userWallets.chain, chain)),
    )
    .limit(1);
  const refundWallet =
    creatorWalletRow?.address ??
    (chain === "solana" ? creator.walletAddress : null);
  if (!refundWallet) {
    return { kind: "failed", error: `Creator ${chain} wallet not on file` };
  }

  const tx = await adapter.sendReward({
    toWalletAddress: refundWallet,
    tokenMint: bounty.rewardTokenMint,
    tokenSymbol: bounty.rewardTokenSymbol,
    amount: refundAmount,
    decimals: bounty.rewardTokenDecimals,
    reference: `refund:${bountyId}`,
    bountyId,
    // Creator is registered by definition (they created the bounty).
    // Skip the redundant user-table lookup.
    recipientPreverified: true,
  });

  if (!tx.ok) {
    return { kind: "failed", error: tx.error };
  }

  // Phase 9A defense #10: atomic refund persistence. The conditional
  // UPDATE rejects the write if `refund_tx_hash` is already populated —
  // partial UNIQUE on the column would catch it too, but explicit
  // predicate gives a cleaner failure mode (returns 0 rows, never raises).
  const now = new Date();
  const refundedRows = await db
    .update(bounties)
    .set({
      refundTxHash: tx.signature,
      refundedAmount: refundAmount.toString(),
      refundedAt: now,
      updatedAt: now,
    })
    .where(and(eq(bounties.id, bountyId), isNull(bounties.refundTxHash)))
    .returning({ id: bounties.id });

  if (refundedRows.length === 0) {
    // Another run beat us to it. Funds are on-chain (sendReward succeeded)
    // but the DB column already references a different signature. Surface
    // this loudly so ops can reconcile the double-send.
    console.error(
      "[refund] DOUBLE-REFUND RISK: refund_tx_hash was already populated " +
        `for bounty ${bountyId} after sendReward returned ok. ` +
        `Our tx: ${tx.signature}. Reconcile manually.`,
    );
    return {
      kind: "failed",
      error: "Refund column already populated — possible double-spend, escalate",
    };
  }

  await db.insert(notifications).values({
    userId: creator.id,
    type: "bounty_refund_processed",
    title: "Unclaimed reward refunded",
    body: `${formatAmount(refundAmount)} ${bounty.rewardTokenSymbol} returned to your wallet`,
    linkUrl: `/bounties/${bounty.slug}`,
    relatedBountyId: bounty.id,
  });

  // Forensic trail for every refund — disputes get answered from here.
  try {
    await db.insert(auditLog).values({
      actorType: "system",
      action: "refund_sent",
      entityType: "bounty",
      entityId: bountyId,
      afterState: {
        txHash: tx.signature,
        amount: refundAmount,
        tokenMint: bounty.rewardTokenMint,
        tokenSymbol: bounty.rewardTokenSymbol,
        recipient: refundWallet,
        verifiedClaims: verifiedCount,
        totalPool,
      },
    });
  } catch (err) {
    console.warn(
      "[refund] audit_log insert failed:",
      err instanceof Error ? err.message.slice(0, 200) : err,
    );
  }

  return {
    kind: "refunded",
    amount: refundAmount,
    tokenSymbol: bounty.rewardTokenSymbol,
    txSignature: tx.signature,
    mock: tx.mock,
  };
}

function formatAmount(n: number): string {
  if (n >= 100) return Math.round(n).toString();
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/** Re-export for callers that need the bounty type alongside refunds. */
export type { Bounty };
