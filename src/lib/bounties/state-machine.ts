import type { BountyStatus, ClaimStatus } from "@/types/database";

/**
 * Documented + runtime-checked state transitions for the bounty +
 * claim state machines, as of Phase 8.
 *
 * Treat this as the source of truth. Routes / cron handlers / the
 * worker should call `assertClaimTransition` / `assertBountyTransition`
 * before writing a status change so we get a loud failure instead of a
 * silently corrupted row.
 *
 * The transition tables below mirror the prose spec in Phase 8 Part 8.
 * Adding a state means adding it to the union in `types/database.ts`,
 * then listing every allowed predecessor here.
 */

/* =========================================================================
   Claim state machine
   ========================================================================= */

/**
 * Note on `initial_verified` vs `awaiting_final`: both statuses mark a
 * claim as eligible for the bounty-completion cron's final verification.
 * They differ semantically — `initial_verified` is fresh from Layer 1
 * (POST /verify-initial) or Layer 2 (worker stream), while
 * `awaiting_final` is reserved for a future optimization where the cron
 * would batch-claim its pending work. Any query that's looking for
 * "claims ready for final verification" must `inArray` both, see
 * src/lib/bounties/final-verification.ts.
 *
 *   awaiting_action ──────────────────────┐
 *        │                                │
 *        │ (verify endpoint, first call)  │ (cancel)
 *        ▼                                ▼
 *   action_claimed                    cancelled
 *        │
 *        ├──(Layer 1 / Layer 2 verified)──► initial_verified
 *        │
 *        └──(max retries exhausted)──────► failed
 *
 *   initial_verified
 *        │
 *        ├──(final check at endsAt passes)──► verified
 *        ├──(final check fails: action withdrawn)─► failed
 *        └──(user cancels)────────────────────────► cancelled
 *
 *   verified
 *        │
 *        ├──(user clicks claim)──► claiming
 *        └──(claim window passed)─► expired
 *
 *   claiming
 *        ├──(tx confirmed)──► claimed_reward
 *        └──(tx failed)────► verified (eligible to retry)
 *
 *   claimed_reward / expired / cancelled / failed → terminal
 */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  awaiting_action: ["action_claimed", "cancelled"],
  action_claimed: ["action_claimed", "initial_verified", "failed", "cancelled"],
  initial_verified: ["verified", "failed", "cancelled"],
  awaiting_final: ["verified", "failed", "cancelled"],
  verified: ["claiming", "expired", "cancelled"],
  claiming: ["claimed_reward", "verified"],
  claimed_reward: [],
  expired: [],
  failed: [],
  cancelled: [],
};

export function canClaimTransition(
  from: ClaimStatus,
  to: ClaimStatus,
): boolean {
  return (CLAIM_TRANSITIONS[from] ?? []).includes(to);
}

export function assertClaimTransition(
  from: ClaimStatus,
  to: ClaimStatus,
): void {
  if (!canClaimTransition(from, to)) {
    throw new Error(
      `[state-machine] illegal claim transition: ${from} → ${to}`,
    );
  }
}

/* =========================================================================
   Bounty state machine
   ========================================================================= */

/**
 *   draft ──(escrow tx verified)──► active
 *
 *   active
 *     │
 *     ├──(endsAt passes, cron picks up)──► finalizing ──► completed
 *     ├──(creator cancels)──────────────────────────────► cancelled
 *     └──(tweet deleted / hard failure)─────────────────► broken
 *
 *   finalizing ─► completed
 *
 *   completed / refunded / cancelled / broken → terminal
 *   paused ◄──► active (can be paused/resumed by creator)
 */
export const BOUNTY_TRANSITIONS: Record<
  BountyStatus,
  readonly BountyStatus[]
> = {
  draft: ["active", "cancelled"],
  active: ["finalizing", "cancelled", "broken", "paused"],
  paused: ["active", "cancelled"],
  finalizing: ["completed", "active"], // revert allowed on cron error
  completed: ["refunded"], // legacy: refund step may flip again
  refunded: [],
  broken: [],
  cancelled: [],
};

export function canBountyTransition(
  from: BountyStatus,
  to: BountyStatus,
): boolean {
  return (BOUNTY_TRANSITIONS[from] ?? []).includes(to);
}

export function assertBountyTransition(
  from: BountyStatus,
  to: BountyStatus,
): void {
  if (!canBountyTransition(from, to)) {
    throw new Error(
      `[state-machine] illegal bounty transition: ${from} → ${to}`,
    );
  }
}
