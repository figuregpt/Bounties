import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bounties, claims } from "@/lib/db/schema";
import { checkEligibility } from "@/lib/bounties/eligibility";
import {
  applyVerificationResult,
  markClaimPermanentlyFailed,
  verifyClaimLayer1,
} from "@/lib/bounties/verify-claim";
import { publishEvent } from "@/lib/realtime/publisher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/claims/[id]/verify-initial — hunter taps "I'm done, verify".
 *
 * Runs the Layer 1 verifier (REST + cache). Layer 2 may have already
 * flipped some action booleans via the WebSocket stream — `verifyClaimLayer1`
 * respects those and only re-checks unverified actions, so we don't burn
 * twitterapi credits for events the stream already covered.
 *
 * Abuse protection:
 *   • Each claim allows at most `MAX_VERIFICATION_ATTEMPTS` attempts; the
 *     last one that fails transitions the claim to permanent `failed`.
 *   • Successive attempts must be at least `MIN_SECONDS_BETWEEN_ATTEMPTS`
 *     apart so a bot can't spam-retry the verification API.
 *
 * Cache strategy: after the first failed attempt the verifier passes
 * `bypassCache: true` so the user's edited reply / new retweet is
 * actually fetched fresh from twitterapi.io. The 60s cache still helps
 * concurrent hunters on the first pass.
 */

const MAX_VERIFICATION_ATTEMPTS = 10;
const MIN_SECONDS_BETWEEN_ATTEMPTS = 30;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return await handlePost(req, ctx);
  } catch (err) {
    // Last-ditch safety net: any uncaught throw — Postgres errors,
    // twitterapi.io blow-ups, anything — gets logged with a concise
    // breadcrumb and the user sees a generic retry message. We MUST
    // NOT echo error.message back: that's how SQL params + tweet
    // content ended up in the failure card.
    const { id: claimId } = await ctx.params.catch(() => ({ id: "?" }));
    console.error("[verify-initial] uncaught error:", {
      claimId,
      errorCode: (err as { code?: string })?.code,
      errorName: err instanceof Error ? err.name : "unknown",
      errorMessage:
        err instanceof Error ? err.message.slice(0, 200) : "unknown",
      stack:
        err instanceof Error
          ? err.stack?.split("\n").slice(0, 8).join("\n")
          : undefined,
    });
    return NextResponse.json(
      {
        ok: false,
        errorCode: "verification_error",
        error:
          "We couldn't check your actions right now. Please try again in a moment.",
      },
      { status: 500 },
    );
  }
}

async function handlePost(
  _req: NextRequest,
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

  const db = getDb();
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, id))
    .limit(1);
  if (!claim) {
    return NextResponse.json(
      { ok: false, error: "Claim not found" },
      { status: 404 },
    );
  }
  if (claim.hunterUserId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  // Verifiable starting states:
  //   • `awaiting_action`  — first verify call, no slot held yet
  //   • `failed`           — retry after a transient failure (counters
  //                          were freed when we wrote 'failed'); the
  //                          retry re-reserves a slot below
  //   • `action_claimed`   — extremely brief window while a verify call
  //                          is mid-flight; allowing this makes the
  //                          path idempotent under double-clicks
  // After MAX_VERIFICATION_ATTEMPTS the route below returns 429 even
  // when status is still `failed`, so the retry budget is the real cap.
  const VERIFIABLE = new Set(["awaiting_action", "failed", "action_claimed"]);
  if (!VERIFIABLE.has(claim.status)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot verify a claim in state '${claim.status}'`,
        errorCode: "wrong_state",
      },
      { status: 409 },
    );
  }

  // ---- Max-attempts guard ------------------------------------------
  if (claim.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    // Defense in depth — the previous attempt should have already
    // flipped the claim to `failed`, but if something raced or crashed
    // mid-update, finish the transition here.
    await markClaimPermanentlyFailed(
      claim,
      "Maximum verification attempts reached",
      "verification_limit_exceeded",
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "You've used all 10 verification attempts. This hunt has been marked as failed.",
        errorCode: "verification_limit_exceeded",
        attempts: {
          used: claim.verificationAttempts,
          max: MAX_VERIFICATION_ATTEMPTS,
        },
      },
      { status: 429 },
    );
  }

  // ---- Cooldown guard ----------------------------------------------
  if (claim.lastVerificationAttemptAt) {
    const elapsedSec =
      (Date.now() - claim.lastVerificationAttemptAt.getTime()) / 1000;
    if (elapsedSec < MIN_SECONDS_BETWEEN_ATTEMPTS) {
      const retryAfter = Math.ceil(
        MIN_SECONDS_BETWEEN_ATTEMPTS - elapsedSec,
      );
      return NextResponse.json(
        {
          ok: false,
          error: `Please wait ${retryAfter}s before trying again`,
          errorCode: "rate_limited",
          retryAfterSeconds: retryAfter,
          attempts: {
            used: claim.verificationAttempts,
            max: MAX_VERIFICATION_ATTEMPTS,
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        },
      );
    }
  }

  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.id, claim.bountyId))
    .limit(1);
  if (!bounty) {
    return NextResponse.json(
      { ok: false, error: "Bounty not found" },
      { status: 404 },
    );
  }

  // Phase 8.5+: slots aren't reserved up front anymore. Instead, before
  // running the verifier we run a cheap COUNT(*) over verified+ claims
  // for this bounty. If we're already at the cap, return 409 without
  // spending twitterapi.io credits.
  //
  // This intentionally accepts a small race: two users below the cap
  // could pass this check, both verify successfully, and the bounty
  // would exceed `maxHunters` by one. The reconcile script flags any
  // such drift; product-wise it's acceptable to occasionally over-fill
  // by 1 vs. blocking the rare honest hunter behind a pessimistic lock.
  const now = new Date();
  let claimForVerify = claim;
  const needsSlotCheck =
    claim.status === "awaiting_action" || claim.status === "failed";
  if (needsSlotCheck) {
    const eligibility = checkEligibility(user, bounty);
    if (!eligibility.eligible) {
      return NextResponse.json(
        { ok: false, error: "Not eligible", eligibility },
        { status: 403 },
      );
    }
    if (bounty.status !== "active" || bounty.endsAt.getTime() < now.getTime()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bounty is no longer available",
          errorCode: "bounty_unavailable",
        },
        { status: 409 },
      );
    }

    const [{ count: filled }] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(claims)
      .where(
        and(
          eq(claims.bountyId, bounty.id),
          inArray(claims.status, [
            "initial_verified",
            "awaiting_final",
            "verified",
            "claiming",
            "claimed_reward",
          ]),
        ),
      );
    if (filled >= bounty.maxHunters) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Sorry, this bounty just filled up. The reward pool is fully claimed.",
          errorCode: "bounty_filled",
        },
        { status: 409 },
      );
    }

    // Notify any open detail-page tabs that the in-progress count
    // changed (awaiting_action → action_claimed shifts the breakdown).
    publishEvent(`bounty-${bounty.id}`, "bounty_updated", {
      bountyId: bounty.id,
    });

    const [transitioned] = await db
      .update(claims)
      .set({
        status: "action_claimed",
        actionClaimedAt: now,
        updatedAt: now,
      })
      .where(eq(claims.id, claim.id))
      .returning();
    claimForVerify = transitioned;
  }

  const result = await verifyClaimLayer1(claimForVerify, bounty, user);

  const verificationDetails = {
    stage: "initial" as const,
    actions: Object.fromEntries(
      result.results.map((r) => [
        r.action,
        {
          verified: r.passed,
          checkedAt: now.toISOString(),
          ...(r.passed
            ? {}
            : {
                failureReason: r.failureReason,
                failureCategory: r.failureCategory,
              }),
          ...(r.details ?? {}),
        },
      ]),
    ),
  };

  let updated = await applyVerificationResult(
    claimForVerify,
    result,
    verificationDetails,
  );

  // If this attempt failed AND it was the last allowed one, transition
  // to terminal `failed` and free the slot. updated.verificationAttempts
  // was just bumped by applyVerificationResult, so compare against MAX.
  const exhaustedRetries =
    !result.allPassed &&
    updated.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS;
  if (exhaustedRetries) {
    updated = await markClaimPermanentlyFailed(
      updated,
      result.primaryFailure?.reason ?? "Verification failed",
      result.primaryFailure?.category ?? "verification_limit_exceeded",
    );
  }

  // Push to the user channel so the bounty-detail UI flips state
  // without needing to re-poll.
  publishEvent(
    `user-${user.id}`,
    result.allPassed ? "claim_verified" : "claim_failed",
    {
      claimId: updated.id,
      bountyId: updated.bountyId,
      status: updated.status,
    },
  );
  if (result.allPassed) {
    publishEvent(`bounty-${claim.bountyId}`, "new_verification", {
      claimId: updated.id,
    });
  }

  return NextResponse.json({
    ok: true,
    claim: updated,
    verification: {
      allPassed: result.allPassed,
      results: result.results,
      primaryFailure: result.primaryFailure,
    },
    attempts: {
      used: updated.verificationAttempts,
      max: MAX_VERIFICATION_ATTEMPTS,
      remaining: Math.max(
        MAX_VERIFICATION_ATTEMPTS - updated.verificationAttempts,
        0,
      ),
    },
    cooldownSeconds: MIN_SECONDS_BETWEEN_ATTEMPTS,
  });
}
