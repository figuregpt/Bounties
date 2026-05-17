"use client";

import Link from "next/link";
import { ArrowRight, Loader } from "lucide-react";
import { formatUsd } from "@/lib/format";

type Props = {
  pendingTotalUsd: number;
  pendingCount: number;
  isClaimingAll: boolean;
  onClaimAll: () => void;
};

/**
 * Hero card that anchors the Claim Center. Two visual states:
 *
 *   • Active — lavender accent background, big dollar number, Claim
 *     all button. Renders when `pendingCount > 0`.
 *   • Empty — neutral surface, greyed number, link out to /discover
 *     to start hunting. Renders when there's nothing to claim.
 *
 * Hard-coded color values come from the accent ramp documented in
 * globals.css (#AB9FF2 base, #3C3489 + #26215C as dark-on-light text).
 * Inline styles instead of Tailwind classes because the hero needs
 * extremely specific contrast against the background — a one-off, not
 * something to invest in design tokens for.
 */
export function PendingHero({
  pendingTotalUsd,
  pendingCount,
  isClaimingAll,
  onClaimAll,
}: Props) {
  const hasPending = pendingCount > 0;
  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-card)] px-6 py-7 sm:px-8 sm:py-8"
      style={{ background: "#AB9FF2" }}
    >
      <p
        className="text-caption uppercase tracking-wider"
        style={{ color: "#26215C" }}
      >
        Pending rewards
      </p>
      <div
        className="mt-2 font-mono text-[40px] font-medium leading-[1.05] tabular-nums sm:text-[48px]"
        style={{ color: "#100F16" }}
        data-numeric
      >
        {formatUsd(pendingTotalUsd)}
      </div>
      <p className="mt-1 text-small" style={{ color: "#3C3489" }}>
        {hasPending
          ? `across ${pendingCount} ${pendingCount === 1 ? "bounty" : "bounties"}`
          : "No rewards waiting"}
      </p>
      <div className="mt-7 flex items-center justify-end">
        {hasPending ? (
          <button
            type="button"
            onClick={onClaimAll}
            disabled={isClaimingAll}
            className="press inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-bg-base px-6 text-small font-medium text-accent-text transition-colors hover:bg-bg-surface disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isClaimingAll ? (
              <>
                <Loader className="size-4 animate-spin" strokeWidth={2.25} />
                Claiming…
              </>
            ) : (
              <>Claim all</>
            )}
          </button>
        ) : (
          <Link
            href="/discover"
            className="press inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-bg-base px-6 text-small font-medium text-accent-text transition-colors hover:bg-bg-surface"
          >
            Go hunt some bounties
            <ArrowRight className="size-4" strokeWidth={2.25} />
          </Link>
        )}
      </div>
    </div>
  );
}
