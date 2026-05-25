/**
 * Claim queries — user history, bounty rosters, and cron worker batches.
 */
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { claims, users } from "@/lib/db/schema";
import type { Claim, ClaimStatus } from "@/types/database";

/* =========================================================================
   Single-claim lookup — used on the bounty detail page to decide what
   state the current user is in.
   ========================================================================= */

export async function getClaimForBountyAndUser(
  bountyId: string,
  userId: string,
): Promise<Claim | null> {
  const [row] = await getDb()
    .select()
    .from(claims)
    .where(and(eq(claims.bountyId, bountyId), eq(claims.hunterUserId, userId)))
    .limit(1);
  return row ?? null;
}

/* =========================================================================
   Hunter roster — recent claims for a bounty, joined with hunter user
   data so the UI can render rows without a second fetch.
   ========================================================================= */

export type HunterRow = {
  id: string;
  status: ClaimStatus;
  /** Why a `failed` claim failed. The bounty detail UI uses this to
   *  draw lottery losers (`not_selected_lottery`) as a distinct
   *  "didn't get drawn" pill instead of the red "Failed" pill. */
  failureCategory: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  finalVerifiedAt: Date | null;
  rewardAmount: string;
  rewardTokenSymbol: string;
  hunter: {
    id: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    accountTier: string;
  };
};

const VISIBLE_STATUSES: ClaimStatus[] = [
  "claimed_reward",
  "verified",
  "awaiting_final",
  "initial_verified",
  "action_claimed",
  "failed",
];

export async function getBountyHunters(
  bountyId: string,
  opts: { limit?: number; statuses?: ClaimStatus[] } = {},
): Promise<HunterRow[]> {
  const limit = opts.limit ?? 20;
  const statuses = opts.statuses ?? VISIBLE_STATUSES;

  const rows = await getDb()
    .select({
      id: claims.id,
      status: claims.status,
      failureCategory: claims.failureCategory,
      createdAt: claims.createdAt,
      claimedAt: claims.claimedAt,
      finalVerifiedAt: claims.finalVerifiedAt,
      rewardAmount: claims.rewardAmount,
      rewardTokenSymbol: claims.rewardTokenSymbol,
      hunter: {
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        accountTier: users.accountTier,
      },
    })
    .from(claims)
    .innerJoin(users, eq(claims.hunterUserId, users.id))
    .where(
      and(
        eq(claims.bountyId, bountyId),
        inArray(claims.status, statuses),
      ),
    )
    .orderBy(desc(claims.createdAt))
    .limit(limit);

  return rows as HunterRow[];
}

/* =========================================================================
   Phase 2 stubs kept so Phase 6/7/8 callsites compile while their
   implementations are pending.
   ========================================================================= */

export async function getUserClaims(
  _userId: string,
  _status?: ClaimStatus | ClaimStatus[],
): Promise<Claim[]> {
  // TODO(phase-7): user history feed, ordered by createdAt desc.
  throw new Error("Not implemented");
}

export async function getBountyClaims(
  _bountyId: string,
  _status?: ClaimStatus | ClaimStatus[],
): Promise<Claim[]> {
  // TODO(phase-6): creator-side roster for a single bounty.
  throw new Error("Not implemented");
}

export async function getPendingFinalChecks(
  _now: Date,
  _limit: number,
): Promise<Claim[]> {
  // TODO(phase-8): finalCheckScheduledAt <= now AND status='awaiting_final'.
  throw new Error("Not implemented");
}

export async function getExpiringClaimWindows(
  _now: Date,
  _limit: number,
): Promise<Claim[]> {
  // TODO(phase-8): status='verified' AND claimWindowEndsAt <= now.
  throw new Error("Not implemented");
}

export async function getAbandonedClaims(
  _now: Date,
  _olderThanMinutes: number,
  _limit: number,
): Promise<Claim[]> {
  // TODO(phase-8): status='action_claimed' AND actionClaimedAt older than threshold.
  throw new Error("Not implemented");
}
