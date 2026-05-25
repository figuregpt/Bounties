import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  bounties,
  claims,
  notifications,
  users,
} from "@/lib/db/schema";
import { publishEvent } from "@/lib/realtime/publisher";
import { recordActivity } from "@/lib/realtime/activity";
import { verifyClaimLayer1 } from "./verify-claim";
import { checkTweetExists } from "@/lib/twitter/oembed";
import type { Bounty, Claim } from "@/types/database";

/**
 * Final verification — runs once a bounty's deadline passes.
 *
 * For every claim in `initial_verified`, we re-check the same actions
 * against twitterapi.io (with cache bypassed) to make sure the hunter
 * didn't undo their action right before the deadline. Claims that still
 * pass move to `verified` and a 48h claim window opens; failures
 * transition to `failed` with category `action_withdrawn`.
 *
 * Called by the bounty-completion cron (every 60s); not user-triggered.
 */

export type FinalVerificationSummary = {
  bountyId: string;
  totalProcessed: number;
  newlyVerified: number;
  newlyFailed: number;
};

export async function runFinalVerification(
  bountyId: string,
): Promise<FinalVerificationSummary> {
  const db = getDb();

  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.id, bountyId))
    .limit(1);
  if (!bounty) {
    return {
      bountyId,
      totalProcessed: 0,
      newlyVerified: 0,
      newlyFailed: 0,
    };
  }

  // Phase 8 polish (F1): both `initial_verified` and `awaiting_final`
  // are eligible — they differ only semantically (see state-machine.ts
  // for the distinction). Filtering on the former alone strands claims
  // whose status got bumped to `awaiting_final` by the worker.
  const pending = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.bountyId, bountyId),
        inArray(claims.status, ["initial_verified", "awaiting_final"]),
      ),
    );

  let newlyVerified = 0;
  let newlyFailed = 0;

  // For lottery bounties we DON'T flip Layer-2-passing claims to
  // `verified` during the per-claim loop — if we did, every passing
  // entrant would briefly look like a winner (claim-ready) for the
  // duration of the batch (minutes on a 150+ entrant bounty), and
  // anyone with the profile page open would see a Claim button that
  // can't actually fire. Instead we keep them in `initial_verified`
  // until the lottery resolves at the bottom, then promote only the
  // drawn winners atomically.
  const isLottery = bounty.distributionModel === "pool_lottery";

  for (const claim of pending) {
    try {
      const outcome = await finalVerifyClaim(claim, bounty, {
        deferVerifyPromotion: isLottery,
      });
      if (outcome === "verified") newlyVerified += 1;
      else if (outcome === "failed") newlyFailed += 1;
      // outcome === "deferred" → Layer 2 passed but waiting on lottery
    } catch (err) {
      // Don't crash the whole batch on one bad claim — log + move on.
      console.error(
        `[final-verification] claim=${claim.id} threw:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (isLottery) {
    const outcome = await resolveLottery(bounty);
    newlyVerified += outcome.winners;
    newlyFailed += outcome.losers;
  }

  return {
    bountyId,
    totalProcessed: pending.length,
    newlyVerified,
    newlyFailed,
  };
}

/**
 * Lottery resolution. Runs AFTER Layer 2 has filtered out claims that
 * withdrew their actions — those are already `failed/action_withdrawn`.
 * Whatever remains in `initial_verified` is the eligible pool: hunters
 * who joined and whose actions were still up at the deadline. We
 * shuffle that pool with crypto-random and split into winners + losers.
 *
 * Winners → status='verified' + finalVerifiedAt + "your reward is
 *           ready" notification + claim_verified event
 * Losers  → status='failed', category='not_selected_lottery'
 *
 * Two important invariants:
 *   1. The status transition only fires on rows still in
 *      `initial_verified` — so a concurrent re-run can't double-pick
 *      or accidentally demote a row that already resolved.
 *   2. The losers' UPDATE runs in one shot; winners get individual
 *      writes because the side-effect list per-winner (notification +
 *      pubsub) doesn't compose into a single SQL.
 */
async function resolveLottery(
  bounty: Bounty,
): Promise<{ winners: number; losers: number }> {
  const db = getDb();

  const eligible = await db
    .select({ id: claims.id, hunterUserId: claims.hunterUserId })
    .from(claims)
    .where(
      and(
        eq(claims.bountyId, bounty.id),
        eq(claims.status, "initial_verified"),
      ),
    );
  if (eligible.length === 0) return { winners: 0, losers: 0 };

  const shuffled = cryptoShuffle(
    eligible.map((r) => ({ id: r.id, hunterUserId: r.hunterUserId })),
  );
  const winnerSlice = shuffled.slice(0, bounty.maxHunters);
  const loserSlice = shuffled.slice(bounty.maxHunters);

  const now = new Date();

  /* ---- Winners: promote individually so we can fire per-row events */
  let winnerCount = 0;
  for (const w of winnerSlice) {
    const updated = await db
      .update(claims)
      .set({
        status: "verified",
        finalVerifiedAt: now,
        finalCheckAttemptedAt: now,
        claimWindowEndsAt: null,
        failureReason: null,
        failureCategory: null,
        updatedAt: now,
      })
      .where(
        and(eq(claims.id, w.id), eq(claims.status, "initial_verified")),
      )
      .returning({ id: claims.id });
    if (updated.length === 0) continue;
    winnerCount += 1;

    await db.insert(notifications).values({
      userId: w.hunterUserId,
      type: "claim_ready_to_claim",
      title: "You won the bounty draw",
      body: `Claim your reward — you were one of ${bounty.maxHunters} winners`,
      linkUrl: `/bounties/${bounty.slug}`,
      relatedBountyId: bounty.id,
      relatedClaimId: w.id,
    });
    publishEvent(`user-${w.hunterUserId}`, "claim_verified", {
      claimId: w.id,
      bountyId: bounty.id,
      status: "verified",
    });
    void recordActivity({
      type: "claim_verified",
      actorUserId: w.hunterUserId,
      bountyId: bounty.id,
      claimId: w.id,
    });
  }

  /* ---- Losers: single batch UPDATE */
  let loserCount = 0;
  if (loserSlice.length > 0) {
    const demoted = await db
      .update(claims)
      .set({
        status: "failed",
        failureCategory: "not_selected_lottery",
        failureReason:
          "Bounty drew a random winner set; you weren't selected.",
        failedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(
            claims.id,
            loserSlice.map((l) => l.id),
          ),
          eq(claims.status, "initial_verified"),
        ),
      )
      .returning({ id: claims.id });
    loserCount = demoted.length;
  }

  return { winners: winnerCount, losers: loserCount };
}

/**
 * Fisher–Yates shuffle using `crypto.getRandomValues` so the draw is
 * unpredictable and uniform. We don't care about determinism — each
 * cron pass that reaches this code shuffles fresh on a frozen
 * participant list, and the atomic `eq(status, 'verified')` predicate
 * keeps a re-run from re-shuffling already-decided rows.
 */
function cryptoShuffle<T>(input: readonly T[]): T[] {
  const out = [...input];
  const rand = new Uint32Array(out.length);
  globalThis.crypto.getRandomValues(rand);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function finalVerifyClaim(
  claim: Claim,
  bounty: Bounty,
  opts?: {
    /** Lottery mode. When true, a passing Layer 2 check does NOT
     *  promote the claim to `verified` — the row stays in
     *  `initial_verified` until `resolveLottery` runs at the end of
     *  the cron batch and atomically picks the winners. This is the
     *  only way to keep losers from briefly appearing claimable
     *  while the per-claim loop is still working through the pool. */
    deferVerifyPromotion?: boolean;
  },
): Promise<"verified" | "failed" | "skipped" | "deferred"> {
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, claim.hunterUserId))
    .limit(1);
  if (!user) return "skipped";

  // Phase 9A: oEmbed-based fast paths for reply / quote actions.
  //
  // Why: twitterapi.io's engagement cache lags real-time (we measured
  // 10+ min staleness after a deletion in dev). Twitter's own oEmbed
  // endpoint returns 404 instantly for deleted tweets — no auth, no
  // API quota burn, and it's ground truth (Twitter is checking
  // Twitter). We use it as a cheap pre-flight:
  //
  //   • If any required reply/quote tweet ID returns 404 → claim
  //     fails immediately as `action_withdrawn`. Zero twitterapi.io
  //     spend on the dominant withdrawal case.
  //   • If oEmbed returns 200 for everything AND the bounty only
  //     requires reply/quote (no retweet/follow), short-circuit pass.
  //   • If `unknown` (rate-limit / transient) OR there are other
  //     actions oEmbed can't cover, fall through to twitterapi.io.
  const oembedFail = await checkOembedDeletions(claim, bounty);
  if (oembedFail) {
    return await failClaim(claim, bounty, user, oembedFail);
  }

  // Phase 8 polish (F2): forceRecheck so we don't trust the persisted
  // *Verified booleans — the whole point of final verification is
  // detecting actions that were withdrawn after Layer 1/2 passed.
  const result = await verifyClaimLayer1(claim, bounty, user, {
    bypassCache: true,
    // Withdrawal detection: must re-check pages we already walked
    // (deleted replies vanish from old pages with no nextCursor signal).
    restartCursor: true,
    forceRecheck: true,
  });

  const now = new Date();

  if (result.allPassed) {
    // Lottery mode: persist the patch (boolean flips, finalCheck
    // timestamp) but don't promote to `verified` yet. The lottery
    // resolver handles status + notification + events for winners.
    if (opts?.deferVerifyPromotion) {
      await db
        .update(claims)
        .set({
          ...result.patch,
          finalCheckAttemptedAt: now,
          updatedAt: now,
        })
        .where(eq(claims.id, claim.id));
      return "deferred";
    }
    await db
      .update(claims)
      .set({
        status: "verified",
        finalVerifiedAt: now,
        finalCheckAttemptedAt: now,
        // Claim stays claimable indefinitely — no window expiry.
        claimWindowEndsAt: null,
        // F2 side-effect: persist any boolean flips the recheck made
        // (e.g. a missing replyText is now populated from the fresh fetch).
        ...result.patch,
        // Clear any stale failure from a prior transient attempt.
        failureReason: null,
        failureCategory: null,
        updatedAt: now,
      })
      .where(eq(claims.id, claim.id));

    await db.insert(notifications).values({
      userId: user.id,
      type: "claim_ready_to_claim",
      title: "Your reward is ready",
      body: `Claim ${claim.rewardAmount} ${claim.rewardTokenSymbol} from your hunt`,
      linkUrl: `/bounties/${bounty.slug}`,
      relatedBountyId: bounty.id,
      relatedClaimId: claim.id,
    });

    publishEvent(`user-${user.id}`, "claim_verified", {
      claimId: claim.id,
      bountyId: bounty.id,
      status: "verified",
    });
    void recordActivity({
      type: "claim_verified",
      actorUserId: claim.hunterUserId,
      bountyId: bounty.id,
      claimId: claim.id,
    });
    return "verified";
  }

  // Failed at final check — most often because the hunter undid their
  // reply / unfollowed between initial and final verification.
  return await failClaim(claim, bounty, user, {
    reason: result.primaryFailure?.reason ?? "Action could not be re-verified",
    patch: result.patch,
  });
}

/* =========================================================================
   Shared failure helper — used by both the oEmbed fast-path and the
   twitterapi.io fallback. Single source of truth for "what does it mean
   to fail a claim at final check": claim row update, slot release,
   notification, realtime publish.
   ========================================================================= */
async function failClaim(
  claim: Claim,
  bounty: Bounty,
  user: typeof users.$inferSelect,
  args: {
    reason: string;
    patch?: Partial<Claim>;
  },
): Promise<"failed"> {
  const db = getDb();
  const now = new Date();

  await db
    .update(claims)
    .set({
      status: "failed",
      failureReason: args.reason,
      failureCategory: "action_withdrawn",
      failedAt: now,
      finalCheckAttemptedAt: now,
      ...(args.patch ?? {}),
      updatedAt: now,
    })
    .where(eq(claims.id, claim.id));

  await db
    .update(bounties)
    .set({
      currentHuntersCount: sql`GREATEST(${bounties.currentHuntersCount} - 1, 0)`,
      pendingHuntersCount: sql`GREATEST(${bounties.pendingHuntersCount} - 1, 0)`,
      failedHuntersCount: sql`${bounties.failedHuntersCount} + 1`,
      updatedAt: now,
    })
    .where(eq(bounties.id, bounty.id));

  await db.insert(notifications).values({
    userId: user.id,
    type: "claim_failed",
    title: "Final verification failed",
    body: `${args.reason}. You can't claim this bounty's reward.`,
    linkUrl: `/bounties/${bounty.slug}`,
    relatedBountyId: bounty.id,
    relatedClaimId: claim.id,
  });

  publishEvent(`user-${user.id}`, "claim_failed", {
    claimId: claim.id,
    bountyId: bounty.id,
    status: "failed",
  });
  return "failed";
}

/* =========================================================================
   oEmbed deletion pre-flight
   ========================================================================= */

/**
 * Cheap, auth-less deletion check for actions whose tweet ID we have
 * stored on the claim row. Hits Twitter's own oEmbed endpoint — 404
 * means the tweet (and therefore the engagement) is gone.
 *
 * Returns a failure descriptor when at least one required action's
 * tweet is confirmed deleted; returns null otherwise (caller proceeds
 * to twitterapi.io). `unknown` responses fall through to twitterapi.io
 * so a transient Twitter outage never fails a claim.
 */
async function checkOembedDeletions(
  claim: Claim,
  bounty: Bounty,
): Promise<{ reason: string; patch?: Partial<Claim> } | null> {
  const probes: Array<{
    action: "reply" | "quote";
    tweetId: string;
  }> = [];
  if (bounty.requiresReply && claim.replyTweetId) {
    probes.push({ action: "reply", tweetId: claim.replyTweetId });
  }
  if (bounty.requiresQuote && claim.quoteTweetId) {
    probes.push({ action: "quote", tweetId: claim.quoteTweetId });
  }
  if (probes.length === 0) return null;

  const results = await Promise.all(
    probes.map(async (p) => ({
      ...p,
      status: await checkTweetExists(p.tweetId),
    })),
  );
  const deleted = results.find((r) => r.status === "deleted");
  if (!deleted) return null;

  // Persist the boolean flip so the audit trail reflects what we saw.
  const patch: Partial<Claim> =
    deleted.action === "reply"
      ? { replyVerified: false }
      : { quoteVerified: false };

  return {
    reason:
      deleted.action === "reply"
        ? "Your reply was deleted before the final check"
        : "Your quote tweet was deleted before the final check",
    patch,
  };
}
