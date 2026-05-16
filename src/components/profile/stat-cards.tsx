import { formatUsd } from "@/lib/format";

type Props = {
  totalEarnedUsd: number;
  bountiesDoneCount: number;
  createdCount: number;
};

/**
 * Three-column lifetime stat row. Numbers come straight from the
 * profile query — no extra logic here, just presentation.
 *
 * Icons removed in a UX pass — labels are already short + obvious,
 * the icons were visual noise next to the big tabular numerals.
 */
export function StatCards({
  totalEarnedUsd,
  bountiesDoneCount,
  createdCount,
}: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <Card label="Earned all-time" value={formatUsd(totalEarnedUsd)} />
      <Card label="Bounties done" value={String(bountiesDoneCount)} />
      <Card label="Created" value={String(createdCount)} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border-subtle bg-bg-surface px-4 py-4">
      <p className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p
        className="mt-2 font-mono text-h3 font-medium leading-none tabular-nums text-text-primary"
        data-numeric
      >
        {value}
      </p>
    </div>
  );
}
