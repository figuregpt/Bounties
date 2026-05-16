import {
  Check,
  ChevronDown,
  MessageCircle,
  Quote,
  Repeat2,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ActionConfig,
  Claim,
  ReplyRules,
} from "@/types/database";

/**
 * Renders the active actions (reply / RT / follow / quote) as a
 * checklist. Three render modes:
 *   • "todo"      → outline circles, used before the hunt starts
 *   • "verified"  → success states drawn from `claim.{retweet,reply,…}Verified`
 *   • "failed"    → amber X on any explicitly false verification
 *
 * Like was removed in Phase 6 (twitterapi.io's likers endpoint only
 * returns the most-recent ~100 likers, so verification was unreliable
 * on viral posts). Follow verification will run against a cached
 * follower list in Phase 7 — for now the row just renders the target
 * handle from the bounty config.
 *
 * Reply row optionally expands a compact summary of the rules so users
 * don't need to scroll to the dedicated section for a quick glance.
 */

type Props = {
  actionConfig: ActionConfig;
  claim?: Claim | null;
  /** Hide the reply rules summary inside the reply row. */
  hideReplyInline?: boolean;
};

export function ActionChecklist({
  actionConfig,
  claim,
  hideReplyInline,
}: Props) {
  const rows = [
    {
      key: "reply" as const,
      icon: MessageCircle,
      label: "Reply to the tweet",
      enabled: actionConfig.reply.required,
      status: tristate(claim?.replyVerified),
      replyRules: actionConfig.reply.rules,
    },
    {
      key: "retweet" as const,
      icon: Repeat2,
      label: "Retweet",
      enabled: actionConfig.retweet,
      status: tristate(claim?.retweetVerified),
    },
    {
      key: "follow" as const,
      icon: UserPlus,
      label: actionConfig.follow.targetHandle
        ? `Follow @${actionConfig.follow.targetHandle}`
        : "Follow the target account",
      enabled: actionConfig.follow.required,
      status: tristate(claim?.followVerified),
    },
    {
      key: "quote" as const,
      icon: Quote,
      label: "Quote the tweet",
      enabled: actionConfig.quote.required,
      status: tristate(claim?.quoteVerified),
    },
  ].filter((r) => r.enabled);

  if (rows.length === 0) {
    return (
      <p className="text-small text-text-tertiary">
        No actions required — just claim the reward.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-bg-surface">
      {rows.map((r) => (
        <li key={r.key}>
          <Row
            icon={r.icon}
            label={r.label}
            status={r.status}
            badge={r.key === "reply" && !claim ? "With rules" : null}
            replyRules={r.key === "reply" && !hideReplyInline ? r.replyRules : null}
          />
        </li>
      ))}
    </ul>
  );
}

/* =========================================================================
   Sub-components
   ========================================================================= */

type Status = "todo" | "done" | "failed";

function Row({
  icon: Icon,
  label,
  status,
  badge,
  replyRules,
}: {
  icon: LucideIcon;
  label: string;
  status: Status;
  badge?: string | null;
  replyRules?: ReplyRules | null;
}) {
  return (
    <details
      className={cn(
        "group",
        replyRules ? "open:bg-bg-elevated/40" : "",
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer items-center gap-3 px-4 py-3",
          replyRules ? "" : "[&::-webkit-details-marker]:hidden list-none",
        )}
      >
        <StatusCircle status={status} />
        <div className="flex flex-1 items-center gap-2">
          <Icon
            className={cn(
              "size-4",
              status === "done"
                ? "text-success"
                : status === "failed"
                  ? "text-warning"
                  : "text-text-secondary",
            )}
            strokeWidth={2}
          />
          <span className="text-body text-text-primary">{label}</span>
          {badge && (
            <span className="inline-flex items-center rounded-[var(--radius-pill)] bg-accent-soft px-2 py-0.5 text-caption uppercase tracking-wider text-accent-text">
              {badge}
            </span>
          )}
        </div>
        {replyRules && (
          <ChevronDown
            className="size-4 text-text-tertiary transition-transform group-open:rotate-180"
            strokeWidth={2}
          />
        )}
      </summary>
      {replyRules && (
        <div className="space-y-2 border-t border-border-subtle bg-bg-base px-4 py-3 text-caption text-text-secondary">
          <ReplyRulesSummary rules={replyRules} />
        </div>
      )}
    </details>
  );
}

function StatusCircle({ status }: { status: Status }) {
  if (status === "done") {
    return (
      <span className="grid size-6 place-items-center rounded-full bg-accent-primary text-[#0E0E10]">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="grid size-6 place-items-center rounded-full bg-warning-soft text-warning">
        <X className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="size-6 rounded-full border border-border-hover" />
  );
}

function ReplyRulesSummary({ rules }: { rules: ReplyRules }) {
  const items: string[] = [];
  if (rules.mustContainAll?.length) {
    items.push(`Must include: ${rules.mustContainAll.join(", ")}`);
  }
  if (rules.forbidden?.length) {
    items.push(`Cannot include: ${rules.forbidden.join(", ")}`);
  }
  if (rules.minLength > 0 || rules.minWordCount > 0) {
    const parts = [];
    if (rules.minLength > 0) parts.push(`${rules.minLength} chars`);
    if (rules.minWordCount > 0) parts.push(`${rules.minWordCount} words`);
    items.push(`Min length: ${parts.join(" / ")}`);
  }
  if (items.length === 0) {
    return <p>No additional rules.</p>;
  }
  return (
    <ul className="space-y-1 list-disc list-inside">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

function tristate(v: boolean | null | undefined): Status {
  if (v === true) return "done";
  if (v === false) return "failed";
  return "todo";
}
