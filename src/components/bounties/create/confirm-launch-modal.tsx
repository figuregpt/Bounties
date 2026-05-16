"use client";

import { AlertCircle, ArrowRight, Check, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import {
  Modal,
  ModalBody,
  ModalCancelButton,
  ModalConfirmButton,
  ModalContent,
  ModalDescription,
  ModalDetailsPanel,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import { formatTokenAmount, formatUsd } from "@/lib/format";
import { BOUNTY_CREATION_FEE_USD } from "@/lib/validation/bounty";
import {
  groupIssuesByLabel,
  type ValidationIssue,
} from "@/lib/validation/field-labels";

/**
 * Confirmation modal between "fill out form" and "send escrow tx".
 *
 * Same external API as before — the parent's `state` prop drives the
 * UI; we just reskinned the visuals on the new shared Modal primitive.
 */
export type ConfirmLaunchState =
  | "idle"
  | "preparing"
  | "awaiting_signature"
  | "awaiting_confirmation"
  | "live"
  | "error";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ConfirmLaunchState;
  error?: string | null;
  /** Structured validation issues when the backend returns 400.
   *  Takes precedence over `error` for the failure body. */
  issues?: ValidationIssue[] | null;
  rewardSymbol: string;
  totalPool: number;
  totalPoolUsd: number | null;
  /** Creation fee converted to reward-token units (null when token has
   *  no tracked price — server will reject the launch in that case). */
  creationFeeInToken: number | null;
  maxHunters: number;
  durationHours: number;
  onConfirm: () => void;
  onRetry: () => void;
};

const STATE_COPY: Record<
  ConfirmLaunchState,
  { title: string; body: string }
> = {
  idle: {
    title: "Launch bounty?",
    body: "This transfers your reward pool from your wallet to the bounties.fm treasury escrow. You can cancel unclaimed rewards later.",
  },
  preparing: {
    title: "Preparing transaction…",
    body: "Building the on-chain transfer.",
  },
  awaiting_signature: {
    title: "Sign the transfer",
    body: "Approve the transaction in your wallet to continue.",
  },
  awaiting_confirmation: {
    title: "Confirming on-chain…",
    body: "Solana usually confirms in 5-15 seconds.",
  },
  live: {
    title: "Bounty live",
    body: "Redirecting to your bounty page…",
  },
  error: {
    title: "Couldn't launch bounty",
    body: "",
  },
};

export function ConfirmLaunchModal({
  open,
  onOpenChange,
  state,
  error,
  issues,
  rewardSymbol,
  totalPool,
  totalPoolUsd,
  creationFeeInToken,
  maxHunters,
  durationHours,
  onConfirm,
  onRetry,
}: Props) {
  // What the wallet will actually be charged: reward pool + creation
  // fee, both denominated in the reward token. The server re-derives
  // this same number from cached token price; if the two disagree the
  // launch route returns a 400.
  const grandTotalToken =
    creationFeeInToken != null ? totalPool + creationFeeInToken : null;
  const grandTotalUsd =
    totalPoolUsd != null ? totalPoolUsd + BOUNTY_CREATION_FEE_USD : null;
  const copy = STATE_COPY[state];
  const inFlight =
    state === "preparing" ||
    state === "awaiting_signature" ||
    state === "awaiting_confirmation";
  const grouped =
    state === "error" && issues && issues.length > 0
      ? groupIssuesByLabel(issues)
      : [];
  const hasValidationIssues = grouped.length > 0;

  const rows = [
    {
      label: "Reward pool",
      value: (
        <>
          {formatTokenAmount(totalPool)} {rewardSymbol}
          {totalPoolUsd != null && (
            <span className="ml-1.5 text-text-tertiary">
              · {formatUsd(totalPoolUsd)}
            </span>
          )}
        </>
      ),
    },
    { label: "Slots", value: maxHunters },
    {
      label: "Duration",
      value:
        durationHours < 1
          ? `${Math.round(durationHours * 60)} minutes`
          : `${durationHours} hours`,
    },
    {
      label: "Bounty creation fee",
      value: (
        <>
          {creationFeeInToken != null
            ? `${formatTokenAmount(creationFeeInToken)} ${rewardSymbol}`
            : "—"}
          <span className="ml-1.5 text-text-tertiary">
            · {formatUsd(BOUNTY_CREATION_FEE_USD)}
          </span>
        </>
      ),
    },
    { label: "Platform fee", value: "5% (from each claim)" },
    {
      label: "You pay now",
      value: (
        <span className="font-semibold text-text-primary">
          {grandTotalToken != null
            ? `${formatTokenAmount(grandTotalToken)} ${rewardSymbol}`
            : `${formatTokenAmount(totalPool)} ${rewardSymbol}`}
          {grandTotalUsd != null && (
            <span className="ml-1.5 font-normal text-text-tertiary">
              · {formatUsd(grandTotalUsd)}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader
          title={
            state === "error" && hasValidationIssues
              ? "Couldn't launch bounty"
              : copy.title
          }
          icon={
            state === "live"
              ? Check
              : state === "error"
              ? AlertCircle
              : Sparkles
          }
        />

        <ModalDescription>
          {state === "error"
            ? hasValidationIssues
              ? "A few things need attention before we can launch this bounty:"
              : error ?? copy.body
            : copy.body}
        </ModalDescription>

        <ModalBody>
          {hasValidationIssues ? (
            <ul className="space-y-2 rounded-[10px] border border-danger/30 bg-danger/10 px-4 py-3 text-small text-danger">
              {grouped.map((g) => (
                <li key={g.label}>
                  <span className="font-medium">{g.label}:</span>{" "}
                  <span className="text-text-primary">
                    {g.messages.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ModalDetailsPanel rows={rows} />
          )}

          {state === "idle" && (
            <p className="text-caption text-text-tertiary">
              By launching you agree to our{" "}
              <Link
                href="/legal/terms"
                className="text-accent-text hover:text-accent-hover"
              >
                Terms of Service
              </Link>
              .
            </p>
          )}
        </ModalBody>

        <ModalFooter>
          {state === "idle" && (
            <>
              <ModalCancelButton />
              <ModalConfirmButton icon={Zap} onClick={onConfirm}>
                Launch and pay{" "}
                {formatTokenAmount(grandTotalToken ?? totalPool)}{" "}
                {rewardSymbol}
              </ModalConfirmButton>
            </>
          )}
          {state === "error" && (
            <>
              <ModalCancelButton />
              <ModalConfirmButton icon={ArrowRight} onClick={onRetry}>
                Try again
              </ModalConfirmButton>
            </>
          )}
          {inFlight && (
            <ModalConfirmButton loading disabled>
              {copy.title.replace("…", "")}
            </ModalConfirmButton>
          )}
          {state === "live" && (
            <ModalConfirmButton icon={Check} disabled>
              Bounty live
            </ModalConfirmButton>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
