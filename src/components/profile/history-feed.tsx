"use client";

import Link from "next/link";
import { Clock, ExternalLink } from "lucide-react";
import { SafeTokenAvatar } from "@/components/bounties/token-avatar";
import { formatRelativeTime, formatTokenAmount, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProfileHistoryRow } from "@/lib/db/queries/profile";
import type { ClaimStatus } from "@/types/database";
import { EmptyState } from "./empty-state";

type Props = { rows: ProfileHistoryRow[] };

/**
 * "History" tab: terminal claim outcomes (claimed / failed / expired /
 * cancelled). Each row tags itself with a small status badge and, on
 * claimed rows, a Solscan link to the actual reward tx.
 *
 * Sorted by `updatedAt` desc so the freshest activity sits at the top.
 * Capped at 50 by the query; pagination is on the roadmap.
 */
export function HistoryFeed({ rows }: Props) {
  if (rows.length === 0) {
    return <EmptyState icon={Clock} title="No activity yet." />;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const badge = badgeForRow(row);
        const eventAt =
          row.claimedAt ?? row.failedAt ?? row.expiredAt ?? row.updatedAt;
        return (
          <li
            key={row.claimId}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-card)] border border-border-subtle px-3 py-3 sm:gap-4 sm:px-4",
              row.status === "claimed_reward"
                ? "bg-bg-surface"
                : "bg-bg-surface/60",
            )}
          >
            <SafeTokenAvatar
              size={36}
              symbol={row.rewardTokenSymbol}
              logoUrl={row.rewardTokenLogoUrl}
            />
            <Link
              href={`/bounties/${row.bountySlug}`}
              className="press min-w-0 flex-1"
            >
              <p className="truncate text-body font-medium text-text-primary">
                {row.bountyTitle}
              </p>
              <p className="truncate text-caption text-text-tertiary">
                {badge.subline(row)} · {formatRelativeTime(eventAt)}
              </p>
            </Link>
            <div className="hidden text-right sm:block">
              <p
                className={cn(
                  "font-mono text-small tabular-nums",
                  row.status === "claimed_reward"
                    ? "text-text-primary"
                    : "text-text-tertiary",
                )}
                data-numeric
              >
                {formatTokenAmount(row.rewardAmount)} {row.rewardTokenSymbol}
              </p>
              {row.rewardUsd != null && (
                <p
                  className="font-mono text-caption tabular-nums text-text-tertiary"
                  data-numeric
                >
                  {formatUsd(row.rewardUsd)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-caption font-medium",
                  badge.tone,
                )}
              >
                {badge.label}
              </span>
              {row.claimTxHash && row.status === "claimed_reward" && (
                <a
                  href={`https://solscan.io/tx/${row.claimTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="press grid size-8 place-items-center rounded-[8px] text-text-tertiary hover:text-text-primary"
                  title="View on Solscan"
                >
                  <ExternalLink className="size-3.5" strokeWidth={2} />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function badgeForRow(row: ProfileHistoryRow): {
  label: string;
  tone: string;
  subline: (row: ProfileHistoryRow) => string;
} {
  // Lottery losers are NOT a verification failure — they completed
  // every action correctly, the random draw just didn't pick them.
  // Treat as a neutral "Not picked" state so it doesn't look like
  // something is broken with their hunt.
  if (
    row.status === "failed" &&
    row.failureCategory === "not_selected_lottery"
  ) {
    return {
      label: "Not picked",
      tone: "border-border-default bg-bg-elevated text-text-secondary",
      subline: () => "You joined but weren't drawn in the lottery.",
    };
  }
  switch (row.status) {
    case "claimed_reward":
      return {
        label: "Claimed",
        tone: "border-success/30 bg-success/10 text-success",
        subline: () => "Reward sent",
      };
    case "failed":
      return {
        label: "Failed",
        tone: "border-danger/30 bg-danger/10 text-danger",
        subline: (r) => r.failureReason ?? "Verification failed",
      };
    case "expired":
      return {
        label: "Expired",
        tone: "border-warning/30 bg-warning-soft text-warning",
        subline: () => "Claim window closed",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        tone: "border-border-default bg-bg-elevated text-text-secondary",
        subline: () => "Hunt cancelled",
      };
    default:
      return {
        label: row.status,
        tone: "border-border-default bg-bg-elevated text-text-secondary",
        subline: () => "—",
      };
  }
}
