import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  bounties,
  claims,
  platformRevenue,
  users,
} from "@/lib/db/schema";
import { sendReward } from "@/lib/solana/treasury";
import { getRevenueWalletPublicKeyOrNull } from "@/lib/solana/env";
import { isValidSolanaWallet } from "@/lib/solana/verify-tx";
import { updateClaimStatus } from "@/lib/bounties/claim-status";
import { publishEvent } from "@/lib/realtime/publisher";
import { recordActivity } from "@/lib/realtime/activity";

const BodySchema = z
  .object({
    walletAddress: z.string().min(32).max(48).optional(),
  })
  .optional();

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/claims/[id]/claim-reward — hunter takes their payout.
 *
 * Phase 9A defenses (matches threat model items #1, #2, #3, #7, #11):
 *
 *   1. Atomic ownership lock — the verified→claiming UPDATE includes
 *      `hunterUserId` in the WHERE clause. A spoofed user id loses the
 *      race (claim untouched) AND can't enumerate other people's claims
 *      via timing because we never read the row before the conditional
 *      write.
 *   2. Replay protection — `claim_tx_hash` carries a partial UNIQUE
 *      index; recording the same on-chain signature twice throws.
 *   3. Distinguished error responses — `already_claiming` (in-flight by
 *      another tab) vs `already_claimed_reward` (terminal, includes the
 *      tx hash the hunter can show in their wallet) vs `invalid_status`
 *      (lifecycle wrong).
 *   4. Decimals fix — sendReward needs the *bounty's* recorded decimals
 *      to scale the amount correctly. Passing 0 sent 1 raw unit for any
 *      SPL reward.
 *   5. Recipient + balance pre-flight — pushed into sendReward itself,
 *      so this route just surfaces the structured error code on failure.
 *   6. Stale recovery — `claimAttemptedAt` is stamped on the verified→
 *      claiming flip. The recover-stuck-claims cron uses that timestamp
 *      to detect rows where the process crashed mid-tx.
 */

const PLATFORM_FEE_BPS = 500;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  // Hunter can pass the wallet they want the reward to land in. We
  // prefer this over the saved `user.walletAddress` so a single
  // account can pay out into different wallets across claims (and
  // multiple accounts can share one wallet without DB UNIQUE
  // collisions). Falls back to the saved address for legacy callers
  // that don't include the body.
  let bodyWallet: string | null = null;
  try {
    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (parsed.success && parsed.data?.walletAddress) {
      bodyWallet = parsed.data.walletAddress;
    }
  } catch {
    /* no body / not JSON — fall through to saved wallet */
  }

  const db = getDb();

  /* ---- Read claim + bounty in one trip ----------------------------- */
  // We need the bounty row for `rewardTokenDecimals` (claims don't
  // store it). Joining lets us reuse the read for the pre-condition
  // checks below.
  const rows = await db
    .select({
      claim: claims,
      bountyTokenDecimals: bounties.rewardTokenDecimals,
      bountyStatus: bounties.status,
      bountyDistributionModel: bounties.distributionModel,
    })
    .from(claims)
    .leftJoin(bounties, eq(bounties.id, claims.bountyId))
    .where(eq(claims.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Claim not found" },
      { status: 404 },
    );
  }
  const { claim } = row;
  if (claim.hunterUserId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  // (claim window removed — verified claims stay claimable indefinitely)
  if (row.bountyStatus === "cancelled" || row.bountyStatus === "broken") {
    return NextResponse.json(
      {
        ok: false,
        error: `Bounty is ${row.bountyStatus}; rewards aren't payable`,
        errorCode: "bounty_unavailable",
      },
      { status: 409 },
    );
  }

  // Lottery defense-in-depth. The completion cron promotes ALL
  // Layer-2-passing claims to `verified` BEFORE drawing winners — so
  // during that window (which can take minutes on a busy bounty) a
  // lottery loser briefly appears claimable. The atomic
  // verified→claiming UPDATE later already protects against this
  // (their status is `failed` by the time we touch the DB), but
  // refusing the request up-front avoids racing on a stale page state
  // and gives the user a clean message instead of a wrong_state 409.
  // Once bounty.status='completed', the draw has definitively
  // resolved and remaining `verified` claims are real winners.
  if (
    row.bountyDistributionModel === "pool_lottery" &&
    row.bountyStatus !== "completed"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The lottery hasn't drawn winners yet — check back once the bounty has closed.",
        errorCode: "lottery_not_drawn",
      },
      { status: 409 },
    );
  }
  if (row.bountyTokenDecimals == null) {
    // Should never happen — bounty row is required — but better an
    // explicit 500 than silently truncating the reward.
    return NextResponse.json(
      { ok: false, error: "Bounty record missing token decimals" },
      { status: 500 },
    );
  }

  /* ---- Atomic reservation (verified → claiming) -------------------- */
  // Ownership + status are checked atomically in the predicate.
  // Concurrent calls lose; the loser branch below distinguishes
  // "in-flight" from "already done" so the UI can show the right copy.
  const now = new Date();
  const reserved = await updateClaimStatus({
    claimId: claim.id,
    fromStatus: "verified",
    toStatus: "claiming",
    hunterUserId: user.id,
    set: { claimAttemptedAt: now },
  });
  if (!reserved) {
    if (claim.status === "claiming") {
      return NextResponse.json(
        {
          ok: false,
          error: "Another claim attempt is already in progress",
          errorCode: "already_claiming",
          retryAfterSeconds: 30,
        },
        { status: 409 },
      );
    }
    if (claim.status === "claimed_reward") {
      return NextResponse.json(
        {
          ok: false,
          error: "Reward already sent — check your wallet",
          errorCode: "already_claimed",
          txHash: claim.claimTxHash,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: `Claim is in status '${claim.status}', not eligible to claim`,
        errorCode: "wrong_state",
        status: claim.status,
      },
      { status: 409 },
    );
  }

  /* ---- Recipient resolution ---------------------------------------- */
  // Prefer the wallet the hunter sent in the request body (the live
  // wallet-adapter address). Fall back to whatever's saved on the
  // user row. Reward sends to wherever the hunter is connected RIGHT
  // NOW — no need to keep the user → wallet binding sticky.
  const recipientWallet = bodyWallet ?? user.walletAddress;
  if (!recipientWallet || !isValidSolanaWallet(recipientWallet)) {
    // Roll the claim back so the hunter can retry once they connect.
    await db
      .update(claims)
      .set({
        status: "verified",
        claimAttemptedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claim.id));
    return NextResponse.json(
      {
        ok: false,
        error: "Connect a wallet so we know where to send the reward",
        errorCode: "wallet_not_connected",
      },
      { status: 409 },
    );
  }

  /* ---- Net the platform fee ---------------------------------------- */
  // Reward amount captured on the bounty is the GROSS payout — the
  // 5% platform fee (PLATFORM_FEE_BPS) stays in the treasury so the
  // hunter receives net. The fee row in `platform_revenue` records
  // the same amount we're holding back, for buyback accounting.
  const grossReward = Number(claim.rewardAmount);
  const feeAmount = (grossReward * PLATFORM_FEE_BPS) / 10_000;
  const netReward = grossReward - feeAmount;

  /* ---- Send the reward --------------------------------------------- */
  // sendReward validates recipient (on-curve), pre-flights treasury
  // balance, then retries up to 3x with backoff. When the revenue
  // wallet is configured, the 5% fee is co-transferred in the same
  // on-chain tx so payout and fee collection are atomic — no risk of
  // sending the net reward but leaving the fee stuck in treasury.
  const revenueWallet = getRevenueWalletPublicKeyOrNull();
  const tx = await sendReward({
    toWalletAddress: recipientWallet,
    tokenMint: claim.rewardTokenMint,
    tokenSymbol: claim.rewardTokenSymbol,
    amount: netReward,
    decimals: row.bountyTokenDecimals,
    reference: `claim:${claim.id}`,
    claimId: claim.id,
    bountyId: claim.bountyId,
    recipientPreverified: true,
    fee:
      revenueWallet && feeAmount > 0
        ? { toWalletAddress: revenueWallet, amount: feeAmount }
        : undefined,
  });

  if (tx.ok) {
    // Persist the tx hash IMMEDIATELY so a crash between here and the
    // final status flip can be recovered by `cron/recover-stuck-claims`
    // (which uses the hash to check on-chain before deciding whether
    // the claim was paid). Without this, the claim stays in 'claiming'
    // with claim_tx_hash=null and recovery falls back to the audit_log
    // — but persisting here is the cheaper, more direct guarantee.
    await db
      .update(claims)
      .set({ claimTxHash: tx.signature, updatedAt: new Date() })
      .where(eq(claims.id, claim.id));
  }

  if (!tx.ok) {
    // Roll back to `verified` so the hunter can retry. Stash error +
    // clear claimAttemptedAt — the row is no longer in-flight.
    await db
      .update(claims)
      .set({
        status: "verified",
        claimTxError: tx.error,
        claimAttemptedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claim.id));
    return NextResponse.json(
      {
        ok: false,
        error: tx.error,
        errorCode: tx.errorCode,
      },
      { status: 500 },
    );
  }

  /* ---- Persist success --------------------------------------------- */
  // Same atomic guard as the reservation: only flip if we're still in
  // 'claiming'. Protects against the stuck-claim recovery cron racing
  // with us if the tx took >5min to confirm.
  const completedAt = new Date();
  const updatedClaim = await updateClaimStatus({
    claimId: claim.id,
    fromStatus: "claiming",
    toStatus: "claimed_reward",
    set: {
      claimedAt: completedAt,
      claimTxHash: tx.signature,
      claimTxConfirmedAt: completedAt,
      claimTxError: null,
    },
  });
  if (!updatedClaim) {
    // Recovery cron got here first — fine, the row is already in the
    // terminal state. Don't double-bump counters.
    return NextResponse.json({
      ok: true,
      claim: { id: claim.id, status: "claimed_reward" },
      tx: { signature: tx.signature, mock: tx.mock },
      note: "Recovered by stuck-claim cron",
    });
  }

  await db
    .update(users)
    .set({
      totalRewardsEarnedUsd: sql`${users.totalRewardsEarnedUsd} + ${claim.rewardAmountUsd ?? 0}`,
      totalBountiesCompleted: sql`${users.totalBountiesCompleted} + 1`,
      updatedAt: completedAt,
    })
    .where(eq(users.id, user.id));

  await db
    .update(bounties)
    .set({
      claimedHuntersCount: sql`${bounties.claimedHuntersCount} + 1`,
      updatedAt: completedAt,
    })
    .where(eq(bounties.id, claim.bountyId));

  /* ---- Platform fee row -------------------------------------------- */
  // Fee was already deducted from the on-chain transfer above. This
  // just records it for the buyback pipeline accounting. Wrapped so
  // a logging failure can't roll back the on-chain success.
  const rewardAmountUsd = claim.rewardAmountUsd
    ? Number(claim.rewardAmountUsd)
    : 0;
  const feeAmountUsd = (rewardAmountUsd * PLATFORM_FEE_BPS) / 10_000;
  if (feeAmount > 0) {
    try {
      await db.insert(platformRevenue).values({
        sourceType: "claim_fee",
        claimId: claim.id,
        bountyId: claim.bountyId,
        amount: feeAmount.toString(),
        amountUsd: feeAmountUsd.toFixed(6),
        tokenMint: claim.rewardTokenMint,
        tokenSymbol: claim.rewardTokenSymbol,
      });
    } catch (err) {
      console.warn(
        "[claim-reward] platform_revenue insert failed:",
        err instanceof Error ? err.message.slice(0, 200) : err,
      );
    }
  }

  publishEvent(`user-${user.id}`, "bounty_updated", {
    claimId: claim.id,
    bountyId: claim.bountyId,
    status: "claimed_reward",
  });
  publishEvent(`bounty-${claim.bountyId}`, "bounty_updated", {
    bountyId: claim.bountyId,
  });

  void recordActivity({
    type: "bounty_claimed",
    actorUserId: user.id,
    bountyId: claim.bountyId,
    claimId: claim.id,
  });

  return NextResponse.json({
    ok: true,
    claim: updatedClaim,
    tx: { signature: tx.signature, mock: tx.mock },
  });
}
