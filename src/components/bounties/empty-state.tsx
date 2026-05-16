"use client";

import {
  Compass,
  FilterX,
  RefreshCw,
  ShieldQuestion,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "no_bounties" | "filters_too_narrow" | "no_eligible";

type Props = {
  variant: Variant;
  /** Override hook for the primary CTA (default behaviour matches variant). */
  onAction?: () => void;
  /** Class for the outer wrapper. */
  className?: string;
};

const PRESETS: Record<
  Variant,
  {
    icon: LucideIcon;
    title: string;
    body: string;
    actionLabel?: string;
  }
> = {
  no_bounties: {
    icon: Compass,
    title: "No active bounties right now",
    body: "Be the first to create one.",
    actionLabel: "Create a bounty",
  },
  filters_too_narrow: {
    icon: FilterX,
    title: "No bounties match your filters",
    body: "Loosen the filters or reset to defaults.",
    actionLabel: "Clear filters",
  },
  no_eligible: {
    icon: ShieldQuestion,
    title: "No bounties match your profile yet",
    body: "Toggle “Show ineligible” to preview what's coming, or come back as your reputation grows.",
    actionLabel: "Show ineligible",
  },
};

export function EmptyState({ variant, onAction, className }: Props) {
  const preset = PRESETS[variant];
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-default bg-bg-surface px-8 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-bg-elevated text-text-tertiary">
        <preset.icon className="size-5" strokeWidth={2} />
      </span>
      <div className="space-y-1">
        <h3 className="text-h3 font-medium text-text-primary">
          {preset.title}
        </h3>
        <p className="max-w-prose text-small text-text-secondary">
          {preset.body}
        </p>
      </div>
      {onAction && preset.actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="press mt-2 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-accent-primary px-4 py-2 text-small font-medium text-[#0E0E10] hover:bg-accent-hover"
        >
          <RefreshCw className="size-3.5" strokeWidth={2.25} />
          {preset.actionLabel}
        </button>
      )}
    </div>
  );
}
