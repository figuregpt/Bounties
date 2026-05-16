"use client";

import { cn } from "@/lib/utils";
import type { DiscoverFilters } from "./filter-types";

/**
 * Mobile-only horizontal filter chip row. Each chip toggles a small
 * preset combination on top of the base "active only" filter — the
 * desktop sidebar is the canonical control; chips are the express lane.
 */

type Props = {
  filters: DiscoverFilters;
  onChange: (next: DiscoverFilters) => void;
};

const CHIPS = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot" },
  { id: "ending_soon", label: "Ending soon" },
  { id: "high_reward", label: "High reward" },
  { id: "eligible_only", label: "Eligible only" },
] as const;

type ChipId = (typeof CHIPS)[number]["id"];

export function FilterChips({ filters, onChange }: Props) {
  const current = filters.preset ?? "all";

  const select = (id: ChipId) => {
    if (id === current) return;
    onChange(applyPreset(filters, id));
  };

  return (
    <div className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
      {CHIPS.map((c) => {
        const active = current === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => select(c.id)}
            aria-pressed={active}
            className={cn(
              "press h-9 shrink-0 snap-start whitespace-nowrap rounded-[var(--radius-pill)] px-4 text-small font-medium transition-colors",
              active
                ? "bg-accent-primary text-[#100F16]"
                : "border border-border-default bg-bg-elevated text-text-secondary hover:border-border-hover hover:text-text-primary",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   Preset → DiscoverFilters mapping
   ========================================================================= */

function applyPreset(base: DiscoverFilters, id: ChipId): DiscoverFilters {
  const next: DiscoverFilters = {
    ...base,
    preset: id,
    // Each preset starts from "no ineligible / no extra time horizon"
    // and layers its own knobs on top.
    showIneligible: false,
    endingWithinHours: undefined,
  };
  switch (id) {
    case "all":
      return { ...next, sortBy: "newest" };
    case "hot":
      return { ...next, sortBy: "hot" };
    case "ending_soon":
      return { ...next, sortBy: "ending_soon", endingWithinHours: 24 };
    case "high_reward":
      return { ...next, sortBy: "highest_reward" };
    case "eligible_only":
      // The default for showIneligible is already false — the chip is
      // mostly affirmative UX, but we also force the sort back to newest
      // so users see what's accessible right now.
      return { ...next, sortBy: "newest", showIneligible: false };
  }
}
