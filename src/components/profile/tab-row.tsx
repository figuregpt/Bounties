"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ProfileTab = "to_claim" | "hunting" | "created" | "history";

type Props = {
  active: ProfileTab;
  counts: {
    to_claim: number;
    hunting: number;
    created: number;
    history: number;
  };
  /** Subset of tabs to render. Defaults to all four. Public/other-user
   *  profile views pass `["created", "history"]` to hide private tabs. */
  visibleTabs?: readonly ProfileTab[];
  onChange: (next: ProfileTab) => void;
};

const ALL_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "to_claim", label: "Claim" },
  { id: "hunting", label: "Hunting" },
  // ID stays `history` for internal stability; label is the user-facing
  // "Hunted" (past hunts, terminal outcomes).
  { id: "history", label: "Hunted" },
  { id: "created", label: "Created" },
];

/**
 * Pill tab row. Lavender accent on the active tab via a shared layoutId
 * spring (continuous motion between tabs). Counts are inline — `0`
 * states are dimmed but still rendered so users can see the breakdown
 * at a glance.
 *
 * Horizontal scroll on overflow (rare — labels are short) for narrow
 * viewports without imposing a separate mobile menu.
 */
export function TabRow({ active, counts, visibleTabs, onChange }: Props) {
  const tabs = visibleTabs
    ? ALL_TABS.filter((t) => visibleTabs.includes(t.id))
    : ALL_TABS;
  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <div className="inline-flex min-w-full gap-1 rounded-[var(--radius-pill)] bg-bg-elevated p-1">
        {tabs.map((t) => {
          const isActive = active === t.id;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                "press relative inline-flex h-10 min-w-[88px] items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] px-4 text-small font-medium transition-colors",
                isActive ? "text-accent-text" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="profile-tab-pill"
                  className="absolute inset-0 -z-10 rounded-[var(--radius-pill)] bg-accent-soft"
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                />
              )}
              <span>{t.label}</span>
              {count != null && (
                <span
                  className={cn(
                    "font-mono text-caption tabular-nums",
                    isActive ? "text-accent-text" : "text-text-tertiary",
                    count === 0 && "opacity-50",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
