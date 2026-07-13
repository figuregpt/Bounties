"use client";

import { Filter, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { formatUsd } from "@/lib/format";
import type { BountyStatus } from "@/types/database";
import {
  DEFAULT_FILTERS,
  type DiscoverFilters,
} from "./filter-types";

/* ──────────────────────────────────────────────────────────────────────────
   FilterSidebar — desktop only. Auto-applies on change; the parent owns
   filter state and re-fetches via useInfiniteBounties.

   No third-party UI primitives — we render styled native inputs so the
   bundle stays thin.
   ────────────────────────────────────────────────────────────────────────── */

type Props = {
  filters: DiscoverFilters;
  onChange: (next: DiscoverFilters) => void;
};

const STATUS_OPTIONS: { label: string; value: BountyStatus }[] = [
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

export function FilterSidebar({ filters, onChange }: Props) {
  const isDefault = isDefaultFilters(filters);

  return (
    <aside className="w-full space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-h3 font-medium">
          <Filter className="size-4 text-text-tertiary" strokeWidth={2} />
          Filters
        </h2>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="inline-flex items-center gap-1 text-caption uppercase tracking-wider text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <RotateCcw className="size-3" strokeWidth={2.25} />
            Reset
          </button>
        )}
      </header>

      <Group label="Status">
        {STATUS_OPTIONS.map((o) => (
          <CheckRow
            key={o.value}
            label={o.label}
            checked={filters.statuses.includes(o.value)}
            onChange={(v) =>
              onChange({
                ...filters,
                statuses: v
                  ? [...filters.statuses, o.value]
                  : filters.statuses.filter((s) => s !== o.value),
              })
            }
          />
        ))}
      </Group>

      <Group label="Min per hunter">
        <div className="space-y-2">
          <p
            className="font-mono text-small text-text-primary tabular-nums"
            data-numeric
          >
            {filters.minRewardPerHunterUsd > 0
              ? formatUsd(filters.minRewardPerHunterUsd)
              : "Any"}
          </p>
          <input
            type="range"
            min={0}
            max={500}
            step={5}
            value={filters.minRewardPerHunterUsd}
            onChange={(e) =>
              onChange({
                ...filters,
                minRewardPerHunterUsd: Number(e.target.value),
              })
            }
            className="w-full accent-accent-primary"
          />
          <div className="flex justify-between text-caption text-text-tertiary">
            <span>$0</span>
            <span>$500+</span>
          </div>
        </div>
      </Group>


      <Group label="Show ineligible">
        <SwitchRow
          checked={filters.showIneligible}
          onChange={(v) =>
            onChange({ ...filters, showIneligible: v })
          }
          hint="Show bounties you don't qualify for"
        />
      </Group>

      <Group label="Show filled">
        <SwitchRow
          checked={filters.showFilled}
          onChange={(v) => onChange({ ...filters, showFilled: v })}
          hint="Include bounties whose slots are already full"
        />
      </Group>
    </aside>
  );
}

/* =========================================================================
   Primitives
   ========================================================================= */

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-button)] px-1 py-1 hover:bg-bg-elevated">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent-primary"
      />
      <span className="text-small text-text-secondary">{label}</span>
    </label>
  );
}

function SwitchRow({
  checked,
  onChange,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-button)] px-1 py-1.5">
      <span className="space-y-0.5">
        <span className="block text-small text-text-secondary">
          {checked ? "On" : "Off"}
        </span>
        {hint && (
          <span className="block text-caption text-text-tertiary">{hint}</span>
        )}
      </span>
      <Switch checked={checked} onChange={onChange} aria-label="Toggle filter" />
    </div>
  );
}

function isDefaultFilters(f: DiscoverFilters): boolean {
  return (
    f.statuses.length === 1 &&
    f.statuses[0] === "active" &&
    f.minRewardPerHunterUsd === 0 &&
    f.showIneligible === DEFAULT_FILTERS.showIneligible &&
    f.showFilled === DEFAULT_FILTERS.showFilled &&
    f.sortBy === "newest"
  );
}
