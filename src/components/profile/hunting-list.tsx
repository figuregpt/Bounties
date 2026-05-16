"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { SafeTokenAvatar } from "@/components/bounties/token-avatar";
import { useNow } from "@/hooks/useNow";
import {
  formatHandle,
  formatTimeRemainingFrom,
  formatTokenAmount,
  formatUsd,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProfileHuntingRow } from "@/lib/db/queries/profile";
import type { ClaimStatus } from "@/types/database";
import { EmptyState } from "./empty-state";

type Props = { rows: ProfileHuntingRow[] };

/**
 * "Hunting" tab: claims still working through the verification
 * lifecycle. Status badge replaces the Claim button (these aren't
 * payable yet). The countdown updates live via `useNow`.
 */
export function HuntingList({ rows }: Props) {
  const now = useNow(60_000);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Compass}
        title="Not currently hunting anything."
        ctaLabel="Find bounties"
        ctaHref="/discover"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const remaining = formatTimeRemainingFrom(row.bountyEndsAt, now);
        const badge = statusBadge(row.claimStatus, remaining);
        return (
          <li
            key={row.claimId}
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
                {formatHandle(row.creatorHandle)}&apos;s bounty
              </p>
              <p className="truncate text-caption text-text-tertiary">
                {badge.subline} · {row.bountyTitle.slice(0, 50)}
              </p>
            </Link>
            <div className="hidden text-right sm:block">
              <p
                className="font-mono text-body font-medium tabular-nums text-text-tertiary"
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
            <span
              className={cn(
                "shrink-0 rounded-[var(--radius-pill)] border px-3 py-1 text-caption font-medium",
                badge.tone,
              )}
            >
              {badge.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function statusBadge(
  status: ClaimStatus,
  remaining: string,
): { label: string; subline: string; tone: string } {
  switch (status) {
    case "awaiting_action":
      return {
        label: "Awaiting action",
        subline: `Bounty live · ${remaining}`,
        tone: "border-warning/30 bg-warning-soft text-warning",
      };
    case "action_claimed":
      return {
        label: "Verifying",
        subline: `Bounty live · ${remaining}`,
        tone: "border-accent-primary/40 bg-accent-soft text-accent-text",
      };
    case "initial_verified":
    case "awaiting_final":
      return {
        label: "Action verified",
        subline: `Awaiting final check · ${remaining}`,
        tone: "border-success/30 bg-success/10 text-success",
      };
    default:
      return {
        label: status,
        subline: `Bounty live · ${remaining}`,
        tone: "border-border-default bg-bg-elevated text-text-secondary",
      };
  }
}
