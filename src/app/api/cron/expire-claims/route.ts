import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { claims } from "@/lib/db/schema";
import { verifyCronRequest } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/expire-claims — hourly job.
 *
 * Finds claims still in `verified` past their `claim_window_ends_at`
 * and flips them to `expired`. The reward stays in the treasury — it
 * gets folded into platform reserves and routed to the buyback pool in
 * Phase 9. We do NOT decrement bounty counters here: by the time a
 * claim reaches `verified` the bounty is already `completed` and the
 * counters are a frozen audit record.
 */

export async function POST(req: NextRequest) {
  const denial = verifyCronRequest(req);
  if (denial) return denial;

  const db = getDb();
  const now = new Date();

  const expired = await db
    .update(claims)
    .set({ status: "expired", expiredAt: now, updatedAt: now })
    .where(
      and(eq(claims.status, "verified"), lt(claims.claimWindowEndsAt, now)),
    )
    .returning({ id: claims.id });

  return NextResponse.json({ ok: true, expired: expired.length });
}
