"use client";

import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { MATCH_TYPES } from "@/lib/validation/bounty";
import { cn } from "@/lib/utils";
import type { TextActionRules } from "@/types/database";

/**
 * Shared rules builder used by both reply and quote sections in the
 * create-bounty form. Reply and quote use the same `TextActionRules`
 * shape, so the UI is identical — only the surrounding section title
 * and the tester subtitle differ.
 *
 * Phase 6 refinement: dropped the "must include N of pool" subsection.
 * Three building blocks remain — required keywords, forbidden keywords,
 * length requirements — plus the match type radio.
 */
type Props = {
  value: TextActionRules;
  onChange: (next: TextActionRules) => void;
  /** Placeholder text for the "must include" tag input. */
  requiredPlaceholder?: string;
  /** Placeholder text for the "forbidden" tag input. */
  forbiddenPlaceholder?: string;
};

export function TextActionRulesBuilder({
  value,
  onChange,
  requiredPlaceholder = "Add keywords… e.g. $BNTY, launch",
  forbiddenPlaceholder = "e.g. scam, rug",
}: Props) {
  const set = <K extends keyof TextActionRules>(
    key: K,
    v: TextActionRules[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-5">
      <Block
        label="Must include keywords"
        hint="Every entry must appear in the text."
      >
        <TagInput
          value={value.mustContainAll}
          onChange={(next) => set("mustContainAll", next)}
          placeholder={requiredPlaceholder}
          variant="lavender"
        />
      </Block>

      <Block
        label="Forbidden keywords"
        hint="Replies containing any of these are auto-rejected."
      >
        <TagInput
          value={value.forbidden}
          onChange={(next) => set("forbidden", next)}
          placeholder={forbiddenPlaceholder}
          variant="amber"
        />
      </Block>

      <Block label="Length requirements" hint="0 disables the check.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-caption text-text-tertiary">
            <span>Min chars</span>
            <Input
              type="number"
              min={0}
              max={1000}
              value={value.minLength}
              onChange={(e) =>
                set("minLength", clamp(Number(e.target.value || 0), 0, 1000))
              }
              className="h-8 w-20 px-2 text-small tabular-nums"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-caption text-text-tertiary">
            <span>Min words</span>
            <Input
              type="number"
              min={0}
              max={200}
              value={value.minWordCount}
              onChange={(e) =>
                set(
                  "minWordCount",
                  clamp(Number(e.target.value || 0), 0, 200),
                )
              }
              className="h-8 w-20 px-2 text-small tabular-nums"
            />
          </label>
        </div>
      </Block>

      <Block label="Match type">
        <div className="flex gap-2">
          {MATCH_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("matchType", t)}
              className={cn(
                "press rounded-[var(--radius-pill)] px-3 py-1 text-caption transition-colors",
                value.matchType === t
                  ? "bg-accent-soft text-accent-text"
                  : "bg-bg-elevated text-text-secondary hover:text-text-primary",
              )}
            >
              {t === "word" ? "Whole word" : "Substring"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-caption text-text-tertiary">
          Whole word: `$BNTY` matches `$BNTY`, not `BNTYx`. Substring: any
          occurrence counts.
        </p>
      </Block>
    </div>
  );
}

function Block({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-small font-medium text-text-primary">{label}</h3>
      {hint && (
        <p className="mb-2 mt-0.5 text-caption text-text-tertiary">{hint}</p>
      )}
      {children}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}
