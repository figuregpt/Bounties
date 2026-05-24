"use client";

import { useEffect, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import { ActionChecklist } from "@/components/bounties/action-checklist";
import { cn } from "@/lib/utils";
import { formatTokenAmount, formatUsd } from "@/lib/format";
import { useNow } from "@/hooks/useNow";
import type { ActionConfig, Bounty, Claim } from "@/types/database";
import type { HuntAttempts, HuntPhase, useHunt } from "@/hooks/useHunt";

/**
 * Hunt flow modal — the centerpiece of Phase 7.
 *
 * Four visual states, all driven by `phase` from useHunt:
 *
 *   action_checklist → ActionChecklist + "I've done it, verify" CTA
 *                      + "Open tweet in new tab" link.
 *   verifying         → spinner + per-action status from claim booleans;
 *                       Layer 2 flips items live via SSE.
 *   success           → green check, reward amount, "what's next" copy.
 *   failure           → categorized failure copy, fix-it instruction,
 *                       found-text preview when present, attempts
 *                       counter, "Try again" CTA with cooldown timer.
 *
 * Phase 7 polish: when the hunt is in retry-exhausted state
 * (claim.status='failed' or attempts.remaining == 0), the retry CTA is
 * swapped for "Close" — there's nothing more the user can do.
 */

type HuntApi = ReturnType<typeof useHunt>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bounty: Pick<
    Bounty,
    | "id"
    | "tweetUrl"
    | "actionConfig"
    | "rewardPerHunter"
    | "rewardPerHunterUsd"
    | "rewardTokenSymbol"
  >;
  hunt: HuntApi;
  /** Currently-connected wallet (from useWalletConnection upstream).
   *  Forwarded to `start()` so the slot-reservation API can run the
   *  holder-requirement balance check if the bounty needs one. */
  connectedWallet?: string | null;
};

export function HuntOverlay({
  open,
  onOpenChange,
  bounty,
  hunt,
  connectedWallet,
}: Props) {
  const {
    phase,
    claim,
    busy,
    error,
    hasSystemError,
    verification,
    attempts,
    retryAvailableAt,
    isExhausted,
    start,
    verify,
    reset,
  } = hunt;

  // Auto-start the claim creation exactly once per open. We can't gate
  // this on `phase === "idle"` because a failed start() drops phase back
  // to idle, which would re-trigger the effect and put us in an infinite
  // retry loop ("Reserving your slot…" forever). Track a ref instead.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoStartedRef.current = false;
      return;
    }
    if (autoStartedRef.current) return;
    if (claim || busy) return;
    autoStartedRef.current = true;
    void start(connectedWallet);
  }, [open, claim, busy, start, connectedWallet]);

  // Re-arm error/verification surfaces when closing.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // Slot reservation failed (claim is null, we have an error, and we're
  // not currently retrying). The legacy body would mislead the user into
  // thinking they should complete tasks on X. Render a dedicated error
  // panel instead, with a single "Try again" CTA that re-runs start().
  const startFailed = !claim && !busy && !!error;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent hideClose={phase === "verifying"}>
        <Header
          phase={startFailed ? "failure" : phase}
          hasSystemError={hasSystemError}
        />
        {startFailed ? (
          <StartErrorBody error={error!} />
        ) : (
          <Body
            phase={phase}
            actionConfig={bounty.actionConfig}
            claim={claim}
            verification={verification}
            error={error}
            hasSystemError={hasSystemError}
            attempts={attempts}
            isExhausted={isExhausted}
            rewardLabel={rewardLabel(bounty)}
          />
        )}
        {startFailed ? (
          <ModalFooter>
            <SecondaryButton onClick={() => onOpenChange(false)}>
              Close
            </SecondaryButton>
            <PrimaryButton
              onClick={() => {
                autoStartedRef.current = true;
                void start(connectedWallet);
              }}
              loading={busy}
              icon={<RefreshCw className="size-4" strokeWidth={2.25} />}
            >
              Try again
            </PrimaryButton>
          </ModalFooter>
        ) : (
          <Footer
            phase={phase}
            tweetUrl={bounty.tweetUrl}
            busy={busy}
            isExhausted={isExhausted}
            retryAvailableAt={retryAvailableAt}
            attempts={attempts}
            onVerify={verify}
            onRetry={verify}
            onClose={() => onOpenChange(false)}
          />
        )}
      </ModalContent>
    </Modal>
  );
}

function StartErrorBody({ error }: { error: string }) {
  return (
    <>
      <ModalDescription>
        <span className="text-text-primary">
          Couldn&rsquo;t reserve your slot.
        </span>
      </ModalDescription>
      <ModalBody>
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-small text-danger">
          {error}
        </p>
      </ModalBody>
    </>
  );
}

/* =========================================================================
   Slots
   ========================================================================= */

function Header({
  phase,
  hasSystemError,
}: {
  phase: HuntPhase;
  hasSystemError: boolean;
}) {
  const title =
    phase === "success"
      ? "You're verified"
      : phase === "failure"
      ? hasSystemError
        ? "Couldn't verify right now"
        : "Couldn't verify your hunt"
      : phase === "verifying"
      ? "Verifying…"
      : "Hunt this bounty";
  const Icon =
    phase === "success"
      ? CheckCircle2
      : phase === "failure"
      ? AlertCircle
      : phase === "verifying"
      ? Loader2
      : Zap;
  return (
    <ModalHeader
      title={title}
      icon={Icon}
      hideClose={phase === "verifying"}
    />
  );
}

function Body({
  phase,
  actionConfig,
  claim,
  verification,
  error,
  hasSystemError,
  attempts,
  isExhausted,
  rewardLabel,
}: {
  phase: HuntPhase;
  actionConfig: ActionConfig;
  claim: Claim | null;
  verification: HuntApi["verification"];
  error: string | null;
  hasSystemError: boolean;
  attempts: HuntAttempts | null;
  isExhausted: boolean;
  rewardLabel: string;
}) {
  if (phase === "success") {
    return (
      <>
        <ModalDescription>
          Reward locked in. We&rsquo;ll re-check in 24 hours to make sure
          your reply, RT, and follow are still up — then you can claim
          {" "}
          <span className="font-medium text-text-primary">{rewardLabel}</span>.
        </ModalDescription>
        <ModalBody>
          <ActionChecklist
            actionConfig={actionConfig}
            claim={claim}
            hideReplyInline
          />
        </ModalBody>
      </>
    );
  }

  if (phase === "failure") {
    // System error path: nothing the user did wrong. Show a clean
    // retry message, no "fix it on X" guidance, no action checklist
    // (it'd just confuse the user since their actions weren't even
    // evaluated).
    if (hasSystemError) {
      return (
        <>
          <ModalDescription>
            Something went wrong on our end while checking your
            actions. Try again in a few seconds.
          </ModalDescription>
          {error && (
            <ModalBody>
              <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-small text-danger">
                {error}
              </p>
            </ModalBody>
          )}
        </>
      );
    }

    const primary = verification?.primaryFailure;
    const reason =
      primary?.reason ??
      claim?.failureReason ??
      error ??
      "We couldn't confirm one of your actions.";
    // Fix-it copy: prefer the in-memory verification (most specific),
    // otherwise synthesize from the persisted failureCategory so a
    // re-opened overlay after a prior failure still shows guidance.
    const userActionRequired =
      primary?.userActionRequired ??
      defaultUserActionRequired(claim?.failureCategory ?? null);
    const foundReply =
      pickFoundText(primary?.details, "reply") ?? claim?.replyText ?? null;
    const foundQuote =
      pickFoundText(primary?.details, "quote") ?? claim?.quoteText ?? null;

    return (
      <>
        <ModalDescription>
          <span className="text-text-primary">{reason}</span>
        </ModalDescription>
        <ModalBody>
          {userActionRequired && (
            <p className="mb-3 text-small text-text-secondary">
              {isExhausted
                ? "You've used all 10 verification attempts. Try a different bounty."
                : userActionRequired}
            </p>
          )}

          {foundReply && (
            <FoundTextPreview label="We found your reply" text={foundReply} />
          )}
          {foundQuote && (
            <FoundTextPreview label="We found your quote" text={foundQuote} />
          )}

          <ActionChecklist
            actionConfig={actionConfig}
            claim={claim}
            hideReplyInline
          />

          {attempts && !isExhausted && (
            <p className="mt-3 text-caption text-text-tertiary">
              Attempt {attempts.used} of {attempts.max} ·{" "}
              {attempts.remaining} retr{attempts.remaining === 1 ? "y" : "ies"} left
            </p>
          )}
          {isExhausted && (
            <p className="mt-3 text-caption text-danger">
              No retries remaining — this hunt has been marked as failed.
            </p>
          )}
        </ModalBody>
      </>
    );
  }

  if (phase === "verifying" || phase === "starting") {
    return (
      <>
        <ModalDescription>
          {phase === "starting"
            ? "Reserving your slot…"
            : "We're checking your retweet, reply, and follow on X. This usually takes a few seconds."}
        </ModalDescription>
        <ModalBody>
          <ActionChecklist
            actionConfig={actionConfig}
            claim={claim}
            hideReplyInline
          />
          {error && (
            <p className="mt-4 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}
        </ModalBody>
      </>
    );
  }

  // action_checklist (or idle prior to first POST)
  return (
    <>
      <ModalDescription>
        Complete every step on X, then tap{" "}
        <span className="text-text-primary">Verify</span> below. Layer 2
        catches new replies and RTs in real time — if you finish while
        this is open you&rsquo;ll see it tick green on its own.
      </ModalDescription>
      <ModalBody>
        <ActionChecklist
          actionConfig={actionConfig}
          claim={claim}
          hideReplyInline
        />
        {error && (
          <p className="mt-4 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-small text-danger">
            {error}
          </p>
        )}
      </ModalBody>
    </>
  );
}

function Footer({
  phase,
  tweetUrl,
  busy,
  isExhausted,
  retryAvailableAt,
  attempts,
  onVerify,
  onRetry,
  onClose,
}: {
  phase: HuntPhase;
  tweetUrl: string;
  busy: boolean;
  isExhausted: boolean;
  retryAvailableAt: number | null;
  attempts: HuntAttempts | null;
  onVerify: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onClose: () => void;
}) {
  if (phase === "success") {
    return (
      <ModalFooter>
        <PrimaryButton onClick={onClose}>Close</PrimaryButton>
      </ModalFooter>
    );
  }

  if (phase === "failure") {
    if (isExhausted) {
      return (
        <ModalFooter>
          <PrimaryButton onClick={onClose}>Close</PrimaryButton>
        </ModalFooter>
      );
    }
    return (
      <ModalFooter>
        <SecondaryButton
          onClick={() => window.open(tweetUrl, "_blank", "noreferrer")}
          icon={<ExternalLink className="size-4" strokeWidth={2.25} />}
        >
          Open tweet
        </SecondaryButton>
        <RetryButton
          busy={busy}
          retryAvailableAt={retryAvailableAt}
          attempts={attempts}
          onRetry={onRetry}
        />
      </ModalFooter>
    );
  }

  if (phase === "verifying" || phase === "starting") {
    return null;
  }

  // action_checklist
  return (
    <ModalFooter>
      <SecondaryButton
        onClick={() => window.open(tweetUrl, "_blank", "noreferrer")}
        icon={<ExternalLink className="size-4" strokeWidth={2.25} />}
      >
        Open tweet
      </SecondaryButton>
      <PrimaryButton onClick={onVerify} disabled={busy} loading={busy}>
        I&rsquo;ve done it — verify
      </PrimaryButton>
    </ModalFooter>
  );
}

/* =========================================================================
   Buttons + sub-blocks
   ========================================================================= */

function RetryButton({
  busy,
  retryAvailableAt,
  attempts,
  onRetry,
}: {
  busy: boolean;
  retryAvailableAt: number | null;
  attempts: HuntAttempts | null;
  onRetry: () => void | Promise<void>;
}) {
  // Tick once a second so the cooldown counter updates visibly; this
  // component unmounts as soon as the user retries so the interval is
  // cheap.
  const now = useNow(1_000);
  const secondsLeft = retryAvailableAt
    ? Math.max(0, Math.ceil((retryAvailableAt - now) / 1000))
    : 0;
  const isCoolingDown = secondsLeft > 0;

  const remaining = attempts?.remaining;
  const label = isCoolingDown
    ? `Wait ${secondsLeft}s`
    : remaining != null
    ? `Try again (${remaining} left)`
    : "Try again";

  return (
    <PrimaryButton
      onClick={onRetry}
      disabled={busy || isCoolingDown}
      loading={busy}
      icon={<RefreshCw className="size-4" strokeWidth={2.25} />}
    >
      {label}
    </PrimaryButton>
  );
}

function FoundTextPreview({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <div className="mb-3 rounded-[10px] border border-border-subtle bg-bg-elevated px-3 py-2">
      <p className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p className="mt-1 break-words text-small text-text-primary">
        &ldquo;{text}&rdquo;
      </p>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => void onClick()}
      className={cn(
        "press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-accent-primary px-5 text-small font-medium text-[#100F16] transition-colors",
        "hover:bg-accent-hover",
        loading && "cursor-progress",
        disabled && !loading && "cursor-not-allowed opacity-50",
      )}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
      ) : (
        icon
      )}
      <span>{children}</span>
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "press inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-transparent px-5 text-small text-text-secondary transition-colors",
        "hover:border-[rgba(255,255,255,0.14)] hover:text-text-primary",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

/* =========================================================================
   Helpers
   ========================================================================= */

function rewardLabel(b: Props["bounty"]): string {
  const amt = formatTokenAmount(b.rewardPerHunter);
  const usd =
    b.rewardPerHunterUsd != null
      ? ` (${formatUsd(b.rewardPerHunterUsd)})`
      : "";
  return `${amt} ${b.rewardTokenSymbol}${usd}`;
}

function pickFoundText(
  details: Record<string, unknown> | undefined,
  kind: "reply" | "quote",
): string | null {
  if (!details) return null;
  const key = kind === "reply" ? "foundReplyText" : "foundQuoteText";
  const value = details[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Fallback fix-it copy when the in-memory verification result is gone
 * (e.g. the user re-opened the overlay after closing it). Driven off
 * the persisted `failureCategory` on the claim row.
 */
function defaultUserActionRequired(category: string | null): string | undefined {
  switch (category) {
    case "action_not_done":
      return "Complete the action on X, then try again";
    case "retweet_not_done":
      return "Retweet the post on X, then try again";
    case "follow_not_active":
      return "Follow the target account on X, then try again";
    case "reply_missing_keyword":
    case "quote_missing_keyword":
      return "Edit your post to include the required keyword, then retry";
    case "reply_has_forbidden_keyword":
    case "quote_has_forbidden_keyword":
      return "Remove the forbidden word from your post, then retry";
    case "reply_too_short":
    case "quote_too_short":
      return "Expand your post, then retry";
    case "verification_limit_exceeded":
      return "The real-time stream will pick it up — wait a moment and refresh";
    case "internal_error":
      return "Wait a moment and try again";
    default:
      return undefined;
  }
}

// Re-export the API alias so consumers don't need to import from two
// places to type the hunt prop.
type HuntApiExport = HuntApi;
export type { HuntApiExport as HuntApi };
