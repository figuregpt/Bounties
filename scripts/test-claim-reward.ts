/**
 * Phase 8 self-test harness: drives the claim-reward route's business
 * logic without going through Privy auth. Pass the claim id as argv.
 *
 *   npm run script:test-claim-reward -- <claim-id>
 *
 * Mirrors src/app/api/claims/[id]/claim-reward/route.ts step-for-step.
 */

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { sendReward } from "@/lib/solana/treasury";

const PLATFORM_FEE_BPS = 500;

async function main() {
  const claimId = process.argv[2];
  if (!claimId) {
    console.error("Usage: test-claim-reward.ts <claim-id>");
    process.exit(2);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sqlClient = postgres(url, { max: 2, prepare: false });
  const db = drizzle(sqlClient, { schema });
  const { bounties, claims, platformRevenue, users } = schema;

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claim) throw new Error(`claim ${claimId} not found`);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, claim.hunterUserId))
    .limit(1);
  if (!user) throw new Error("hunter user not found");

  if (
    claim.claimWindowEndsAt &&
    claim.claimWindowEndsAt.getTime() < Date.now()
  ) {
    throw new Error("claim window expired");
  }

  // 1) Atomic reservation
  const reserved = await db
    .update(claims)
    .set({ status: "claiming", updatedAt: new Date() })
    .where(and(eq(claims.id, claim.id), eq(claims.status, "verified")))
    .returning({ id: claims.id });
  if (reserved.length === 0) {
    throw new Error(`claim not in 'verified' (status=${claim.status})`);
  }
  console.log(`[step 1] reserved claim ${claim.id} (verified → claiming)`);

  // 2) Send the reward
  if (!user.walletAddress) {
    throw new Error(`user ${user.id} has no walletAddress — connect first`);
  }
  const tx = await sendReward({
    toWalletAddress: user.walletAddress,
    tokenMint: claim.rewardTokenMint,
    tokenSymbol: claim.rewardTokenSymbol,
    amount: Number(claim.rewardAmount),
    decimals: 0,
    reference: `claim:${claim.id}`,
  });
  if (!tx.ok) {
    await db
      .update(claims)
      .set({
        status: "verified",
        claimTxError: tx.error,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claim.id));
    throw new Error(`tx failed: ${tx.error}`);
  }
  console.log(`[step 2] sendReward ok → sig=${tx.signature} mock=${tx.mock}`);

  // 3) Persist success
  const now = new Date();
  await db
    .update(claims)
    .set({
      status: "claimed_reward",
      claimedAt: now,
      claimTxHash: tx.signature,
      claimTxConfirmedAt: now,
      claimTxError: null,
      updatedAt: now,
    })
    .where(eq(claims.id, claim.id));

  await db
    .update(users)
    .set({
      totalRewardsEarnedUsd: sql`${users.totalRewardsEarnedUsd} + ${claim.rewardAmountUsd ?? 0}`,
      totalBountiesCompleted: sql`${users.totalBountiesCompleted} + 1`,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await db
    .update(bounties)
    .set({
      claimedHuntersCount: sql`${bounties.claimedHuntersCount} + 1`,
      updatedAt: now,
    })
    .where(eq(bounties.id, claim.bountyId));

  const rewardAmount = Number(claim.rewardAmount);
  const rewardAmountUsd = claim.rewardAmountUsd
    ? Number(claim.rewardAmountUsd)
    : 0;
  const feeAmount = (rewardAmount * PLATFORM_FEE_BPS) / 10_000;
  const feeAmountUsd = (rewardAmountUsd * PLATFORM_FEE_BPS) / 10_000;
  if (feeAmount > 0) {
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
  console.log(`[step 3] persisted; fee=${feeAmount} ${claim.rewardTokenSymbol}`);

  await sqlClient.end({ timeout: 5 });
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
