import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  auditLog,
  bounties,
  claims,
  platformRevenue,
  users,
} from "@/lib/db/schema";
import { verifyCronRequest } from "@/lib/cron/auth";
import { getChainAdapter, isChain } from "@/lib/chains";
import { publishEvent } from "@/lib/realtime/publisher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/recover-stuck-claims — every 10 minutes.
 *
 * The defense for threat model #2 (re-entrancy via crash mid-tx). A
 * claim is *stuck* if it sat in `claiming` for more than the threshold
 * — that means the process owning the send died after the conditional
 * UPDATE to `claiming` but before the success UPDATE to `claimed_reward`.
 *
 * Without recovery, the hunter is blocked forever (status != verified)
 * even though their reward may already be on-chain.
 *
 * Recovery logic:
 *   • Has `claim_tx_hash`? — the tx was issued. Ask the RPC; if it
 *     succeeded, promote to `claimed_reward` (idempotent platform-fee
 *     write, idempotent user/bounty counter bumps). If failed/not-found,
 *     release to `verified` so the hunter can retry.
 *   • No `claim_tx_hash` — the tx never left. Release to `verified`.
 *
 * Self-healing: the run is a no-op when nothing's stuck. Safe to run as
 * often as you like.
 */

const STUCK_AFTER_MINUTES = 5;
const PLATFORM_FEE_BPS = 500;
const BATCH = 50;

export async function POST(req: NextRequest) {
  const denial = verifyCronRequest(req);
  if (denial) return denial;

  const db = getDb();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000);

  const stuck = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.status, "claiming"),
        isNotNull(claims.claimAttemptedAt),
        lt(claims.claimAttemptedAt, cutoff),
      ),
    )
    .limit(BATCH);

  if (stuck.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, recovered: [], released: [] });
  }

  const recovered: Array<{ id: string; sig: string }> = [];
  const released: Array<{ id: string; reason: string }> = [];

  for (const claim of stuck) {
    try {
      // Settle the recovery on the claim's own chain.
      const chain = isChain(claim.chain) ? claim.chain : "solana";
      const adapter = getChainAdapter(chain);
      // Defense-in-depth: if the route handler crashed AFTER sendReward
      // resolved on-chain but BEFORE writing claim_tx_hash, the DB row
      // still has claim_tx_hash=null. sendReward writes an audit_log
      // entry with the signature right after submission, so we can
      // recover the hash from there and avoid releasing a row that's
      // already paid out (which would let the hunter double-claim).
      let txHash: string | null = claim.claimTxHash;
      if (!txHash) {
        const [audit] = await db
          .select({ afterState: auditLog.afterState })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.entityType, "claim"),
              eq(auditLog.entityId, claim.id),
              eq(auditLog.action, "reward_sent"),
            ),
          )
          .orderBy(desc(auditLog.createdAt))
          .limit(1);
        const auditedTx = (audit?.afterState as { txHash?: unknown } | null)
          ?.txHash;
        if (typeof auditedTx === "string" && auditedTx.length > 0) {
          txHash = auditedTx;
          // Persist it back to the claim so future runs don't repeat
          // the audit-log lookup.
          await db
            .update(claims)
            .set({ claimTxHash: auditedTx, updatedAt: new Date() })
            .where(eq(claims.id, claim.id))
            .catch(() => {});
        }
      }

      if (txHash) {
        // Mock signatures always "succeed" by definition (we never hit the
        // RPC). Otherwise look up the receipt: found+success = mined ok,
        // found+!success = mined-and-reverted (definitively failed), and a
        // missing receipt is AMBIGUOUS (still pending / RPC hiccup).
        const mock = adapter.isMockSignature(txHash);
        const receipt = mock
          ? { found: true, success: true }
          : ((await adapter.getTxReceipt?.(txHash)) ?? {
              found: false,
              success: false,
            });

        if (receipt.found && receipt.success) {
          const completedAt = new Date();
          const promoted = await db
            .update(claims)
            .set({
              status: "claimed_reward",
              claimedAt: completedAt,
              claimTxConfirmedAt: completedAt,
              claimTxError: null,
              updatedAt: completedAt,
            })
            .where(
              and(eq(claims.id, claim.id), eq(claims.status, "claiming")),
            )
            .returning();
          if (promoted.length > 0) {
            await bumpCountersOnce(db, claim);
            publishEvent(`user-${claim.hunterUserId}`, "bounty_updated", {
              claimId: claim.id,
              bountyId: claim.bountyId,
              status: "claimed_reward",
            });
            publishEvent(`bounty-${claim.bountyId}`, "bounty_updated", {
              bountyId: claim.bountyId,
            });
            recovered.push({ id: claim.id, sig: txHash });
          }
          continue;
        }

        if (!receipt.found) {
          // AMBIGUOUS: the tx may still be in the mempool or the RPC just
          // failed. Do NOT release — releasing would let the hunter
          // re-claim and the treasury could double-pay if this tx actually
          // lands. Leave it in `claiming` and retry next run.
          console.warn(
            `[recover-stuck-claims] claim ${claim.id} tx ${txHash} not yet resolvable — leaving in claiming for retry`,
          );
          continue;
        }
        // receipt.found && !receipt.success → mined and reverted. Fall
        // through to release so the hunter can retry with a fresh tx.
      }

      // No tx hash, or the recorded tx definitively reverted — release back
      // to `verified` so the hunter retries.
      const released_row = await db
        .update(claims)
        .set({
          status: "verified",
          claimAttemptedAt: null,
          // Clear the dead hash so a retry isn't blocked by the partial
          // unique index and the next run starts clean.
          claimTxHash: null,
          claimTxError: txHash
            ? "Stuck in claiming; on-chain tx reverted"
            : "Stuck in claiming; no tx hash recorded",
          updatedAt: new Date(),
        })
        .where(and(eq(claims.id, claim.id), eq(claims.status, "claiming")))
        .returning({ id: claims.id });
      if (released_row.length > 0) {
        released.push({
          id: claim.id,
          reason: txHash ? "tx_reverted" : "no_tx_hash",
        });
      }
    } catch (err) {
      console.warn(
        `[recover-stuck-claims] claim ${claim.id} failed:`,
        err instanceof Error ? err.message.slice(0, 200) : err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    processed: stuck.length,
    recovered,
    released,
  });
}

/**
 * Bump user totals + platform_revenue exactly once. The platform_revenue
 * UNIQUE-ish constraint here is "no row already exists for this claim
 * with source_type='claim_fee'" — we check before inserting because we
 * may be replaying a recovery on a row that the route handler had
 * already half-processed.
 */
async function bumpCountersOnce(
  db: ReturnType<typeof getDb>,
  claim: typeof claims.$inferSelect,
): Promise<void> {
  const rewardAmount = Number(claim.rewardAmount);
  const rewardAmountUsd = claim.rewardAmountUsd
    ? Number(claim.rewardAmountUsd)
    : 0;
  const feeAmount = (rewardAmount * PLATFORM_FEE_BPS) / 10_000;
  const feeAmountUsd = (rewardAmountUsd * PLATFORM_FEE_BPS) / 10_000;

  // platform_revenue: skip insert if one already exists for this claim.
  // The claim-reward route also writes this — we don't want a duplicate.
  const [existing] = await db
    .select({ id: platformRevenue.id })
    .from(platformRevenue)
    .where(
      and(
        eq(platformRevenue.claimId, claim.id),
        eq(platformRevenue.sourceType, "claim_fee"),
      ),
    )
    .limit(1);
  if (!existing && feeAmount > 0) {
    await db.insert(platformRevenue).values({
      sourceType: "claim_fee",
      claimId: claim.id,
      bountyId: claim.bountyId,
      amount: feeAmount.toString(),
      amountUsd: feeAmountUsd.toFixed(6),
      tokenMint: claim.rewardTokenMint,
      tokenSymbol: claim.rewardTokenSymbol,
    });
  }

  // User + bounty counter bumps are best-effort. If the route handler
  // already ran them, we'd double-count — so guard by checking whether
  // the claim already shows in platform_revenue. (existing == claim
  // already settled by the route; skip the bumps.)
  if (!existing) {
    await db
      .update(users)
      .set({
        totalRewardsEarnedUsd: sql`${users.totalRewardsEarnedUsd} + ${rewardAmountUsd}`,
        totalBountiesCompleted: sql`${users.totalBountiesCompleted} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, claim.hunterUserId));

    await db
      .update(bounties)
      .set({
        claimedHuntersCount: sql`${bounties.claimedHuntersCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(bounties.id, claim.bountyId));
  }
}
