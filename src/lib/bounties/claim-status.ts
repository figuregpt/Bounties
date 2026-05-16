import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { claims } from "@/lib/db/schema";
import { assertClaimTransition } from "./state-machine";
import type { Claim, ClaimStatus } from "@/types/database";

/**
 * Single point of truth for changing a claim's status.
 *
 * The pattern (race-safe, idempotent):
 *
 *   1. Caller declares the *legal source statuses* the claim must be in.
 *   2. We assert each source→target transition is allowed (static guard).
 *   3. We run an atomic conditional UPDATE that only matches rows with
 *      one of those source statuses. Postgres returns the new row only
 *      if the predicate matched — concurrent updates lose silently.
 *   4. Return the updated row, or `null` if we lost the race.
 *
 * Use everywhere that flips a claim status. The atomic predicate is what
 * prevents the double-claim / re-entrancy / Layer 1 vs Layer 2 verify
 * race from corrupting state.
 *
 * Owner check (optional): pass `hunterUserId` to include ownership in
 * the same atomic predicate — handy for routes where the caller's user
 * id must match the claim's `hunterUserId`. Done in one round-trip
 * instead of fetch-then-update.
 */
export async function updateClaimStatus(args: {
  claimId: string;
  fromStatus: ClaimStatus | readonly ClaimStatus[];
  toStatus: ClaimStatus;
  /** Extra fields to set alongside the status flip. */
  set?: Partial<Omit<Claim, "id" | "status" | "updatedAt">>;
  /** When set, only update if `hunter_user_id` matches. */
  hunterUserId?: string;
}): Promise<Claim | null> {
  const fromStatuses = Array.isArray(args.fromStatus)
    ? (args.fromStatus as readonly ClaimStatus[])
    : ([args.fromStatus] as readonly ClaimStatus[]);

  // Static legality check: throws (developer error) on an illegal
  // transition. Loud failure here is exactly what we want — the caller
  // wrote a state-machine bug.
  for (const from of fromStatuses) {
    assertClaimTransition(from, args.toStatus);
  }

  const predicates = [
    eq(claims.id, args.claimId),
    inArray(claims.status, fromStatuses as ClaimStatus[]),
  ];
  if (args.hunterUserId) {
    predicates.push(eq(claims.hunterUserId, args.hunterUserId));
  }

  const db = getDb();
  const rows = await db
    .update(claims)
    .set({
      status: args.toStatus,
      updatedAt: new Date(),
      ...(args.set ?? {}),
    })
    .where(and(...predicates))
    .returning();

  return rows[0] ?? null;
}
