import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bounties, claims, tokens, users } from "@/lib/db/schema";
import type { BountyStatus, ClaimStatus } from "@/types/database";

/**
 * One-shot fetch for the Claim-Center profile page.
 *
 * Returns four lists (toClaim, hunting, created, history) + a stats
 * block ready to drop into the hero + stat cards. All queries are
 * keyed off `user.id` so the server component just hands `handle` in
 * and gets a typed payload back.
 *
 * Read-only — never writes. Performance budget: ~5-6 small queries
 * against indexed columns. For users with >100 history rows we cap
 * History at 50 and surface pagination later if needed.
 */

const HUNT_IN_PROGRESS: ClaimStatus[] = [
  "awaiting_action",
  "action_claimed",
  "initial_verified",
  "awaiting_final",
];
const HUNT_TERMINAL: ClaimStatus[] = [
  "claimed_reward",
  "failed",
  "expired",
  "cancelled",
];
const CREATED_VISIBLE: BountyStatus[] = [
  "active",
  "finalizing",
  "completed",
  "paused",
];

export type ProfileToClaimRow = {
  claimId: string;
  chain: string;
  bountySlug: string;
  bountyTitle: string;
  creatorHandle: string;
  rewardAmount: number;
  rewardTokenSymbol: string;
  rewardTokenLogoUrl: string | null;
  rewardUsd: number | null;
  finalVerifiedAt: Date | null;
};

export type ProfileHuntingRow = {
  claimId: string;
  bountySlug: string;
  bountyTitle: string;
  creatorHandle: string;
  rewardAmount: number;
  rewardTokenSymbol: string;
  rewardTokenLogoUrl: string | null;
  rewardUsd: number | null;
  claimStatus: ClaimStatus;
  bountyEndsAt: Date;
  finalCheckScheduledAt: Date | null;
};

export type ProfileCreatedRow = {
  bountyId: string;
  bountySlug: string;
  bountyTitle: string;
  bountyStatus: BountyStatus;
  rewardTokenSymbol: string;
  rewardTokenLogoUrl: string | null;
  totalPool: number;
  totalPoolUsd: number | null;
  maxHunters: number;
  claimedHuntersCount: number;
  refundedAmount: number | null;
  endsAt: Date;
  createdAt: Date;
};

export type ProfileHistoryRow = {
  claimId: string;
  bountySlug: string;
  bountyTitle: string;
  rewardAmount: number;
  rewardTokenSymbol: string;
  rewardTokenLogoUrl: string | null;
  rewardUsd: number | null;
  status: ClaimStatus;
  claimedAt: Date | null;
  failedAt: Date | null;
  expiredAt: Date | null;
  failureReason: string | null;
  /** When `status === "failed"`, this tells the UI WHY. Treated
   *  specially for `not_selected_lottery` — those rows are "you
   *  weren't picked", not "your actions failed", and shouldn't get
   *  the alarming red "Failed" badge. */
  failureCategory: string | null;
  claimTxHash: string | null;
  updatedAt: Date;
};

export type ProfileStats = {
  pendingTotalUsd: number;
  pendingCount: number;
  huntingCount: number;
  createdCount: number;
  historyCount: number;
  totalEarnedUsd: number;
  bountiesDoneCount: number;
};

export type ProfileData = {
  user: typeof users.$inferSelect;
  toClaim: ProfileToClaimRow[];
  hunting: ProfileHuntingRow[];
  created: ProfileCreatedRow[];
  history: ProfileHistoryRow[];
  stats: ProfileStats;
};

export async function getProfileData(
  handle: string,
): Promise<ProfileData | null> {
  const db = getDb();
  const normalizedHandle = handle.replace(/^@/, "").toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.handle}) = ${normalizedHandle}`)
    .limit(1);
  if (!user) return null;

  /* ---- Lists ------------------------------------------------------- */
  const toClaim = await db
    .select({
      claimId: claims.id,
      chain: claims.chain,
      bountySlug: bounties.slug,
      bountyTitle: bounties.tweetCachedData,
      creatorHandle: users.handle,
      rewardAmount: claims.rewardAmount,
      rewardTokenSymbol: claims.rewardTokenSymbol,
      rewardTokenLogoUrl: tokens.logoUrl,
      rewardTokenPriceUsd: tokens.jupiterPriceUsd,
      finalVerifiedAt: claims.finalVerifiedAt,
    })
    .from(claims)
    .innerJoin(bounties, eq(bounties.id, claims.bountyId))
    .leftJoin(users, eq(users.id, bounties.creatorUserId))
    .leftJoin(
      tokens,
      and(
        eq(tokens.chain, claims.chain),
        eq(tokens.mint, claims.rewardTokenMint),
      ),
    )
    .where(
      and(eq(claims.hunterUserId, user.id), eq(claims.status, "verified")),
    )
    .orderBy(desc(claims.finalVerifiedAt));

  const hunting = await db
    .select({
      claimId: claims.id,
      bountySlug: bounties.slug,
      bountyTitle: bounties.tweetCachedData,
      creatorHandle: users.handle,
      rewardAmount: claims.rewardAmount,
      rewardTokenSymbol: claims.rewardTokenSymbol,
      rewardTokenLogoUrl: tokens.logoUrl,
      rewardTokenPriceUsd: tokens.jupiterPriceUsd,
      claimStatus: claims.status,
      bountyEndsAt: bounties.endsAt,
      finalCheckScheduledAt: claims.finalCheckScheduledAt,
    })
    .from(claims)
    .innerJoin(bounties, eq(bounties.id, claims.bountyId))
    .leftJoin(users, eq(users.id, bounties.creatorUserId))
    .leftJoin(tokens, eq(tokens.mint, claims.rewardTokenMint))
    .where(
      and(
        eq(claims.hunterUserId, user.id),
        inArray(claims.status, HUNT_IN_PROGRESS),
      ),
    )
    .orderBy(asc(bounties.endsAt));

  const created = await db
    .select({
      bountyId: bounties.id,
      bountySlug: bounties.slug,
      bountyTitle: bounties.tweetCachedData,
      bountyStatus: bounties.status,
      rewardTokenSymbol: bounties.rewardTokenSymbol,
      rewardTokenLogoUrl: tokens.logoUrl,
      totalPool: bounties.totalPool,
      totalPoolUsd: bounties.totalPoolUsd,
      maxHunters: bounties.maxHunters,
      claimedHuntersCount: bounties.claimedHuntersCount,
      refundedAmount: bounties.refundedAmount,
      endsAt: bounties.endsAt,
      createdAt: bounties.createdAt,
    })
    .from(bounties)
    .leftJoin(tokens, eq(tokens.mint, bounties.rewardTokenMint))
    .where(
      and(
        eq(bounties.creatorUserId, user.id),
        inArray(bounties.status, CREATED_VISIBLE),
      ),
    )
    .orderBy(desc(bounties.createdAt));

  const history = await db
    .select({
      claimId: claims.id,
      bountySlug: bounties.slug,
      bountyTitle: bounties.tweetCachedData,
      rewardAmount: claims.rewardAmount,
      rewardTokenSymbol: claims.rewardTokenSymbol,
      rewardTokenLogoUrl: tokens.logoUrl,
      rewardTokenPriceUsd: tokens.jupiterPriceUsd,
      status: claims.status,
      claimedAt: claims.claimedAt,
      failedAt: claims.failedAt,
      expiredAt: claims.expiredAt,
      failureReason: claims.failureReason,
      failureCategory: claims.failureCategory,
      claimTxHash: claims.claimTxHash,
      updatedAt: claims.updatedAt,
    })
    .from(claims)
    .innerJoin(bounties, eq(bounties.id, claims.bountyId))
    .leftJoin(tokens, eq(tokens.mint, claims.rewardTokenMint))
    .where(
      and(
        eq(claims.hunterUserId, user.id),
        inArray(claims.status, HUNT_TERMINAL),
      ),
    )
    .orderBy(desc(claims.updatedAt))
    .limit(50);

  /* ---- Stats ------------------------------------------------------- */
  // Lifetime earnings: USD-priced sum over claimed_reward rows. We
  // compute from claims rather than reading `users.totalRewardsEarnedUsd`
  // because that counter can drift if a recovery cron writes after the
  // route handler. Source of truth = the claim rows themselves.
  const [earnedAgg] = await db
    .select({
      totalUsd: sql<string>`COALESCE(SUM(${claims.rewardAmountUsd}), 0)`,
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(claims)
    .where(
      and(
        eq(claims.hunterUserId, user.id),
        eq(claims.status, "claimed_reward"),
      ),
    );

  return {
    user,
    toClaim: toClaim.map((r) => ({
      claimId: r.claimId,
      chain: r.chain,
      bountySlug: r.bountySlug,
      bountyTitle: extractTitle(r.bountyTitle),
      creatorHandle: r.creatorHandle ?? "(unknown)",
      rewardAmount: Number(r.rewardAmount),
      rewardTokenSymbol: r.rewardTokenSymbol,
      rewardTokenLogoUrl: r.rewardTokenLogoUrl,
      rewardUsd: rewardUsd(r.rewardAmount, r.rewardTokenPriceUsd),
      finalVerifiedAt: r.finalVerifiedAt,
    })),
    hunting: hunting.map((r) => ({
      claimId: r.claimId,
      bountySlug: r.bountySlug,
      bountyTitle: extractTitle(r.bountyTitle),
      creatorHandle: r.creatorHandle ?? "(unknown)",
      rewardAmount: Number(r.rewardAmount),
      rewardTokenSymbol: r.rewardTokenSymbol,
      rewardTokenLogoUrl: r.rewardTokenLogoUrl,
      rewardUsd: rewardUsd(r.rewardAmount, r.rewardTokenPriceUsd),
      claimStatus: r.claimStatus as ClaimStatus,
      bountyEndsAt: r.bountyEndsAt,
      finalCheckScheduledAt: r.finalCheckScheduledAt,
    })),
    created: created.map((r) => ({
      bountyId: r.bountyId,
      bountySlug: r.bountySlug,
      bountyTitle: extractTitle(r.bountyTitle),
      bountyStatus: r.bountyStatus as BountyStatus,
      rewardTokenSymbol: r.rewardTokenSymbol,
      rewardTokenLogoUrl: r.rewardTokenLogoUrl,
      totalPool: Number(r.totalPool),
      totalPoolUsd: r.totalPoolUsd ? Number(r.totalPoolUsd) : null,
      maxHunters: r.maxHunters,
      claimedHuntersCount: r.claimedHuntersCount,
      refundedAmount: r.refundedAmount ? Number(r.refundedAmount) : null,
      endsAt: r.endsAt,
      createdAt: r.createdAt,
    })),
    history: history.map((r) => ({
      claimId: r.claimId,
      bountySlug: r.bountySlug,
      bountyTitle: extractTitle(r.bountyTitle),
      rewardAmount: Number(r.rewardAmount),
      rewardTokenSymbol: r.rewardTokenSymbol,
      rewardTokenLogoUrl: r.rewardTokenLogoUrl,
      rewardUsd: rewardUsd(r.rewardAmount, r.rewardTokenPriceUsd),
      status: r.status as ClaimStatus,
      claimedAt: r.claimedAt,
      failedAt: r.failedAt,
      expiredAt: r.expiredAt,
      failureReason: r.failureReason,
      failureCategory: r.failureCategory,
      claimTxHash: r.claimTxHash,
      updatedAt: r.updatedAt,
    })),
    stats: {
      pendingTotalUsd: toClaim.reduce(
        (sum, r) => sum + (rewardUsd(r.rewardAmount, r.rewardTokenPriceUsd) ?? 0),
        0,
      ),
      pendingCount: toClaim.length,
      huntingCount: hunting.length,
      createdCount: created.length,
      historyCount: history.length,
      totalEarnedUsd: Number(earnedAgg?.totalUsd ?? 0),
      bountiesDoneCount: Number(earnedAgg?.cnt ?? 0),
    },
  };
}

/* =========================================================================
   Helpers
   ========================================================================= */

/** Pull the tweet text out of the cached JSONB blob. Falls back to a
 *  short placeholder so list rows don't render empty. */
function extractTitle(cached: unknown): string {
  if (!cached || typeof cached !== "object") return "Untitled bounty";
  const text = (cached as { text?: string }).text;
  if (!text) return "Untitled bounty";
  return text.length > 80 ? text.slice(0, 77) + "…" : text;
}

function rewardUsd(
  rewardAmount: string | number,
  priceUsd: string | number | null,
): number | null {
  if (priceUsd == null) return null;
  const p = Number(priceUsd);
  if (!Number.isFinite(p) || p <= 0) return null;
  return Number(rewardAmount) * p;
}
