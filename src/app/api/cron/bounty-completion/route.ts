import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bounties } from "@/lib/db/schema";
import { verifyCronRequest } from "@/lib/cron/auth";
import { runFinalVerification } from "@/lib/bounties/final-verification";
import { processUnclaimedRefund } from "@/lib/bounties/refund";
import { recordActivity } from "@/lib/realtime/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/bounty-completion — every-60s job that finalizes
 * bounties whose `endsAt` has passed.
 *
 * Per bounty:
 *   1. Flip status `active` → `finalizing` so concurrent runs skip it.
 *   2. Run final verification on each `initial_verified` claim
 *      (Layer 1 with bypassCache so we see withdrawn actions).
 *   3. Compute unclaimed pool and ship a refund tx to the creator.
 *   4. Flip status to `completed` + stamp `completedAt`.
 *   5. The worker rule-manager reconciles every 60s and removes the
 *      twitterapi.io filter rule for any bounty no longer in `active`.
 *
 * Auth: Railway sends `Authorization: Bearer ${CRON_SECRET}`.
 * Batch size: 50 per invocation. Anything larger should be its own job.
 */

const BATCH = 50;

export async function POST(req: NextRequest) {
  const denial = verifyCronRequest(req);
  if (denial) return denial;

  const db = getDb();
  const now = new Date();

  // Finalize bounties whose `endsAt` has passed. We don't fast-track
  // filled-but-not-expired bounties here — hunters need to keep their
  // X actions live for the full bounty duration; final verification
  // must run when the clock says so, not when the slot pool fills.
  // Filled bounties are hidden from /discover at the query layer so
  // they don't look "live" to new hunters while they wait.
  const ended = await db
    .select({
      id: bounties.id,
      slug: bounties.slug,
      creatorUserId: bounties.creatorUserId,
    })
    .from(bounties)
    .where(and(eq(bounties.status, "active"), lt(bounties.endsAt, now)))
    .limit(BATCH);

  const summary: Array<{
    bountyId: string;
    finalVerified: number;
    finalFailed: number;
    refund: string;
    error?: string;
  }> = [];

  for (const b of ended) {
    try {
      // Claim the bounty for this run so a concurrent invocation can't
      // double-process. Only succeeds if it's still `active`.
      const claimed = await db
        .update(bounties)
        .set({ status: "finalizing", updatedAt: new Date() })
        .where(
          and(eq(bounties.id, b.id), eq(bounties.status, "active")),
        )
        .returning({ id: bounties.id });
      if (claimed.length === 0) continue;

      const verification = await runFinalVerification(b.id);
      const refund = await processUnclaimedRefund(b.id);

      await db
        .update(bounties)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bounties.id, b.id));

      void recordActivity({
        type: "bounty_completed",
        actorUserId: b.creatorUserId,
        bountyId: b.id,
      });

      summary.push({
        bountyId: b.id,
        finalVerified: verification.newlyVerified,
        finalFailed: verification.newlyFailed,
        refund:
          refund.kind === "refunded"
            ? `${refund.amount} ${refund.tokenSymbol}${refund.mock ? " (mock)" : ""}`
            : refund.kind === "noop"
              ? `noop: ${refund.reason}`
              : `failed: ${refund.error}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.push({
        bountyId: b.id,
        finalVerified: 0,
        finalFailed: 0,
        refund: "skipped",
        error: message,
      });
      // Best-effort revert so the bounty isn't stuck in finalizing.
      await db
        .update(bounties)
        .set({ status: "active", updatedAt: new Date() })
        .where(
          and(eq(bounties.id, b.id), eq(bounties.status, "finalizing")),
        );
    }
  }

  return NextResponse.json({
    ok: true,
    processed: summary.length,
    bounties: summary,
  });
}
