"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Claim } from "@/types/database";
import {
  useClaimRealtime,
  type RealtimeMessage,
} from "./useClaimRealtime";

/**
 * State machine for the hunt overlay.
 *
 * Owns:
 *   • POST /api/claims (start / retry)
 *   • POST /api/claims/[id]/verify-initial (verify)
 *   • DELETE /api/claims/[id] (cancel)
 *   • SSE subscription on user-${userId} for Layer 2 events
 *
 * Failure model: a transient failure leaves the claim in
 * `action_claimed` with `failureReason` set. The hook surfaces this as
 * phase=failure so the overlay shows the fix-it copy; the user can
 * retry up to MAX_VERIFICATION_ATTEMPTS times with a cooldown between.
 * Once exhausted, the claim flips to `failed` and the user is locked
 * out of retrying.
 */

export type HuntPhase =
  | "idle"
  | "starting"
  | "action_checklist"
  | "verifying"
  | "success"
  | "failure";

type ActionResult = {
  action: "retweet" | "reply" | "quote" | "follow";
  passed: boolean;
  failureReason?: string;
  failureCategory?: string;
  userActionRequired?: string;
  details?: Record<string, unknown>;
};

type PrimaryFailure = {
  reason?: string;
  category?: string;
  userActionRequired?: string;
  details?: Record<string, unknown>;
};

type VerificationOutcome = {
  allPassed: boolean;
  results: ActionResult[];
  primaryFailure?: PrimaryFailure;
};

export type HuntAttempts = {
  used: number;
  max: number;
  remaining: number;
};

/** Must stay in sync with MAX_VERIFICATION_ATTEMPTS in the verify-initial
 *  route. The server is authoritative — this constant is only used to
 *  display a counter before the first verify response lands. */
const MAX_ATTEMPTS_FALLBACK = 10;

export type UseHuntArgs = {
  bountyId: string;
  userId: string | null;
  initialClaim: Claim | null;
};

export function useHunt({ bountyId, userId, initialClaim }: UseHuntArgs) {
  const [claim, setClaim] = useState<Claim | null>(initialClaim);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Identifies *why* the last call failed when one did. Lets the UI
   *  distinguish "real verification failure" (driven by `verification`)
   *  from "system blew up" (rate_limited, verification_error, etc.). */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [verification, setVerification] =
    useState<VerificationOutcome | null>(null);
  const [attempts, setAttempts] = useState<HuntAttempts | null>(null);
  /** Absolute epoch ms when the cooldown lifts, or null if no cooldown
   *  is active. The overlay reads this and renders a live countdown. */
  const [retryAvailableAt, setRetryAvailableAt] = useState<number | null>(
    null,
  );

  const claimIdRef = useRef<string | null>(initialClaim?.id ?? null);
  useEffect(() => {
    claimIdRef.current = claim?.id ?? null;
  }, [claim?.id]);

  /* SSE: when worker flips Layer 2 booleans or the verify endpoint
     publishes an event, re-read the claim. The push only carries an ID;
     the GET gives us the full row including updated booleans. */
  useClaimRealtime(
    userId ? `user-${userId}` : null,
    useCallback(
      (msg: RealtimeMessage) => {
        const data = msg.data as { claimId?: string } | undefined;
        if (!data?.claimId) return;
        if (data.claimId !== claimIdRef.current) return;
        // Fetch full claim row so action booleans stay accurate.
        void fetch(`/api/claims/${data.claimId}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((body) => {
            if (body?.ok && body.claim) setClaim(body.claim as Claim);
          })
          .catch(() => {
            /* swallow — SSE will fire again on the next event */
          });
      },
      [],
    ),
  );

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setVerification(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bountyId }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        claim?: Claim;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.claim) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setClaim(body.claim);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [bountyId]);

  const verify = useCallback(async () => {
    if (!claim) return;
    setBusy(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch(
        `/api/claims/${claim.id}/verify-initial`,
        { method: "POST" },
      );
      const body = (await res.json()) as {
        ok: boolean;
        claim?: Claim;
        verification?: VerificationOutcome;
        attempts?: HuntAttempts;
        cooldownSeconds?: number;
        retryAfterSeconds?: number;
        errorCode?: string;
        error?: string;
      };

      // 429 isn't an exception path — it's a real verification outcome
      // (rate-limited or attempts exhausted). Surface it through the
      // hook state instead of throwing so the overlay can show the
      // proper UI.
      if (res.status === 429) {
        if (body.errorCode === "rate_limited" && body.retryAfterSeconds) {
          setRetryAvailableAt(Date.now() + body.retryAfterSeconds * 1000);
        }
        if (body.attempts) setAttempts(body.attempts);
        setError(body.error ?? "Rate limited");
        setErrorCode(body.errorCode ?? "rate_limited");
        return;
      }

      // 5xx — the server caught an internal error and gave us a clean
      // user-facing message. Show it as a system error in the overlay
      // (errorCode != null) so the "fix it on X" copy doesn't render.
      if (res.status >= 500) {
        setError(
          body.error ??
            "We couldn't check your actions right now. Please try again in a moment.",
        );
        setErrorCode(body.errorCode ?? "verification_error");
        return;
      }

      if (!res.ok || !body.ok || !body.claim) {
        setError(body.error ?? `HTTP ${res.status}`);
        setErrorCode(body.errorCode ?? "verification_error");
        return;
      }
      setClaim(body.claim);
      setVerification(body.verification ?? null);
      if (body.attempts) setAttempts(body.attempts);
      if (body.cooldownSeconds && body.verification && !body.verification.allPassed) {
        setRetryAvailableAt(Date.now() + body.cooldownSeconds * 1000);
      } else {
        setRetryAvailableAt(null);
      }
    } catch (err) {
      // Network / parse error — treat as a system error too.
      setError(err instanceof Error ? err.message : String(err));
      setErrorCode("verification_error");
    } finally {
      setBusy(false);
    }
  }, [claim]);

  const cancel = useCallback(async () => {
    if (!claim) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claim.id}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setClaim((c) =>
        c ? { ...c, status: "cancelled", cancelledAt: new Date() } : c,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [claim]);

  const reset = useCallback(() => {
    setError(null);
    setErrorCode(null);
    setVerification(null);
    setRetryAvailableAt(null);
  }, []);

  /* Derive phase. The transient-failure state lives in claim.status =
     'action_claimed' with either an in-memory `verification` whose
     allPassed=false, or — on overlay re-open — a persisted
     `claim.failureReason` from a prior attempt. */
  let phase: HuntPhase = "idle";
  if (busy && !claim) phase = "starting";
  else if (claim?.status === "awaiting_action") phase = "action_checklist";
  else if (claim?.status === "action_claimed") {
    const hasFreshFailure = verification && !verification.allPassed;
    const hasPersistedFailure = !!claim.failureReason;
    phase = hasFreshFailure || hasPersistedFailure ? "failure" : "verifying";
  } else if (
    claim?.status === "initial_verified" ||
    claim?.status === "awaiting_final" ||
    claim?.status === "final_verified" ||
    claim?.status === "claimed"
  ) {
    phase = "success";
  } else if (claim?.status === "failed") phase = "failure";

  // Local override: while a verify call is in flight, show verifying
  // regardless of the prior state.
  if (busy && claim) phase = "verifying";

  // System error: the server returned a 5xx (or a network blip). The
  // user didn't do anything wrong. Surface as failure-phase so they
  // get a retry button — the overlay branches inside on hasSystemError
  // to swap the copy. Don't override if a verify call is in flight.
  if (!busy && errorCode === "verification_error" && claim) {
    phase = "failure";
  }

  // Prefer the fresh attempts payload from the API; fall back to the
  // persisted attempts count on the claim row so a re-opened overlay
  // can still render "Attempt 2 of 10".
  const effectiveAttempts: HuntAttempts | null =
    attempts ??
    (claim && claim.verificationAttempts > 0
      ? {
          used: claim.verificationAttempts,
          max: MAX_ATTEMPTS_FALLBACK,
          remaining: Math.max(
            MAX_ATTEMPTS_FALLBACK - claim.verificationAttempts,
            0,
          ),
        }
      : null);

  return {
    phase,
    claim,
    busy,
    error,
    errorCode,
    /** True when the last call hit a system error rather than a legit
     *  verification failure. The overlay swaps to a "Couldn't verify
     *  right now" message in this case. */
    hasSystemError: errorCode === "verification_error",
    verification,
    attempts: effectiveAttempts,
    retryAvailableAt,
    /** True when the claim has hit its retry limit and can no longer
     *  be re-verified. UI should hide the "Try again" button.
     *
     *  Note: `claim.status === "failed"` ALONE is NOT enough. The
     *  state machine flips to `failed` after every failed verify so
     *  the slot is freed; the hunter can retry up to MAX_ATTEMPTS
     *  times (route re-reserves on POST /verify-initial). Exhaustion
     *  is purely a function of remaining attempts.
     */
    isExhausted: !!effectiveAttempts && effectiveAttempts.remaining <= 0,
    start,
    verify,
    cancel,
    reset,
  };
}

// Re-export for callers that want both pieces from one import.
export { useClaimRealtime };
