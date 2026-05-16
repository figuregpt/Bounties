import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { claims } from "@/lib/db/schema";
import { publishEvent } from "@/lib/realtime/publisher";

export const dynamic = "force-dynamic";

/**
 * GET /api/claims/[id] — fetch the current state of a single claim.
 *
 * Owner-only. Used by the hunt overlay both as the initial fetch (after
 * mount) and as the fallback when an SSE event arrives — the SSE payload
 * is intentionally tiny, so the client re-reads the full row here to
 * refresh its view.
 */
export async function GET(
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
  const [row] = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, id), eq(claims.hunterUserId, user.id)))
    .limit(1);
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Claim not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, claim: row });
}

/**
 * DELETE /api/claims/[id] — user abandons a pending claim.
 *
 * Allowed only when the caller owns the claim AND the claim is still
 * cancellable (anything pre-`verified`). Frees up a slot on the bounty
 * and bumps the denormalized counters back down.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, id), eq(claims.hunterUserId, user.id)))
    .limit(1);
  if (!row) {
    return NextResponse.json({ ok: false, error: "Claim not found" }, { status: 404 });
  }

  const CANCELLABLE = new Set([
    "awaiting_action",
    "action_claimed",
    "initial_verified",
    "awaiting_final",
    "failed",
  ]);
  if (!CANCELLABLE.has(row.status)) {
    return NextResponse.json(
      { ok: false, error: `Cannot cancel a claim in state '${row.status}'` },
      { status: 409 },
    );
  }

  const now = new Date();
  await db
    .update(claims)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(eq(claims.id, row.id));

  // Free the slot — but only when one was actually reserved. As of
  // Phase 7 polish, slots are reserved on awaiting_action → action_claimed,
  // so cancelling a still-`awaiting_action` claim is a no-op on counters.
  // Phase 8.5+: bounty slot counts are computed-on-read; nothing to
  // decrement here. Still publish so the bounty-detail page repaints
  // its breakdown immediately.
  publishEvent(`bounty-${row.bountyId}`, "bounty_updated", {
    bountyId: row.bountyId,
  });

  return NextResponse.json({ ok: true });
}
