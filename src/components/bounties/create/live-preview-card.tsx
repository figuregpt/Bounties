"use client";

import {
  Eye,
  MessageCircle,
  Quote,
  Repeat2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TokenChip } from "@/components/bounties/token-chip";
import { SafeTokenAvatar } from "@/components/bounties/token-avatar";
import { TweetEmbed } from "@/components/bounties/tweet-embed";
import { useNow } from "@/hooks/useNow";
import {
  formatTimeRemaining,
  formatTokenAmount,
  formatUsd,
} from "@/lib/format";
import type {
  ActionConfig,
  TweetCachedData,
} from "@/types/database";

/**
 * Live preview of the bounty as it'll appear on /discover, sticky in
 * the right column of /create.
 *
 * Driven by the live form snapshot — missing fields render dimmed
 * placeholders ("—", "Untitled bounty", etc.) so the card stays the
 * exact shape and footprint a real BountyCard would take.
 */
type Props = {
  tweet: TweetCachedData | null;
  authorAvatarUrl: string | null;
  actions: ActionConfig;
  rewardSymbol: string;
  rewardTokenCategory: string | null;
  rewardTokenLogoUrl?: string | null;
  rewardTokenIsAdminVerified?: boolean;
  rewardPerHunter: number;
  rewardPerHunterUsd: number | null;
  maxHunters: number;
  durationHours: number;
};

export function LivePreviewCard({
  tweet,
  authorAvatarUrl,
  actions,
  rewardSymbol,
  rewardTokenCategory,
  rewardTokenLogoUrl,
  rewardTokenIsAdminVerified,
  rewardPerHunter,
  rewardPerHunterUsd,
  maxHunters,
  durationHours,
}: Props) {
  const now = useNow();
  const endsAt = new Date(now + durationHours * 3600 * 1000);
  const totalPool = rewardPerHunter * maxHunters;
  const totalPoolUsd =
    rewardPerHunterUsd != null ? rewardPerHunterUsd * maxHunters : null;

  return (
    <aside className="space-y-2">
      <p className="text-caption uppercase tracking-wider text-text-tertiary">
        Preview · feed card
      </p>
      <div className="rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <SafeTokenAvatar
              logoUrl={rewardTokenLogoUrl ?? null}
              symbol={rewardSymbol}
              category={rewardTokenCategory}
              size={36}
              isAdminVerified={rewardTokenIsAdminVerified}
            />
            <div className="min-w-0">
              <p className="text-body font-medium text-text-primary">
                {rewardSymbol} bounty
              </p>
              <p className="truncate text-caption text-text-tertiary">
                {tweet?.authorHandle ? `by @${tweet.authorHandle}` : "by you"}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-success-soft px-2.5 py-1 text-caption uppercase text-success">
            <span className="size-1.5 rounded-full bg-success" />
            Live
          </span>
        </div>

        {/* Tweet preview */}
        {tweet ? (
          <TweetEmbed
            tweet={tweet}
            authorAvatarUrl={authorAvatarUrl}
            className="mt-3"
          />
        ) : (
          <div className="mt-3 rounded-[11px] border border-dashed border-border-default bg-bg-tweet px-3 py-6 text-center text-caption text-text-tertiary">
            <Eye className="mx-auto mb-1 size-3.5" strokeWidth={2} />
            Paste a tweet URL to preview
          </div>
        )}

        {/* Action chips */}
        <ActionChips actions={actions} />

        {/* Progress placeholder */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
            <div className="h-full w-0 rounded-full bg-accent-primary" />
          </div>
          <span
            className="font-mono text-caption text-text-tertiary tabular-nums"
            data-numeric
          >
            0/{maxHunters}
          </span>
        </div>
        {/* `formatTimeRemaining` rounds by hour buckets, so a small
            wall-clock drift between SSR and hydration (a couple
            seconds) can flip the label from "24 hours left" to
            "1 day left". Equally, `toLocaleString` with no explicit
            locale uses the runtime's default which can differ between
            server and browser. Both render to the same `<p>` so a
            single `suppressHydrationWarning` covers it. */}
        <p
          className="mt-1 text-caption text-text-tertiary"
          suppressHydrationWarning
        >
          {formatTimeRemaining(endsAt)} · ends{" "}
          {endsAt.toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>

        {/* Footer */}
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div
              className="flex items-baseline gap-1.5 font-mono text-[20px] tabular-nums text-accent-text"
              data-numeric
            >
              <span>
                {rewardPerHunter > 0
                  ? formatTokenAmount(rewardPerHunter)
                  : "—"}
              </span>
              <span className="text-small text-text-secondary">
                {rewardSymbol}
              </span>
            </div>
            <p
              className="font-mono text-caption text-text-tertiary tabular-nums"
              data-numeric
            >
              pool · {totalPool > 0 ? formatTokenAmount(totalPool) : "—"}{" "}
              {rewardSymbol}
              {totalPoolUsd != null && (
                <> · {formatUsd(totalPoolUsd)}</>
              )}
            </p>
          </div>
          <TokenChip
            size="sm"
            symbol={rewardSymbol}
            category={rewardTokenCategory}
            amount={rewardPerHunter > 0 ? rewardPerHunter : null}
          />
        </div>
      </div>
    </aside>
  );
}

function ActionChips({ actions }: { actions: ActionConfig }) {
  const items: { icon: LucideIcon; label: string; on: boolean }[] = [
    { icon: MessageCircle, label: "Reply", on: actions.reply.required },
    { icon: Repeat2, label: "RT", on: actions.retweet },
    {
      icon: UserPlus,
      label: actions.follow.targetHandle
        ? `Follow @${actions.follow.targetHandle}`
        : "Follow",
      on: actions.follow.required,
    },
    { icon: Quote, label: "Quote", on: actions.quote.required },
  ];
  const present = items.filter((i) => i.on);
  if (present.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {present.map((i) => (
        <span
          key={i.label}
          className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-accent-soft px-2.5 py-1 text-caption font-medium text-accent-text"
        >
          <i.icon className="size-3" strokeWidth={2} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
