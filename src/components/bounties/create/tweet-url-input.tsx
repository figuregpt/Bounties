"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TweetEmbed } from "@/components/bounties/tweet-embed";
import { extractTweetId } from "@/lib/validation/bounty";
import type { TweetCachedData } from "@/types/database";

/**
 * Tweet URL input + live preview.
 *
 * Controlled component — `resolved` is owned by the parent form so we
 * never need to do synchronous cleanup state inside an effect. The
 * effect only owns the async fetch path and bumps a transient
 * `fetchState` for the loading + error UI affordances.
 */

export type TweetResolveResult = {
  tweetId: string;
  cached: TweetCachedData;
  authorHandle: string;
  authorAvatarUrl: string | null;
  /** True when twitterapi.io reports `isReply=true` (i.e. this tweet is
   *  itself a reply, not a top-level post). twitterapi.io's replies
   *  endpoint only enumerates *direct* replies to a tweet; hunters
   *  replying inside a deep thread don't show up. Surface this so the
   *  creator can swap to the root tweet before launching. */
  isReply: boolean;
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Current resolved tweet (parent-owned). */
  resolved: TweetResolveResult | null;
  onResolved: (result: TweetResolveResult | null) => void;
};

type FetchStatus = "loading" | "error" | "done";

export function TweetUrlInput({
  value,
  onChange,
  resolved,
  onResolved,
}: Props) {
  const [fetchState, setFetchState] = useState<{
    tweetId: string | null;
    status: FetchStatus;
    error: string | null;
  }>({
    tweetId: resolved?.tweetId ?? null,
    status: "done",
    error: null,
  });
  const versionRef = useRef(0);

  const parsedId = extractTweetId(value.trim());

  useEffect(() => {
    if (!parsedId) {
      // Tell the parent to clear stale resolved data. We don't touch
      // local fetchState here — it self-clears when the user types a
      // new valid id.
      if (resolved) onResolved(null);
      return;
    }
    if (resolved?.tweetId === parsedId) return;

    const version = ++versionRef.current;

    const handle = setTimeout(() => {
      // setState inside the timer callback (not the effect body itself)
      // keeps the React Compiler happy while still flipping the spinner
      // before the fetch resolves.
      setFetchState({ tweetId: parsedId, status: "loading", error: null });
      void (async () => {
        try {
          const res = await fetch("/api/bounties/fetch-tweet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tweetId: parsedId }),
          });
          const body = (await res.json()) as
            | {
                ok: true;
                tweet: {
                  id: string;
                  text: string;
                  createdAt: string | null;
                  isReply: boolean;
                  inReplyToTweetId: string | null;
                  author: {
                    id: string;
                    userName: string;
                    name: string | null;
                    profilePicture: string | null;
                  };
                  metrics: {
                    likes: number;
                    retweets: number;
                    replies: number;
                    quotes: number;
                  };
                };
              }
            | { ok: false; error: string };
          if (versionRef.current !== version) return;
          if (!res.ok || !body.ok) {
            setFetchState({
              tweetId: parsedId,
              status: "error",
              error: "error" in body ? body.error : `HTTP ${res.status}`,
            });
            return;
          }
          const result: TweetResolveResult = {
            tweetId: body.tweet.id,
            authorHandle: body.tweet.author.userName,
            authorAvatarUrl: body.tweet.author.profilePicture,
            isReply: Boolean(body.tweet.isReply),
            cached: {
              authorId: body.tweet.author.id,
              authorHandle: body.tweet.author.userName,
              authorName: body.tweet.author.name ?? body.tweet.author.userName,
              text: body.tweet.text,
              metrics: body.tweet.metrics,
              capturedAt: new Date().toISOString(),
            },
          };
          setFetchState({
            tweetId: parsedId,
            status: "done",
            error: null,
          });
          onResolved(result);
        } catch (err) {
          if (versionRef.current !== version) return;
          setFetchState({
            tweetId: parsedId,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }, 300);
    return () => clearTimeout(handle);
  }, [parsedId, resolved, onResolved]);

  const showLoading =
    parsedId != null &&
    fetchState.tweetId === parsedId &&
    fetchState.status === "loading";
  const showError =
    parsedId != null &&
    fetchState.tweetId === parsedId &&
    fetchState.status === "error";

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://x.com/username/status/123456…"
          className="h-12 pl-10 text-body"
        />
        <MessageSquare
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
          strokeWidth={2}
        />
        {showLoading && (
          <Loader
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-tertiary"
            strokeWidth={2}
          />
        )}
      </div>

      {showError && (
        <div className="flex items-start gap-2 rounded-[10px] border border-warning/15 bg-warning-soft px-3 py-2 text-small text-warning">
          <AlertCircle
            className="mt-0.5 size-3.5 shrink-0"
            strokeWidth={2.25}
          />
          <span>{fetchState.error ?? "Couldn't fetch tweet."}</span>
        </div>
      )}

      {resolved && (
        <div className="space-y-2">
          <TweetEmbed
            tweet={resolved.cached}
            authorAvatarUrl={resolved.authorAvatarUrl}
            variant="full"
          />
          {resolved.isReply && (
            <div className="flex items-start gap-2 rounded-[10px] border border-warning/30 bg-warning-soft px-3 py-2 text-small text-warning">
              <AlertCircle
                className="mt-0.5 size-3.5 shrink-0"
                strokeWidth={2.25}
              />
              <span>
                Bounties only work on main tweets for now — replies
                aren&apos;t supported. Pick the root post.
              </span>
            </div>
          )}
          <p className="text-caption text-text-tertiary">
            Make sure this is your tweet or that you have permission to promote it.
          </p>
        </div>
      )}
    </div>
  );
}
