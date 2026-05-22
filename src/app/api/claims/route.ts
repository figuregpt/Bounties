import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bounties, claims } from "@/lib/db/schema";
import { checkEligibility } from "@/lib/bounties/eligibility";

/**
 * Statuses that count toward the per-user "active hunt" cap. A hunter
 * holding too many of these can grief by occupying slots they have no
 * intention of finishing — see threat model #5. Once a claim flips to
 * `verified` / `claiming` / terminal, it doesn't block new hunts.
 */
const ACTIVE_HUNT_STATUSES = [
  "awaiting_action",
  "action_claimed",
  "initial_verified",
  "awaiting_final",
] as const;

const MAX_ACTIVE_HUNTS_PER_USER = 5;

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BodySchema = z.object({
  bountyId: z.string().uuid(),
});

/**
 * POST /api/claims — hunter pulls a slot.
 *
 * Atomic reservation: we increment `current_hunters_count` with a
 * conditional UPDATE that only succeeds when the bounty is still active,
 * not expired, and under cap. Returning rows are the "won the race"
 * signal — if zero rows come back, someone else took the last slot
 * between the eligibility check and our write.
 *
 * Idempotent: clicking "Hunt now" twice returns the existing claim
 * instead of erroring. The unique (bountyId, hunterUserId) index already
 * prevents real duplicates; we just want a clean response.
 *
 * Eligibility is re-checked on the freshly-read bounty row. The page
 * could be hours old, so trusting the client's view would let a hunter
 * sneak past a filter the creator added since.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();

  // 1) Idempotent fast path — return existing claim if any.
  const [existing] = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.bountyId, parsed.data.bountyId),
        eq(claims.hunterUserId, user.id),
      ),
    )
    .limit(1);
  if (existing) {
    return NextResponse.json({
      ok: true,
      claim: existing,
      isNewClaim: false,
    });
  }

  // 1a) Per-user concurrent hunt cap (Phase 9A defense #5). Block one
  //     user from grabbing every slot across many bounties. Verified /
  //     claiming / terminal claims don't count — only in-progress work.
  const [activeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(claims)
    .where(
      and(
        eq(claims.hunterUserId, user.id),
        inArray(claims.status, ACTIVE_HUNT_STATUSES as unknown as string[]),
      ),
    );
  const activeCount = activeRow?.count ?? 0;
  if (activeCount >= MAX_ACTIVE_HUNTS_PER_USER) {
    return NextResponse.json(
      {
        ok: false,
        error: `You already have ${activeCount} active hunts. Finish or cancel one before starting a new bounty.`,
        errorCode: "too_many_active_hunts",
        activeCount,
        cap: MAX_ACTIVE_HUNTS_PER_USER,
      },
      { status: 429 },
    );
  }

  // 2) Re-check the bounty + eligibility from fresh state.
  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.id, parsed.data.bountyId))
    .limit(1);
  if (!bounty) {
    return NextResponse.json(
      { ok: false, error: "Bounty not found" },
      { status: 404 },
    );
  }
  if (bounty.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Bounty is not accepting hunters" },
      { status: 409 },
    );
  }
  // Self-hunt prevention: a creator can't drain their own bounty.
  // Beyond the obvious abuse (fund yourself), allowing this lets one
  // wallet act as both creator AND verified hunter, which corrupts
  // the per-user concurrent-hunt cap and refund-math invariants.
  if (bounty.creatorUserId === user.id) {
    return NextResponse.json(
      {
        ok: false,
        error: "You can't hunt your own bounty",
        errorCode: "self_hunt_forbidden",
      },
      { status: 403 },
    );
  }
  if (new Date(bounty.endsAt) < new Date()) {
    return NextResponse.json(
      { ok: false, error: "Bounty has ended" },
      { status: 409 },
    );
  }
  // For fixed_slot bounties the slot count caps participants. For
  // pool_lottery anyone can join — N winners are drawn at random when
  // the bounty ends, so capping participants would defeat the model.
  if (
    bounty.distributionModel !== "pool_lottery" &&
    bounty.currentHuntersCount >= bounty.maxHunters
  ) {
    return NextResponse.json(
      { ok: false, error: "Bounty is full" },
      { status: 409 },
    );
  }
  const eligibility = checkEligibility(user, bounty);
  if (!eligibility.eligible) {
    return NextResponse.json(
      { ok: false, error: "Not eligible", eligibility },
      { status: 403 },
    );
  }

  // 3) Create the claim row WITHOUT touching the bounty counters. The
  //    slot is only reserved on the awaiting_action → action_claimed
  //    transition inside /verify-initial — opening the hunt overlay and
  //    walking away shouldn't lock a slot from other hunters.
  try {
    const now = new Date();
    const [created] = await db
      .insert(claims)
      .values({
        bountyId: bounty.id,
        hunterUserId: user.id,
        status: "awaiting_action",
        huntStartedAt: now,
        rewardAmount: bounty.rewardPerHunter,
        rewardAmountUsd: bounty.rewardPerHunterUsd,
        rewardTokenMint: bounty.rewardTokenMint,
        rewardTokenSymbol: bounty.rewardTokenSymbol,
        platformFeeAmount: bounty.platformFeeAmount,
        userTwitterFollowersAtHunt: user.twitterFollowers,
        userTwitterVerifiedAtHunt: user.twitterVerified,
        userReputationScoreAtHunt: user.reputationScore,
      })
      .returning();

    return NextResponse.json({
      ok: true,
      claim: created,
      isNewClaim: true,
    });
  } catch (err) {
    // Parallel request created the row first — return the winning claim.
    const [winner] = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.bountyId, bounty.id),
          eq(claims.hunterUserId, user.id),
        ),
      )
      .limit(1);
    if (winner) {
      return NextResponse.json({
        ok: true,
        claim: winner,
        isNewClaim: false,
      });
    }
    throw err;
  }
}
