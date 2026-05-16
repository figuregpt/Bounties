"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatHandle } from "@/lib/format";

type Props = {
  displayName: string | null;
  handle: string;
  avatarUrl: string | null;
  twitterVerified: boolean;
};

/**
 * Profile masthead. Avatar + name + handle on the left, copy / share
 * actions on the right. Wallet pill shows the *saved* DB address (for
 * public/shareable identity) — not the wallet-adapter's live state
 * (that's for sign-now context, lives in the user menu).
 */
export function ProfileHeader({
  displayName,
  handle,
  avatarUrl,
  twitterVerified,
}: Props) {
  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-14 shrink-0 border border-border-default sm:size-16">
        <AvatarImage src={avatarUrl ?? undefined} alt={`@${handle}`} />
        <AvatarFallback className="bg-accent-soft text-h3 text-accent-text">
          {(displayName ?? handle).charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-h2 font-medium">
            {displayName ?? formatHandle(handle)}
          </h1>
          {twitterVerified && (
            <span
              title="Verified on X"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-primary text-[#100F16]"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
          )}
        </div>
        <p className="mt-0.5 text-small text-text-secondary">
          {formatHandle(handle)}
        </p>
      </div>

      <ShareProfileButton handle={handle} />
    </div>
  );
}

function ShareProfileButton({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        const url =
          typeof window === "undefined"
            ? `/profile/${handle}`
            : `${window.location.origin}/profile/${handle}`;
        try {
          if (navigator.share) {
            await navigator.share({ url, title: `@${handle} on bounties.fm` });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* user dismissed or clipboard denied */
        }
      }}
      className="press grid size-9 place-items-center rounded-[10px] border border-border-default bg-bg-surface text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
      title="Share profile link"
      aria-label="Share profile link"
    >
      {copied ? (
        <Check className="size-4 text-success" strokeWidth={2.25} />
      ) : (
        <Share2 className="size-4" strokeWidth={2} />
      )}
    </button>
  );
}
