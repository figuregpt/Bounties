"use client";

import Link from "next/link";
import { Gift, Loader } from "lucide-react";
import { SafeTokenAvatar } from "@/components/bounties/token-avatar";
import { formatHandle, formatRelativeTime, formatTokenAmount, formatUsd } from "@/lib/format";
import type { ProfileToClaimRow } from "@/lib/db/queries/profile";
import { EmptyState } from "./empty-state";

type Props = {
  rows: ProfileToClaimRow[];
  /** Set of claim ids currently claiming (from claim-all or single). */
  claiming: Set<string>;
  /** True when claim-all is iterating — single Claim buttons disabled. */
  bulkInFlight: boolean;
  onClaim: (claimId: string) => void;
};

/**
 * "To claim" tab: verified claims ready for payout. One row per
 * bounty, with token avatar + amount + a primary Claim CTA. Sorted by
 * `finalVerifiedAt` desc (newest first) so the freshest reward sits
 * at the top.
 */
export function ClaimList({ rows, claiming, bulkInFlight, onClaim }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Gift}
        title="No rewards to claim. Hunt some bounties to earn."
        ctaLabel="Find bounties"
        ctaHref="/discover"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const isClaimingThis = claiming.has(row.claimId);
        // Rewards frozen on a removed chain (monad/base) can't pay out
        // through the Solana treasury — render them inert instead of
        // letting every click end in a support-ticket error.
        const unsupportedChain = row.chain !== "solana";
        const disabled = isClaimingThis || bulkInFlight || unsupportedChain;
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
                Verified {formatRelativeTime(row.finalVerifiedAt)}
                {" · "}
                {row.bountyTitle.slice(0, 60)}
              </p>
            </Link>
            <div className="hidden text-right sm:block">
              <p
                className="font-mono text-body font-medium tabular-nums text-text-primary"
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
            <button
              type="button"
              onClick={() => onClaim(row.claimId)}
              disabled={disabled}
              title={
                unsupportedChain
                  ? "This reward is on a network we no longer support — contact support to settle it."
                  : undefined
              }
              className="press inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] bg-accent-primary px-4 text-small font-medium text-[#100F16] hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {unsupportedChain ? (
                "Unsupported"
              ) : isClaimingThis ? (
                <>
                  <Loader className="size-3.5 animate-spin" strokeWidth={2.5} />
                  Claiming
                </>
              ) : (
                "Claim"
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
