"use client";

import { useEffect, useState } from "react";
import {
  MessageCircle,
  Quote,
  Repeat2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import type { ActionConfig } from "@/types/database";

/**
 * Vertical stack of action toggle rows.
 *
 * Phase 6 refinement: Like was removed because twitterapi.io only
 * exposes the most-recent ~100 likers per tweet, which makes
 * verification unreliable on viral posts.
 *
 * Order: Reply → Retweet → Follow → Quote. Reply leads because it
 * triggers the rules section below and tends to be the most valuable
 * engagement type.
 *
 * Follow uniquely needs a target handle input. When toggled on we
 * reveal an inline `<Input>` directly under the row, pre-filled with
 * the tweet author's handle (passed in from the parent form).
 */
type Props = {
  value: ActionConfig;
  onChange: (next: ActionConfig) => void;
  /** Default handle pre-filled into the follow target input when the
   *  user first flips Follow on. Usually the tweet author. */
  suggestedFollowHandle?: string | null;
};

type RowKey = "reply" | "retweet" | "follow" | "quote";

const ROWS: Array<{
  key: RowKey;
  label: string;
  hint: string;
  icon: typeof MessageCircle;
}> = [
  {
    key: "reply",
    label: "Reply",
    hint: "Lets you require specific keywords or length.",
    icon: MessageCircle,
  },
  {
    key: "retweet",
    label: "Retweet",
    hint: "Amplifies the tweet to the hunter's followers.",
    icon: Repeat2,
  },
  {
    key: "follow",
    label: "Follow",
    hint: "Hunters must follow an account before claiming.",
    icon: UserPlus,
  },
  {
    key: "quote",
    label: "Quote tweet",
    hint: "Hunter posts their own framing of your tweet.",
    icon: Quote,
  },
];

export function ActionToggles({
  value,
  onChange,
  suggestedFollowHandle,
}: Props) {
  // Auto-fill the follow target handle the first time we receive a
  // suggested value AND the follow toggle isn't already configured.
  useEffect(() => {
    if (
      suggestedFollowHandle &&
      !value.follow.targetHandle &&
      !value.follow.required
    ) {
      onChange({
        ...value,
        follow: {
          required: false,
          targetHandle: suggestedFollowHandle.replace(/^@/, "").toLowerCase(),
        },
      });
    }
    // We only want to seed on suggestion change, not on every render. The
    // toggle handler keeps things in sync after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedFollowHandle]);

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-bg-base">
      {ROWS.map((row, i) => {
        const enabled = isEnabled(value, row.key);
        const flip = () => onChange(toggleAction(value, row.key, !enabled));
        return (
          <div key={row.key}>
            <label
              htmlFor={`action-${row.key}`}
              onClick={(e) => {
                if (
                  e.target instanceof HTMLElement &&
                  e.target.closest("[role=switch]")
                ) {
                  return;
                }
                e.preventDefault();
                flip();
              }}
              className={cn(
                "flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors",
                i > 0 && "border-t border-border-subtle",
                enabled
                  ? "bg-accent-soft/30 text-text-primary"
                  : "hover:bg-bg-elevated/60",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-[10px]",
                  enabled
                    ? "bg-accent-primary text-[#0E0E10]"
                    : "bg-bg-elevated text-text-secondary",
                )}
              >
                <row.icon className="size-4" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body text-text-primary">{row.label}</p>
                <p className="text-caption text-text-tertiary">{row.hint}</p>
              </div>
              <Switch
                id={`action-${row.key}`}
                checked={enabled}
                onChange={flip}
                aria-label={row.label}
                className="mt-1"
              />
            </label>

            {row.key === "follow" && enabled && (
              <FollowTargetInput
                value={value.follow.targetHandle}
                suggested={suggestedFollowHandle}
                onChange={(next) =>
                  onChange({
                    ...value,
                    follow: {
                      required: true,
                      targetHandle: next.replace(/^@/, "").toLowerCase(),
                    },
                  })
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================================
   Follow target handle input
   ========================================================================= */

function FollowTargetInput({
  value,
  suggested,
  onChange,
}: {
  value: string;
  suggested?: string | null;
  onChange: (next: string) => void;
}) {
  const [touched, setTouched] = useState(value.length > 0);
  const handle = value || suggested?.replace(/^@/, "") || "";

  return (
    <div className="space-y-1.5 border-t border-border-subtle bg-bg-base px-4 py-3">
      <label className="text-caption text-text-tertiary">
        Account hunters must follow
      </label>
      <Input
        value={touched ? value : handle}
        onChange={(e) => {
          setTouched(true);
          onChange(e.target.value);
        }}
        placeholder={suggested ? `@${suggested}` : "@username"}
        className="font-mono tabular-nums"
      />
      <p className="text-caption text-text-quaternary">
        Verified via the account&rsquo;s follower list at claim time.
      </p>
    </div>
  );
}

/* =========================================================================
   Helpers
   ========================================================================= */

function isEnabled(cfg: ActionConfig, key: RowKey): boolean {
  if (key === "reply") return cfg.reply.required;
  if (key === "quote") return cfg.quote.required;
  if (key === "follow") return cfg.follow.required;
  return cfg.retweet;
}

function toggleAction(
  cfg: ActionConfig,
  key: RowKey,
  next: boolean,
): ActionConfig {
  switch (key) {
    case "reply":
      return { ...cfg, reply: { ...cfg.reply, required: next } };
    case "quote":
      return { ...cfg, quote: { ...cfg.quote, required: next } };
    case "follow":
      return { ...cfg, follow: { ...cfg.follow, required: next } };
    case "retweet":
      return { ...cfg, retweet: next };
  }
}
