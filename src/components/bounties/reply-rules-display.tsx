import { Ban, Check, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TextActionRules } from "@/types/database";
import { rulesAreEmpty } from "@/lib/bounties/verify-reply";

/**
 * Read-only display of every constraint inside a `TextActionRules`
 * payload. The matching tester (`<TextActionTester />`) renders the
 * editable surface; this component is just the legend.
 *
 * Phase 6.3: shared by reply AND quote requirements — the surrounding
 * section title disambiguates which action the rules belong to.
 *
 * Each subsection only appears if it has content — so a bounty that
 * only forbids a keyword shows a single block, not four empty ones.
 */
export function ReplyRulesDisplay({
  rules,
  emptyHint = "No additional rules — any reply counts.",
}: {
  rules: TextActionRules;
  /** Override copy when the same component is used for quote rules. */
  emptyHint?: string;
}) {
  if (rulesAreEmpty(rules)) {
    return <p className="text-small text-text-tertiary">{emptyHint}</p>;
  }

  return (
    <div className="space-y-4">
      {rules.mustContainAll && rules.mustContainAll.length > 0 && (
        <Block icon={Check} label="Must include all of">
          <Chips items={rules.mustContainAll} tone="positive" />
        </Block>
      )}

      {rules.forbidden && rules.forbidden.length > 0 && (
        <Block icon={Ban} label="Cannot include">
          <Chips items={rules.forbidden} tone="forbidden" />
        </Block>
      )}

      {(rules.minLength > 0 || rules.minWordCount > 0) && (
        <Block icon={Type} label="Length requirements">
          <p className="text-small text-text-secondary">
            {[
              rules.minLength > 0
                ? `Minimum ${rules.minLength} characters`
                : null,
              rules.minWordCount > 0
                ? `${rules.minWordCount} words`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </Block>
      )}

      <p className="text-caption uppercase tracking-wider text-text-tertiary">
        Match type ·{" "}
        {rules.matchType === "word"
          ? "whole-word match (e.g. $BNTY matches, B not BNTYx)"
          : "substring match (any occurrence counts)"}
      </p>
    </div>
  );
}

/* =========================================================================
   Sub-components
   ========================================================================= */

function Block({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Check;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-caption uppercase tracking-wider text-text-tertiary">
        <Icon className="size-3.5" strokeWidth={2.25} />
        {label}
      </div>
      {children}
    </div>
  );
}

function Chips({
  items,
  tone,
}: {
  items: string[];
  tone: "positive" | "forbidden";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((kw) => (
        <span
          key={kw}
          className={cn(
            "inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-small",
            tone === "positive" &&
              "bg-accent-soft text-accent-text font-medium",
            tone === "forbidden" &&
              "bg-warning-soft text-warning line-through",
          )}
        >
          {kw}
        </span>
      ))}
    </div>
  );
}
