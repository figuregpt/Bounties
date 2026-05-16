"use client";

import { Check, Loader, X } from "lucide-react";
import {
  Modal,
  ModalBody,
  ModalConfirmButton,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";
import { formatTokenAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ClaimRowState = "pending" | "claiming" | "done" | "failed";

export type ClaimAllRow = {
  claimId: string;
  bountyTitle: string;
  rewardAmount: number;
  rewardTokenSymbol: string;
  state: ClaimRowState;
  error?: string;
};

type Props = {
  open: boolean;
  rows: ClaimAllRow[];
  onClose: () => void;
};

/**
 * Modal that streams progress while Claim-All works through the
 * pending list one row at a time. Each row flips
 * pending → claiming → done|failed and the modal stays open until the
 * caller closes it (auto-closing felt jumpy; user wants to glance).
 *
 * If any rows failed, we surface the count + message in the footer
 * but don't block dismissal — the failed rows are still in the
 * To-claim list and can be retried individually.
 */
export function ClaimAllModal({ open, rows, onClose }: Props) {
  const done = rows.filter((r) => r.state === "done").length;
  const failed = rows.filter((r) => r.state === "failed").length;
  const inFlight = rows.some((r) => r.state === "claiming");
  const total = rows.length;
  const allFinished = !inFlight && done + failed === total;

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()}>
      <ModalContent>
        <ModalHeader
          title={
            allFinished
              ? failed === 0
                ? "All rewards claimed"
                : `Claimed ${done} of ${total}`
              : "Claiming rewards…"
          }
          icon={allFinished && failed === 0 ? Check : Loader}
        />
        <ModalDescription>
          {allFinished
            ? failed === 0
              ? "All your verified rewards have been sent."
              : `${done} succeeded, ${failed} failed — check the rows below.`
            : `Sending ${done + 1} of ${total}. Don't close this window.`}
        </ModalDescription>
        <ModalBody>
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li
                key={row.claimId}
                className="flex items-center gap-3 rounded-[10px] border border-border-subtle bg-bg-base px-3 py-2"
              >
                <StateDot state={row.state} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small text-text-primary">
                    {row.bountyTitle}
                  </p>
                  {row.state === "failed" && row.error && (
                    <p className="truncate text-caption text-danger">
                      {row.error}
                    </p>
                  )}
                </div>
                <p
                  className="font-mono text-caption tabular-nums text-text-secondary"
                  data-numeric
                >
                  {formatTokenAmount(row.rewardAmount)} {row.rewardTokenSymbol}
                </p>
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <ModalConfirmButton
            onClick={onClose}
            disabled={inFlight}
            icon={allFinished ? Check : undefined}
          >
            {allFinished ? "Done" : "Working…"}
          </ModalConfirmButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function StateDot({ state }: { state: ClaimRowState }) {
  if (state === "claiming") {
    return (
      <Loader
        className="size-4 shrink-0 animate-spin text-accent-text"
        strokeWidth={2.25}
      />
    );
  }
  if (state === "done") {
    return (
      <Check
        className="size-4 shrink-0 text-success"
        strokeWidth={2.5}
      />
    );
  }
  if (state === "failed") {
    return (
      <X
        className="size-4 shrink-0 text-danger"
        strokeWidth={2.5}
      />
    );
  }
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full bg-text-tertiary opacity-40",
      )}
    />
  );
}
