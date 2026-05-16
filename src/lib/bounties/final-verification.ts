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

const CLAIM_WINDOW_HOURS = 48;

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

  for (const claim of pending) {
    try {
      const outcome = await finalVerifyClaim(claim, bounty);
      if (outcome === "verified") newlyVerified += 1;
      else if (outcome === "failed") newlyFailed += 1;
    } catch (err) {
      // Don't crash the whole batch on one bad claim — log + move on.
      console.error(
        `[final-verification] claim=${claim.id} threw:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    bountyId,
    totalProcessed: pending.length,
    newlyVerified,
    newlyFailed,
  };
}

async function finalVerifyClaim(
  claim: Claim,
  bounty: Bounty,
): Promise<"verified" | "failed" | "skipped"> {
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
    const claimWindowEndsAt = new Date(
      now.getTime() + CLAIM_WINDOW_HOURS * 3_600_000,
    );
    await db
      .update(claims)
      .set({
        status: "verified",
        finalVerifiedAt: now,
        finalCheckAttemptedAt: now,
        claimWindowEndsAt,
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
