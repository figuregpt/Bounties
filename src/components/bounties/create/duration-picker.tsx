"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DURATION_HOURS_OPTIONS,
  type DurationHours,
} from "@/lib/validation/bounty";
import { useNow } from "@/hooks/useNow";

const LABELS: Record<DurationHours, string> = {
  6: "6h",
  12: "12h",
  24: "24h",
  48: "48h",
  72: "72h",
};

type Props = {
  value: DurationHours;
  onChange: (next: DurationHours) => void;
};

export function DurationPicker({ value, onChange }: Props) {
  const now = useNow();
  const endsAt = useMemo(
    () => new Date(now + value * 60 * 60 * 1000),
    [now, value],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {DURATION_HOURS_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "press rounded-[var(--radius-pill)] px-4 py-1.5 text-small font-medium transition-colors",
              value === opt
                ? "bg-accent-primary text-[#0E0E10]"
                : "bg-bg-elevated text-text-secondary hover:text-text-primary",
            )}
          >
            {LABELS[opt]}
          </button>
        ))}
      </div>
      <p className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
        <Clock className="size-3" strokeWidth={2} />
        Bounty ends · {endsAt.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>
    </div>
  );
}
