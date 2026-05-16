import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bounties, claims } from "@/lib/db/schema";
import {
  getCachedEngagers,
  type CachedEngager,
} from "@/lib/twitter/engager-cache";
import { checkFollowRelationship } from "@/lib/twitter/client";
import { publishEvent } from "@/lib/realtime/publisher";
import { recordActivity } from "@/lib/realtime/activity";
import {
  verifyTextAction,
  type TextActionRuleFailure,
} from "./verify-reply";
import type {
  Bounty,
  Claim,
  ClaimFailureCategory,
  User,
} from "@/types/database";

/**
 * Layer-1 verification: on-demand REST checks for every required
 * action on a claim. Called when the user clicks "I've completed all
 * actions" in the hunt overlay.
 *
 * Returns one structured result per action so the UI can mark each
 * checklist row pass/fail individually. The caller (route handler)
 * then transitions the claim into `initial_verified` or `failed`.
 *
 * Layer 2 (WebSocket) writes the same `*_verified` columns when it
 * sees reply/quote events ahead of time, so this function only runs
 * checks for actions that haven't been verified yet — both layers
 * compose into a single state.
 */

export type ActionVerification =
  | {
      action: "retweet" | "reply" | "quote" | "follow";
      passed: true;
      details?: Record<string, unknown>;
    }
  | {
      action: "retweet" | "reply" | "quote" | "follow";
      passed: false;
      failureReason: string;
      failureCategory: ClaimFailureCategory;
      /** Concrete fix-it copy for the hunt overlay
       *  ("Edit your reply to include the required keyword, then retry"). */
      userActionRequired?: string;
      details?: Record<string, unknown>;
    };

export type ClaimVerificationResult = {
  allPassed: boolean;
  results: ActionVerification[];
  /** Aggregated denormalized fields, ready to persist on the claim row. */
  patch: {
    retweetVerified?: boolean;
    replyVerified?: boolean;
    quoteVerified?: boolean;
    followVerified?: boolean;
    replyTweetId?: string | null;
    replyText?: string | null;
    quoteTweetId?: string | null;
    quoteText?: string | null;
  };
  primaryFailure?: {
    reason: string;
    category: ClaimFailureCategory;
    userActionRequired?: string;
    details?: Record<string, unknown>;
  };
};

export async function verifyClaimLayer1(
  claim: Claim,
  bounty: Bounty,
  user: User,
  opts: {
    bypassCache?: boolean;
    restartCursor?: boolean;
    forceRecheck?: boolean;
  } = {},
): Promise<ClaimVerificationResult> {
  const results: ActionVerification[] = [];
  const patch: ClaimVerificationResult["patch"] = {};
  const ctx = {
    bountyId: bounty.id,
    claimId: claim.id,
    userId: user.id,
  };
  // On retry: skip the engager-cache freshness early-exit so we
  // actually walk for new content (the hunter probably just did the
  // action). Cursor stays where it was — we resume from after the
  // last walked page rather than re-fetching pages 1..N from scratch.
  //
  // Final verification passes both `bypassCache: true` and
  // `restartCursor: true` (Phase 8) because withdrawal detection
  // requires re-checking already-walked pages for the user's absence.
  const bypassCache = opts.bypassCache ?? claim.verificationAttempts > 0;
  const restartCursor = opts.restartCursor ?? false;
  // F2: final verification must NOT trust persisted *Verified booleans —
  // the whole point is to detect a hunter who unretweets/deletes/unfollows
  // between initial and final check. Initial verification leaves
  // forceRecheck unset so Layer 2's already-verified actions short-circuit.
  const forceRecheck = opts.forceRecheck ?? false;

  /* ---- Retweet ---------------------------------------------------- */
  if (bounty.requiresRetweet && (!claim.retweetVerified || forceRecheck)) {
    const result = await verifyRetweet(
      bounty.tweetId,
      user.twitterId,
      ctx,
      bypassCache,
      restartCursor,
    );
    results.push(result);
    if (result.passed) patch.retweetVerified = true;
    else patch.retweetVerified = false;
  } else if (bounty.requiresRetweet) {
    // Layer 2 (or a prior Layer 1 run) already verified this.
    results.push({ action: "retweet", passed: true });
  }

  /* ---- Reply ------------------------------------------------------ */
  if (bounty.requiresReply && (!claim.replyVerified || forceRecheck)) {
    const result = await verifyReply(bounty, user.twitterId, ctx, bypassCache, restartCursor);
    results.push(result);
    if (result.passed) {
      patch.replyVerified = true;
      const d = result.details as
        | { foundReplyId?: string; foundReplyText?: string }
        | undefined;
      patch.replyTweetId = d?.foundReplyId ?? null;
      patch.replyText = d?.foundReplyText ?? null;
    } else {
      patch.replyVerified = false;
    }
  } else if (bounty.requiresReply) {
    results.push({ action: "reply", passed: true });
  }

  /* ---- Quote ------------------------------------------------------ */
  if (bounty.requiresQuote && (!claim.quoteVerified || forceRecheck)) {
    const result = await verifyQuote(bounty, user.twitterId, ctx, bypassCache, restartCursor);
    results.push(result);
    if (result.passed) {
      patch.quoteVerified = true;
      const d = result.details as
        | { foundQuoteId?: string; foundQuoteText?: string }
        | undefined;
      patch.quoteTweetId = d?.foundQuoteId ?? null;
      patch.quoteText = d?.foundQuoteText ?? null;
    } else {
      patch.quoteVerified = false;
    }
  } else if (bounty.requiresQuote) {
    results.push({ action: "quote", passed: true });
  }

  /* ---- Follow ----------------------------------------------------- */
  if (
    bounty.requiresFollow &&
    bounty.followTargetHandle &&
    (!claim.followVerified || forceRecheck)
  ) {
    const result = await verifyFollow(
      user.twitterHandle,
      bounty.followTargetHandle,
      ctx,
    );
    results.push(result);
    if (result.passed) patch.followVerified = true;
    else patch.followVerified = false;
  } else if (bounty.requiresFollow) {
    // Already verified on a prior pass; trust the stored boolean.
    results.push({ action: "follow", passed: true });
  }

  const allPassed = results.every((r) => r.passed);
  const firstFailure = results.find((r) => !r.passed);
  return {
    allPassed,
    results,
    patch,
    primaryFailure:
      firstFailure && !firstFailure.passed
        ? {
            reason: firstFailure.failureReason,
            category: firstFailure.failureCategory,
            userActionRequired: firstFailure.userActionRequired,
            details: firstFailure.details,
          }
        : undefined,
  };
}

/**
 * Persist the verification result on the claim row.
 *
 * Slot lifecycle (Phase 8.5+):
 *
 *   1. claim created (status=awaiting_action)        no slot held
 *   2. POST /verify-initial (1st attempt)            slot reserved
 *        — atomic UPDATE awaiting_action → action_claimed +
 *          currentHuntersCount++/pendingHuntersCount++
 *   3a. verify passes (action_claimed → initial_verified)
 *        — slot stays reserved, will be held through claim window
 *   3b. verify fails (action_claimed → failed)
 *        — slot freed: currentHuntersCount-- / pendingHuntersCount--
 *        — failureReason / failureCategory stamped on the row
 *   4. retry POST /verify-initial (claim.status='failed')
 *        — same atomic re-reserve as step 2 (failed → action_claimed)
 *        — if bounty filled in the meantime: 409, claim stays 'failed'
 *   5. cancel: slot freed only when one is held (action_claimed +)
 *   6. final check (cron): identical re-verify; failures free the
 *      slot and bump failedHuntersCount.
 *
 * Net invariant: `currentHuntersCount` ≈ number of claims actively
 * inside a verify call OR already verified, never inflated by failed
 * attempts sitting idle.
 */
export async function applyVerificationResult(
  claim: Claim,
  result: ClaimVerificationResult,
  verificationDetails: Record<string, unknown>,
): Promise<Claim> {
  const db = getDb();
  const now = new Date();

  if (result.allPassed) {
    // Phase 8: final check runs when the bounty ends, not 24h after the
    // hunter verifies. We need the bounty row to know its endsAt.
    const [bountyRow] = await db
      .select({ endsAt: bounties.endsAt })
      .from(bounties)
      .where(eq(bounties.id, claim.bountyId))
      .limit(1);
    const finalCheckScheduledAt = bountyRow?.endsAt ?? now;
    // Phase 9A defense #4: race-safe transition. Both Layer 1 (this
    // path) and Layer 2 (worker stream) can land on this claim; the
    // `inArray` predicate makes the flip idempotent — only rows still
    // in a pre-verification status transition. If we lost the race
    // (the other layer already wrote `initial_verified`), fall back to
    // re-reading the row so the caller sees the current state.
    const [updated] = await db
      .update(claims)
      .set({
        status: "initial_verified",
        initialVerifiedAt: now,
        finalCheckScheduledAt,
        verificationAttempts: sql`${claims.verificationAttempts} + 1`,
        lastVerificationAttemptAt: now,
        verificationDetails: verificationDetails as never,
        ...result.patch,
        failureReason: null,
        failureCategory: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(claims.id, claim.id),
          inArray(claims.status, ["awaiting_action", "action_claimed"]),
        ),
      )
      .returning();
    if (updated) {
      void recordActivity({
        type: "claim_verified",
        actorUserId: claim.hunterUserId,
        bountyId: claim.bountyId,
        claimId: claim.id,
      });
      return updated;
    }
    const [current] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, claim.id))
      .limit(1);
    return current ?? claim;
  }

  // Failure path: transition to `failed` + free the slot so other
  // hunters can take it while this user fixes their action on X. The
  // status flip is conditional on the row still being in
  // `action_claimed` (Layer 2 may have raced us to `initial_verified`;
  // we shouldn't trample that).
  const [updated] = await db
    .update(claims)
    .set({
      status: "failed",
      failedAt: now,
      failureReason: result.primaryFailure?.reason ?? "Verification failed",
      failureCategory: result.primaryFailure?.category ?? "other",
      verificationAttempts: sql`${claims.verificationAttempts} + 1`,
      lastVerificationAttemptAt: now,
      verificationDetails: verificationDetails as never,
      ...result.patch,
      updatedAt: now,
    })
    .where(and(eq(claims.id, claim.id), eq(claims.status, "action_claimed")))
    .returning();

  // Phase 8.5+: bounty.currentHuntersCount is computed-on-read in the
  // queries — we no longer maintain it as a denormalized counter. Just
  // publish so any open bounty-detail tab refreshes its data: failed
  // claims don't count toward the slot total, but they DO drop out of
  // the in-progress count, so the breakdown changes.
  if (updated) {
    publishEvent(`bounty-${claim.bountyId}`, "bounty_updated", {
      bountyId: claim.bountyId,
    });
  }

  // If the conditional UPDATE didn't return a row, the claim has
  // already moved past action_claimed (raced by Layer 2). Return the
  // current state instead of pretending we transitioned.
  if (!updated) {
    const [current] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, claim.id))
      .limit(1);
    return current ?? claim;
  }
  return updated;
}

/**
 * Terminal transition for a claim that's exhausted its retry budget.
 *
 * Post-Phase-8.5 the lifecycle already frees the slot on every transient
 * failure (see `applyVerificationResult`), so this only:
 *   • makes sure status is `failed` (already true after the last
 *     attempt's applyVerificationResult ran)
 *   • bumps the bounty's `failedHuntersCount` once — the route only
 *     calls this when verificationAttempts crosses MAX, so the +1 isn't
 *     double-counted.
 *
 * If somehow the claim is still in a slot-holding state (e.g. the
 * verifier threw before applyVerificationResult could run), this also
 * decrements the counters as a fallback.
 */
export async function markClaimPermanentlyFailed(
  claim: Claim,
  reason: string,
  category: ClaimFailureCategory,
): Promise<Claim> {
  const db = getDb();
  const now = new Date();

  const [updated] = await db
    .update(claims)
    .set({
      status: "failed",
      failedAt: now,
      failureReason: reason,
      failureCategory: category,
      updatedAt: now,
    })
    .where(eq(claims.id, claim.id))
    .returning();

  // Phase 8.5+: only the analytics-side `failedHuntersCount` is
  // maintained denormalized; `currentHuntersCount` / `pendingHuntersCount`
  // are computed-on-read so we don't touch them.
  await db
    .update(bounties)
    .set({
      failedHuntersCount: sql`${bounties.failedHuntersCount} + 1`,
      updatedAt: now,
    })
    .where(eq(bounties.id, claim.bountyId));
  publishEvent(`bounty-${claim.bountyId}`, "bounty_updated", {
    bountyId: claim.bountyId,
  });

  return updated;
}

/* =========================================================================
   Per-action checks
   ========================================================================= */

async function verifyRetweet(
  tweetId: string,
  userTwitterId: string,
  ctx: { bountyId: string; claimId: string; userId: string },
  bypassCache: boolean,
  restartCursor: boolean,
): Promise<ActionVerification> {
  try {
    const result = await getCachedEngagers(tweetId, "retweet", {
      targetTwitterId: userTwitterId,
      bypassCache,
      restartCursor,
      ctx,
    });
    if (matchesUser(result.engagers, userTwitterId)) {
      return { action: "retweet", passed: true };
    }
    if (result.hitPaginationLimit) {
      return {
        action: "retweet",
        passed: false,
        failureReason:
          "We couldn't paginate deep enough to confirm your retweet on this large tweet",
        failureCategory: "verification_limit_exceeded",
        userActionRequired:
          "The real-time stream will pick it up — wait a moment and refresh",
      };
    }
    return {
      action: "retweet",
      passed: false,
      failureReason: "We didn't find your retweet on this tweet",
      failureCategory: "retweet_not_done",
      userActionRequired: "Retweet the post on X, then try again",
    };
  } catch (err) {
    return {
      action: "retweet",
      passed: false,
      failureReason: errMsg(err, "Couldn't fetch retweeters", {
        ...ctx,
        action: "retweet",
      }),
      failureCategory: "internal_error",
      userActionRequired: "Wait a moment and try again",
    };
  }
}

async function verifyReply(
  bounty: Bounty,
  userTwitterId: string,
  ctx: { bountyId: string; claimId: string; userId: string },
  bypassCache: boolean,
  restartCursor: boolean,
): Promise<ActionVerification> {
  try {
    const result = await getCachedEngagers(bounty.tweetId, "reply", {
      targetTwitterId: userTwitterId,
      bypassCache,
      restartCursor,
      ctx,
    });
    const userReplies = result.engagers
      .filter((e) => e.twitterId === userTwitterId)
      .sort((a, b) =>
        // Most recent first if we have ids — twitter snowflakes are
        // monotonically increasing.
        (b.engagementTweetId ?? "").localeCompare(a.engagementTweetId ?? ""),
      );
    if (userReplies.length === 0) {
      if (result.hitPaginationLimit) {
        return {
          action: "reply",
          passed: false,
          failureReason:
            "We couldn't paginate deep enough to find your reply on this large thread",
          failureCategory: "verification_limit_exceeded",
          userActionRequired:
            "The real-time stream will pick it up — wait a moment and refresh",
        };
      }
      return {
        action: "reply",
        passed: false,
        failureReason: "We didn't find your reply on this tweet",
        failureCategory: "action_not_done",
        userActionRequired: "Post a reply to the tweet, then try again",
      };
    }
    const reply = userReplies[0];
    const replyText = reply.engagementText ?? "";
    const rules = bounty.actionConfig.reply.rules;
    const check = verifyTextAction(replyText, rules);
    if (!check.passed) {
      return mapTextActionFailure({
        action: "reply",
        failures: check.failures,
        foundId: reply.engagementTweetId ?? null,
        foundText: replyText,
      });
    }
    return {
      action: "reply",
      passed: true,
      details: {
        foundReplyId: reply.engagementTweetId,
        foundReplyText: replyText,
      },
    };
  } catch (err) {
    return {
      action: "reply",
      passed: false,
      failureReason: errMsg(err, "Couldn't fetch replies", {
        ...ctx,
        action: "reply",
      }),
      failureCategory: "internal_error",
      userActionRequired: "Wait a moment and try again",
    };
  }
}

async function verifyQuote(
  bounty: Bounty,
  userTwitterId: string,
  ctx: { bountyId: string; claimId: string; userId: string },
  bypassCache: boolean,
  restartCursor: boolean,
): Promise<ActionVerification> {
  try {
    const result = await getCachedEngagers(bounty.tweetId, "quote", {
      targetTwitterId: userTwitterId,
      bypassCache,
      restartCursor,
      ctx,
    });
    const userQuotes = result.engagers
      .filter((e) => e.twitterId === userTwitterId)
      .sort((a, b) =>
        (b.engagementTweetId ?? "").localeCompare(a.engagementTweetId ?? ""),
      );
    if (userQuotes.length === 0) {
      if (result.hitPaginationLimit) {
        return {
          action: "quote",
          passed: false,
          failureReason:
            "We couldn't paginate deep enough to find your quote on this large tweet",
          failureCategory: "verification_limit_exceeded",
          userActionRequired:
            "The real-time stream will pick it up — wait a moment and refresh",
        };
      }
      return {
        action: "quote",
        passed: false,
        failureReason: "We didn't find your quote of this tweet",
        failureCategory: "action_not_done",
        userActionRequired: "Quote the tweet on X, then try again",
      };
    }
    const quote = userQuotes[0];
    const quoteText = quote.engagementText ?? "";
    const rules = bounty.actionConfig.quote.rules;
    const check = verifyTextAction(quoteText, rules);
    if (!check.passed) {
      return mapTextActionFailure({
        action: "quote",
        failures: check.failures,
        foundId: quote.engagementTweetId ?? null,
        foundText: quoteText,
      });
    }
    return {
      action: "quote",
      passed: true,
      details: {
        foundQuoteId: quote.engagementTweetId,
        foundQuoteText: quoteText,
      },
    };
  } catch (err) {
    return {
      action: "quote",
      passed: false,
      failureReason: errMsg(err, "Couldn't fetch quotes", {
        ...ctx,
        action: "quote",
      }),
      failureCategory: "internal_error",
      userActionRequired: "Wait a moment and try again",
    };
  }
}

async function verifyFollow(
  userHandle: string,
  targetHandle: string,
  ctx: { bountyId: string; claimId: string; userId: string },
): Promise<ActionVerification> {
  try {
    const rel = await checkFollowRelationship(userHandle, targetHandle, { ctx });
    if (rel.following) {
      return { action: "follow", passed: true };
    }
    return {
      action: "follow",
      passed: false,
      failureReason: `You're not following @${targetHandle}`,
      failureCategory: "follow_not_active",
      userActionRequired: `Follow @${targetHandle} on X, then try again`,
    };
  } catch (err) {
    return {
      action: "follow",
      passed: false,
      failureReason: errMsg(err, "Couldn't check follow relationship", {
        ...ctx,
        action: "follow",
      }),
      failureCategory: "internal_error",
      userActionRequired: "Wait a moment and try again",
    };
  }
}

/**
 * Maps a structured text-action failure (missing keyword / forbidden /
 * too short) into the user-facing copy + the specific failure category
 * used by analytics. Failures earlier in the array win — `verifyTextAction`
 * orders them by check order so this lines up with what the user sees.
 */
function mapTextActionFailure(args: {
  action: "reply" | "quote";
  failures: TextActionRuleFailure[];
  foundId: string | null;
  foundText: string;
}): ActionVerification {
  const f = args.failures[0];
  const details =
    args.action === "reply"
      ? { foundReplyId: args.foundId, foundReplyText: args.foundText }
      : { foundQuoteId: args.foundId, foundQuoteText: args.foundText };
  if (!f) {
    return {
      action: args.action,
      passed: false,
      failureReason: `Your ${args.action} didn't pass the rule check`,
      failureCategory: "reply_rules_failed",
      userActionRequired: `Edit your ${args.action} and try again`,
      details,
    };
  }
  if (f.type === "missing_required_keyword") {
    const list = f.keywords.join(", ");
    return {
      action: args.action,
      passed: false,
      failureReason:
        f.keywords.length === 1
          ? `Your ${args.action} must include: ${list}`
          : `Your ${args.action} must include: ${list}`,
      failureCategory:
        args.action === "reply"
          ? "reply_missing_keyword"
          : "quote_missing_keyword",
      userActionRequired: `Edit your ${args.action} to include the required keyword${
        f.keywords.length > 1 ? "s" : ""
      }, then retry`,
      details,
    };
  }
  if (f.type === "forbidden_keyword") {
    return {
      action: args.action,
      passed: false,
      failureReason: `Your ${args.action} contains a forbidden word: ${f.foundWord}`,
      failureCategory:
        args.action === "reply"
          ? "reply_has_forbidden_keyword"
          : "quote_has_forbidden_keyword",
      userActionRequired: `Remove "${f.foundWord}" from your ${args.action} and edit it, then retry`,
      details,
    };
  }
  // too_short
  return {
    action: args.action,
    passed: false,
    failureReason: `Your ${args.action} is too short — needs at least ${f.minimum} ${f.unit}`,
    failureCategory:
      args.action === "reply" ? "reply_too_short" : "quote_too_short",
    userActionRequired: `Expand your ${args.action}, then retry`,
    details,
  };
}

/* =========================================================================
   Helpers
   ========================================================================= */

function matchesUser(engagers: CachedEngager[], userTwitterId: string) {
  return engagers.some((e) => e.twitterId === userTwitterId);
}

/**
 * User-facing error message for a caught throw inside a per-action
 * verifier. NEVER echoes `err.message` directly — drizzle wraps every
 * Postgres failure with "Failed query: <full SQL>... params: [...]"
 * and that ends up persisted on the claim row as `failureReason` and
 * rendered verbatim to the hunter.
 *
 * We log the raw error breadcrumb internally (concise — no full SQL)
 * and return the human fallback string to the caller.
 */
function errMsg(
  err: unknown,
  fallback: string,
  ctx: { bountyId: string; claimId: string; userId: string; action: string },
): string {
  const isError = err instanceof Error;
  console.error(`[verify-claim] ${ctx.action} threw (non-fatal):`, {
    bountyId: ctx.bountyId,
    claimId: ctx.claimId,
    userId: ctx.userId,
    errorCode: (err as { code?: string })?.code,
    errorName: isError ? err.name : "unknown",
    errorMessage: isError ? err.message.slice(0, 200) : "unknown",
  });
  return fallback;
}

/**
 * Layer 2 helper: when the worker observes a matching event, mark the
 * corresponding action as verified and — if all required actions are
 * now verified — flip the claim to `initial_verified`.
 *
 * Returns the updated claim row so the caller can push it through SSE.
 */
export async function markActionVerifiedFromStream(args: {
  claimId: string;
  action: "reply" | "quote";
  tweetId: string;
  text: string;
}): Promise<Claim | null> {
  const db = getDb();
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, args.claimId))
    .limit(1);
  if (!claim) return null;
  if (claim.status === "claimed_reward" || claim.status === "expired") {
    return claim;
  }

  const patch: Partial<Claim> = {};
  if (args.action === "reply" && !claim.replyVerified) {
    patch.replyVerified = true;
    patch.replyTweetId = args.tweetId;
    patch.replyText = args.text;
  } else if (args.action === "quote" && !claim.quoteVerified) {
    patch.quoteVerified = true;
    patch.quoteTweetId = args.tweetId;
    patch.quoteText = args.text;
  } else {
    return claim;
  }

  // Look up the bounty so we can decide whether everything's now verified.
  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.id, claim.bountyId))
    .limit(1);
  if (!bounty) return null;

  const verifiedAfterPatch = {
    retweet: claim.retweetVerified || !bounty.requiresRetweet,
    reply: patch.replyVerified ?? claim.replyVerified ?? !bounty.requiresReply,
    quote: patch.quoteVerified ?? claim.quoteVerified ?? !bounty.requiresQuote,
    // Layer 2 can't see follow; we trust prior Layer 1 if it ran.
    follow: !bounty.requiresFollow,
  };
  const everythingVerified = Object.values(verifiedAfterPatch).every(Boolean);

  const now = new Date();
  const setPayload: Partial<Claim> = { ...patch, updatedAt: now };
  if (everythingVerified) {
    setPayload.status = "initial_verified";
    setPayload.initialVerifiedAt = now;
    // Phase 8: final check fires at bounty.endsAt, not now+24h.
    setPayload.finalCheckScheduledAt = bounty.endsAt;
  }

  // Phase 9A defense #4: same idempotent guard as Layer 1. If the
  // claim has moved past pre-verification (Layer 1 raced us), we leave
  // it alone. The verified flag we'd write was just a denormalized
  // helper anyway — the verification has happened.
  const [updated] = await db
    .update(claims)
    .set(setPayload)
    .where(
      and(
        eq(claims.id, claim.id),
        inArray(claims.status, ["awaiting_action", "action_claimed"]),
      ),
    )
    .returning();
  if (updated && everythingVerified) {
    void recordActivity({
      type: "claim_verified",
      actorUserId: claim.hunterUserId,
      bountyId: claim.bountyId,
      claimId: claim.id,
    });
  }
  return updated ?? claim;
}
