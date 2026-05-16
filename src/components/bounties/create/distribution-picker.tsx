"use client";

import {
  Award,
  Dice5,
  LinkIcon as LinkIconLucide,
  Lock,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DISTRIBUTION_MODELS } from "@/lib/validation/bounty";
import type { DistributionModel } from "@/types/database";

/**
 * 2x2 radio-card grid for the distribution model.
 *
 * V1 ships Fixed slots fully wired. The other three variants render
 * with a "Coming soon" overlay so creators can see what's on the
 * roadmap without being able to pick a half-implemented model.
 *
 * Phase-out plan tagged inline so the next round of work knows where to
 * look.
 */

const OPTIONS: {
  value: DistributionModel;
  icon: LucideIcon;
  title: string;
  description: string;
  bestFor: string;
  /** Null = ready. Tagged target phase otherwise. */
  comingPhase: string | null;
}[] = [
  {
    value: "fixed_slot",
    icon: LinkIconLucide,
    title: "Fixed slots",
    description: "First N hunters who complete the actions get equal rewards.",
    bestFor: "Launches, viral campaigns",
    comingPhase: null,
  },
  {
    value: "pool_quadratic",
    icon: TrendingDown,
    title: "Quadratic pool",
    description: "Early hunters earn more, later ones earn less.",
    bestFor: "Long campaigns, sustained engagement",
    comingPhase: "Phase 8",
  },
  {
    value: "pool_lottery",
    icon: Dice5,
    title: "Random lottery",
    description: "Random hunters win — most bot-resistant.",
    bestFor: "Large campaigns, anti-spam",
    comingPhase: "Phase 9",
  },
  {
    value: "quality_tiered",
    icon: Award,
    title: "Quality tiered",
    description: "Higher reputation hunters earn more.",
    bestFor: "Premium campaigns",
    comingPhase: "Phase 10",
  },
];

type Props = {
  value: DistributionModel;
  onChange: (next: DistributionModel) => void;
};

export function DistributionPicker({ value, onChange }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {OPTIONS.map((o) => {
        const selected = o.value === value;
        const locked = o.comingPhase != null;
        return (
          <button
            key={o.value}
            type="button"
            disabled={locked}
            onClick={() => !locked && onChange(o.value)}
            aria-pressed={selected}
            title={
              locked
                ? `Coming in ${o.comingPhase}. Choose Fixed slots for now.`
                : undefined
            }
            className={cn(
              "relative rounded-[var(--radius-card)] border p-4 text-left transition-colors",
              locked
                ? "cursor-not-allowed border-border-default bg-bg-base opacity-60"
                : "press",
              !locked && selected
                ? "border-accent-primary bg-accent-soft/40"
                : !locked && "border-border-default bg-bg-base hover:border-border-hover",
            )}
          >
            {locked && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-bg-elevated px-2 py-0.5 text-caption uppercase tracking-wider text-text-tertiary">
                <Lock className="size-2.5" strokeWidth={2.5} />
                Soon
              </span>
            )}
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-[10px]",
                  !locked && selected
                    ? "bg-accent-primary text-[#0E0E10]"
                    : "bg-bg-elevated text-text-secondary",
                )}
              >
                <o.icon className="size-4" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-text-primary">
                  {o.title}
                </p>
                <p className="mt-0.5 text-caption text-text-secondary">
                  {o.description}
                </p>
                <p className="mt-2 text-caption uppercase tracking-wider text-text-tertiary">
                  Best for · {o.bestFor}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Re-export so the parent form can iterate without a separate import. */
export { DISTRIBUTION_MODELS };
