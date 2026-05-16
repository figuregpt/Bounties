"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { SafeTokenAvatar } from "@/components/bounties/token-avatar";
import { useNow } from "@/hooks/useNow";
import {
  formatTimeRemainingFrom,
  formatTokenAmount,
  formatUsd,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProfileCreatedRow } from "@/lib/db/queries/profile";
import { EmptyState } from "./empty-state";

type Props = {
  rows: ProfileCreatedRow[];
  /** When true, show "Create your first" CTA on empty state. Other-profile
   *  views just say "no bounties yet" with no CTA. */
  isOwnProfile: boolean;
};

/**
 * "Created" tab: bounties this user spun up. Shows pool size +
 * progress so the creator can see how their campaign is performing
 * at a glance.
 */
export function CreatedList({ rows, isOwnProfile }: Props) {
  const now = useNow(60_000);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title={
          isOwnProfile
            ? "You haven't created any bounties yet."
            : "No bounties created yet."
        }
        ctaLabel={isOwnProfile ? "Create your first" : undefined}
        ctaHref={isOwnProfile ? "/create" : undefined}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const isActive = row.bountyStatus === "active";
        const remaining = formatTimeRemainingFrom(row.endsAt, now);
        const summary = summarizeRow(row, remaining);
        return (
          <li
            key={row.bountyId}
            className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border-subtle bg-bg-surface px-3 py-3 sm:gap-4 sm:px-4"
          >
            <SafeTokenAvatar
              size={40}
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
                {summary}
              </p>
            </Link>
            <div className="hidden text-right sm:block">
              <p
                className="font-mono text-body font-medium tabular-nums text-text-primary"
                data-numeric
              >
                {formatTokenAmount(row.totalPool)} {row.rewardTokenSymbol}
              </p>
              {row.totalPoolUsd != null && (
                <p
                  className="font-mono text-caption tabular-nums text-text-tertiary"
                  data-numeric
                >
                  {formatUsd(row.totalPoolUsd)} pool
                </p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-[var(--radius-pill)] border px-3 py-1 text-caption font-medium",
                isActive
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border-default bg-bg-elevated text-text-secondary",
              )}
            >
              {row.bountyStatus}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function summarizeRow(row: ProfileCreatedRow, remaining: string): string {
  if (row.bountyStatus === "active") {
    return `${row.claimedHuntersCount}/${row.maxHunters} claimed · ${remaining}`;
  }
  if (row.bountyStatus === "completed" && row.refundedAmount != null) {
    return `Completed · ${formatTokenAmount(row.refundedAmount)} ${
      row.rewardTokenSymbol
    } refunded`;
  }
  return `${row.bountyStatus} · ${row.claimedHuntersCount}/${row.maxHunters} claimed`;
}
