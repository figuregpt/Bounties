import { TrendingUp } from "lucide-react";
import { formatUsd } from "@/lib/format";
import type { User } from "@/types/database";

/**
 * Mobile-only summary card at the top of /discover. The numbers come
 * straight off the user row — denormalized counters maintained by the
 * claim flow (Phase 7).
 *
 * The "pending" line only appears when the user has at least one claim
 * still in flight, so it stays out of the way for brand-new users.
 */
export function EarningsStrip({
  user,
  pendingCount,
}: {
  user: User;
  pendingCount?: number;
}) {
  const earned = Number(user.totalRewardsEarnedUsd ?? 0);
  return (
    <div className="rounded-[var(--radius-card)] border border-accent-primary/15 bg-accent-soft/40 p-4">
      <div className="flex items-center gap-2 text-caption uppercase tracking-wider text-accent-text">
        <TrendingUp className="size-3" strokeWidth={2.25} />
        Your earnings
      </div>
      <p
        className="mt-1 font-mono text-h2 tabular-nums text-text-primary"
        data-numeric
      >
        {formatUsd(earned)}
      </p>
      {pendingCount && pendingCount > 0 ? (
        <p className="mt-0.5 text-caption text-text-secondary">
          + {pendingCount} pending
        </p>
      ) : null}
    </div>
  );
}
