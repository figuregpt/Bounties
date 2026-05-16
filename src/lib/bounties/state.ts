import type {
  Bounty,
  BountyStatus,
  Claim,
  ClaimStatus,
  User,
} from "@/types/database";
import {
  checkEligibility,
  type EligibilityResult,
} from "./eligibility";

/**
 * The single source of truth for "what does the user see on the bounty
 * page right now?". Combines bounty lifecycle, the user's claim (if any),
 * eligibility, and slot availability into one tagged union.
 *
 * Phase 5 reads this on the detail page and in the design-system
 * showcase. Phase 7 will use the same enum to drive the hunt overlay.
 *
 * Pure function — no DB calls. Pass everything you need in.
 */

export type BountyUIStateKind =
  | "is_creator"
  | "campaign_ended"
  | "campaign_paused"
  | "campaign_cancelled"
  | "campaign_full"
  | "not_eligible"
  | "claim_expired"
  | "claimed"
  | "ready_to_claim"
  | "verification_failed"
  | "awaiting_final"
  | "awaiting_initial"
  | "action_in_progress"
  | "cancelled_by_user"
  | "not_started";

export type CtaVariant = "primary" | "secondary" | "danger" | "disabled";

export type BountyUIState = {
  kind: BountyUIStateKind;
  /** Short title for the action panel header. */
  title: string;
  /** One-sentence elaboration shown under the title. */
  message: string;
  /** Whether the primary "Hunt now" affordance is available. */
  canHunt: boolean;
  /** Whether the user can withdraw a verified reward. */
  canClaim: boolean;
  /** Whether the user can abandon a pending claim. */
  canCancel: boolean;
  /** What the primary CTA should render — null when the state has no CTA. */
  primaryCta: CtaConfig | null;
  /** Optional secondary action ("Cancel hunt", "Pause bounty", …). */
  secondaryCta: CtaConfig | null;
};

export type CtaConfig = {
  label: string;
  variant: CtaVariant;
  /** Stable id consumed by the page component to dispatch the action. */
  action:
    | "start_hunt"
    | "complete_actions"
    | "claim_reward"
    | "cancel_claim"
    | "retry_claim"
    | "view_analytics"
    | "pause_bounty"
    | "resume_bounty"
    | "cancel_bounty"
    | "view_tweet"
    | "noop";
  /** Optional icon name resolved by the renderer (lucide-react). */
  icon?:
    | "ArrowRight"
    | "Check"
    | "Loader"
    | "AlertTriangle"
    | "Coins"
    | "Pause"
    | "Play"
    | "Trash";
  /** Whether the button should pulse / glow. */
  pulse?: boolean;
};

/* =========================================================================
   Entry point
   ========================================================================= */

export function getBountyUIState(args: {
  bounty: Bounty;
  user: User | null;
  claim: Claim | null;
  /** Pre-computed eligibility — pass to avoid recomputing per render. */
  eligibility?: EligibilityResult;
}): BountyUIState {
  const { bounty, user, claim } = args;
  const eligibility =
    args.eligibility ?? checkEligibility(user, bounty);

  /* ---- Creator view ---------------------------------------------- */
  if (user && bounty.creatorUserId === user.id) {
    return creatorState(bounty);
  }

  /* ---- Bounty lifecycle gates ------------------------------------ */
  if (bounty.status === ("cancelled" as BountyStatus)) {
    return statelessGate({
      kind: "campaign_cancelled",
      title: "Bounty cancelled",
      message: "The creator cancelled this bounty.",
    });
  }
  if (bounty.status === ("paused" as BountyStatus)) {
    return statelessGate({
      kind: "campaign_paused",
      title: "Bounty paused",
      message: "The creator temporarily paused this bounty.",
    });
  }
  if (bounty.status === ("completed" as BountyStatus) || hasEnded(bounty)) {
    return statelessGate({
      kind: "campaign_ended",
      title: "Bounty ended",
      message: "The window for this bounty has closed.",
    });
  }
  if (bounty.currentHuntersCount >= bounty.maxHunters && !claim) {
    return statelessGate({
      kind: "campaign_full",
      title: "Bounty full",
      message: "All slots are taken. Check back if any open up.",
    });
  }

  /* ---- The user's own claim takes priority over everything else -- */
  if (claim) {
    const claimState = stateFromClaim(claim, bounty);
    if (claimState) return claimState;
  }

  /* ---- No claim yet: eligibility filter -------------------------- */
  if (!eligibility.eligible && eligibility.requirements.length > 0) {
    return {
      kind: "not_eligible",
      title: "Not eligible",
      message:
        eligibility.summary ||
        "Improve your X profile to unlock more bounties.",
      canHunt: false,
      canClaim: false,
      canCancel: false,
      primaryCta: {
        label: "Not eligible",
        variant: "disabled",
        action: "noop",
      },
      secondaryCta: null,
    };
  }

  /* ---- Default — ready to hunt ----------------------------------- */
  return {
    kind: "not_started",
    title: "Ready to hunt",
    message: "Complete the required actions and claim your reward.",
    canHunt: true,
    canClaim: false,
    canCancel: false,
    primaryCta: {
      label: "Hunt now",
      variant: "primary",
      action: "start_hunt",
      icon: "ArrowRight",
    },
    secondaryCta: null,
  };
}

/* =========================================================================
   Helpers
   ========================================================================= */

function hasEnded(bounty: Bounty): boolean {
  const endsAt =
    bounty.endsAt instanceof Date
      ? bounty.endsAt
      : new Date(bounty.endsAt);
  return endsAt.getTime() < Date.now();
}

function creatorState(bounty: Bounty): BountyUIState {
  const isPaused = bounty.status === ("paused" as BountyStatus);
  return {
    kind: "is_creator",
    title: "Your bounty",
    message: "You posted this bounty. Manage it from here.",
    canHunt: false,
    canClaim: false,
    canCancel: false,
    primaryCta: {
      label: "View analytics",
      variant: "primary",
      action: "view_analytics",
    },
    secondaryCta: {
      label: isPaused ? "Resume bounty" : "Pause bounty",
      variant: "secondary",
      action: isPaused ? "resume_bounty" : "pause_bounty",
      icon: isPaused ? "Play" : "Pause",
    },
  };
}

function statelessGate(args: {
  kind: BountyUIStateKind;
  title: string;
  message: string;
}): BountyUIState {
  return {
    kind: args.kind,
    title: args.title,
    message: args.message,
    canHunt: false,
    canClaim: false,
    canCancel: false,
    primaryCta: null,
    secondaryCta: null,
  };
}

/**
 * Maps a claim row's status onto a UI state. Returns null when the claim
 * is in a state that should be ignored (e.g. cancelled_by_user — we let
 * the user start fresh).
 */
function stateFromClaim(claim: Claim, _bounty: Bounty): BountyUIState | null {
  const status = claim.status as ClaimStatus;

  switch (status) {
    case "awaiting_action":
      return {
        kind: "action_in_progress",
        title: "Hunt in progress",
        message: "Finish the steps on Twitter and confirm you're done.",
        canHunt: true,
        canClaim: false,
        canCancel: false,
        primaryCta: {
          label: "Complete actions",
          variant: "primary",
          action: "complete_actions",
          icon: "ArrowRight",
        },
        secondaryCta: null,
      };

    case "action_claimed":
      // Phase 7 polish: a transient failure leaves the claim here with
      // `failureReason` set so the user can retry. If there's no failure
      // recorded yet, the verify request is genuinely in flight.
      if (claim.failureReason) {
        return {
          kind: "verification_failed",
          title: "Verification didn't pass",
          message: claim.failureReason,
          canHunt: true,
          canClaim: false,
          canCancel: false,
          primaryCta: {
            label: "Fix and retry",
            variant: "primary",
            action: "retry_claim",
            icon: "AlertTriangle",
          },
          secondaryCta: null,
        };
      }
      return {
        kind: "awaiting_initial",
        title: "Verifying your actions",
        message: "This usually takes a few seconds.",
        canHunt: false,
        canClaim: false,
        canCancel: false,
        primaryCta: {
          label: "Verifying…",
          variant: "disabled",
          action: "noop",
          icon: "Loader",
        },
        secondaryCta: null,
      };

    case "initial_verified":
    case "awaiting_final":
      return {
        kind: "awaiting_final",
        title: "Action verified",
        message:
          "We'll re-verify when the bounty ends to confirm your action wasn't withdrawn.",
        canHunt: false,
        canClaim: false,
        canCancel: false,
        primaryCta: {
          label: "Awaiting final check",
          variant: "disabled",
          action: "noop",
          icon: "Loader",
          pulse: true,
        },
        secondaryCta: null,
      };

    case "verified":
      return {
        kind: "ready_to_claim",
        title: "Reward ready",
        message: "Tap to send to your wallet.",
        canHunt: false,
        canClaim: true,
        canCancel: false,
        primaryCta: {
          label: "Claim reward",
          variant: "primary",
          action: "claim_reward",
          icon: "Coins",
          pulse: true,
        },
        secondaryCta: null,
      };

    case "claiming":
      return {
        kind: "ready_to_claim",
        title: "Sending reward",
        message: "Solana usually confirms in 5–15 seconds.",
        canHunt: false,
        canClaim: false,
        canCancel: false,
        primaryCta: {
          label: "Sending…",
          variant: "disabled",
          action: "noop",
          icon: "Loader",
          pulse: true,
        },
        secondaryCta: null,
      };

    case "claimed_reward":
      return {
        kind: "claimed",
        title: "Claimed",
        message: "Reward sent to your wallet.",
        canHunt: false,
        canClaim: false,
        canCancel: false,
        primaryCta: {
          label: "View on Solscan",
          variant: "secondary",
          action: "noop",
          icon: "ArrowRight",
        },
        secondaryCta: null,
      };

    case "failed":
      return {
        kind: "verification_failed",
        title: "Hunt failed",
        message:
          claim.failureReason ?? "Verification couldn't confirm your actions.",
        canHunt: true,
        canClaim: false,
        canCancel: false,
        primaryCta: {
          label: "Fix and retry",
          variant: "primary",
          action: "retry_claim",
          icon: "AlertTriangle",
        },
        secondaryCta: null,
      };

    case "expired":
      return {
        kind: "claim_expired",
        title: "Claim window expired",
        message: "You didn't claim within 48h after verification.",
        canHunt: false,
        canClaim: false,
        canCancel: false,
        primaryCta: null,
        secondaryCta: null,
      };

    case "cancelled":
      // The user cancelled — let them start over. Fall through to the
      // default "not_started" branch in getBountyUIState.
      return null;

    default:
      return null;
  }
}
