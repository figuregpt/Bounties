"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Free-form keyword input used by the reply-rules section of /create.
 * Behavior:
 *   • Enter or comma commits the current value as a tag
 *   • Pasting `kw1, kw2, kw3` splits + commits each
 *   • Backspace on empty input removes the most-recent tag
 *   • Click ✕ to remove a tag
 *   • Duplicates are dropped silently
 */

export type TagInputVariant = "lavender" | "amber" | "neutral";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  variant?: TagInputVariant;
  maxTags?: number;
  /** Max chars per tag. */
  maxLength?: number;
  className?: string;
};

export function TagInput({
  value,
  onChange,
  placeholder,
  variant = "lavender",
  maxTags = 20,
  maxLength = 60,
  className,
}: Props) {
  const [draft, setDraft] = useState("");

  const commit = useCallback(
    (raw: string) => {
      const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.slice(0, maxLength));
      if (parts.length === 0) return;
      const set = new Set(value.map((v) => v.toLowerCase()));
      const additions: string[] = [];
      for (const p of parts) {
        if (set.has(p.toLowerCase())) continue;
        if (value.length + additions.length >= maxTags) break;
        set.add(p.toLowerCase());
        additions.push(p);
      }
      if (additions.length > 0) onChange([...value, ...additions]);
    },
    [maxLength, maxTags, onChange, value],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) {
        commit(draft);
        setDraft("");
      }
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const palette = paletteFor(variant);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-[10px] border border-border-default bg-bg-base px-2.5 py-2 transition-colors focus-within:border-accent-primary",
        className,
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className={cn(
            "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-small font-medium",
            palette.tag,
          )}
        >
          <span className={palette.text}>{tag}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== tag))}
            aria-label={`Remove ${tag}`}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X className="size-3" strokeWidth={2.25} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text.includes(",")) {
            e.preventDefault();
            commit(text);
            setDraft("");
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft);
            setDraft("");
          }
        }}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-small text-text-primary placeholder:text-text-quaternary focus:outline-none"
        maxLength={maxLength}
      />
    </div>
  );
}

function paletteFor(variant: TagInputVariant): {
  tag: string;
  text: string;
} {
  switch (variant) {
    case "amber":
      return {
        tag: "bg-warning-soft",
        text: "text-warning line-through",
      };
    case "neutral":
      return {
        tag: "bg-bg-elevated",
        text: "text-text-secondary",
      };
    case "lavender":
    default:
      return {
        tag: "bg-accent-soft",
        text: "text-accent-text",
      };
  }
}
