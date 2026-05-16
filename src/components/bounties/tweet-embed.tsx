"use client";

import { useState } from "react";
import { Heart, MessageCircle, Repeat2, Quote } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  formatCompact,
  formatHandle,
  formatRelativeTime,
} from "@/lib/format";
import type { TweetCachedData } from "@/types/database";

/**
 * Inline tweet preview. We cache the tweet snapshot at bounty creation
 * (see Phase 2 schema → bounties.tweetCachedData) and render it without
 * hitting the network — feed pages stay fast and look identical to the
 * Twitter UI without an embed iframe.
 *
 * The "show more" affordance is purely cosmetic; the full text always
 * lives in the cached JSON, so clicking the bounty card opens the detail
 * page which can render it in full.
 */

type Props = {
  tweet: TweetCachedData;
  authorAvatarUrl?: string | null;
  /** "preview" = inline in a card, single tight block. "full" = detail view. */
  variant?: "preview" | "full";
  className?: string;
};

export function TweetEmbed({
  tweet,
  authorAvatarUrl,
  variant = "preview",
  className,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const truncate = variant === "preview" && !expanded;
  const showMoreVisible =
    truncate &&
    (tweet.text.length > 180 || tweet.text.split("\n").length > 3);

  const initial = (tweet.authorName || tweet.authorHandle).charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "rounded-[11px] border border-border-subtle bg-bg-tweet p-3",
        className,
      )}
    >
      {/* Header --------------------------------------------------------- */}
      <div className="flex items-center gap-2">
        <Avatar className="size-4">
          <AvatarImage src={authorAvatarUrl ?? undefined} alt="" />
          <AvatarFallback className="bg-accent-soft text-[8px] uppercase text-accent-text">
            {initial}
          </AvatarFallback>
        </Avatar>
        <span className="text-caption font-medium text-text-primary">
          {tweet.authorName || tweet.authorHandle}
        </span>
        <span className="text-caption text-text-tertiary">
          {formatHandle(tweet.authorHandle)}
        </span>
        <span className="text-caption text-text-quaternary">·</span>
        <span className="text-caption text-text-tertiary">
          {formatRelativeTime(tweet.capturedAt)}
        </span>
      </div>

      {/* Body ----------------------------------------------------------- */}
      <p
        className={cn(
          "mt-2 whitespace-pre-line text-small text-text-secondary",
          truncate && "line-clamp-3",
        )}
      >
        {tweet.text}
        {showMoreVisible && (
          <>
            {" "}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(true);
              }}
              className="text-accent-text hover:text-accent-hover"
            >
              show more
            </button>
          </>
        )}
      </p>

      {/* Footer metrics ------------------------------------------------ */}
      <div className="mt-3 flex items-center gap-3 text-caption text-text-tertiary">
        <Metric icon={Heart} value={tweet.metrics.likes} />
        <Metric icon={Repeat2} value={tweet.metrics.retweets} />
        <Metric icon={MessageCircle} value={tweet.metrics.replies} />
        {tweet.metrics.quotes > 0 && (
          <Metric icon={Quote} value={tweet.metrics.quotes} />
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  value,
}: {
  icon: typeof Heart;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3" strokeWidth={2} />
      <span className="tabular-nums" data-numeric>
        {formatCompact(value)}
      </span>
    </span>
  );
}
