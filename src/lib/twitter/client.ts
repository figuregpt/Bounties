import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { apiCallLog } from "@/lib/db/schema";
import type { ApiService } from "@/types/database";

/**
 * twitterapi.io REST client.
 *
 * Phase 3 only ships `getUserInfo` (the onboarding profile fetch).
 * Tweet + engager endpoints are typed-stub'd so callers can wire them
 * without import churn when Phase 5+ lands.
 *
 * Every request:
 *  • routes through `request()`, which centralizes auth, retries, timing
 *    and apiCallLog persistence
 *  • logs to api_call_log with a cost estimate even on failure — that
 *    table is the canary for Twitter spend
 *  • retries on 429 / 5xx up to 3 times with jittered exponential backoff
 */

export const TWITTER_API_BASE = "https://api.twitterapi.io";
const SERVICE: ApiService = "twitterapi";

/** Cost estimates from the twitterapi.io pricing page (USD per call). */
const COST = {
  userInfo: 0.00018,
  tweetById: 0.00015,
  engagers: 0.00015,
  replies: 0.00015,
  followRelationship: 0.001,
} as const;

/* =========================================================================
   Response shapes — only the fields we actually consume. The full payload
   is preserved by callers via `twitterRawProfile`, so we can extend later
   without re-fetching.
   ========================================================================= */

export type TwitterUserInfo = {
  id: string;
  userName: string;
  name: string | null;
  profilePicture: string | null;
  coverPicture: string | null;
  description: string | null;
  location: string | null;
  /** twitterapi.io's primary field is `isBlueVerified`. Mapped here for
   *  our denormalized `users.twitter_verified` column. */
  isVerified: boolean;
  /** "government" | "business" | "" — Twitter's tier on top of blue check. */
  verifiedType: string | null;
  followers: number;
  following: number;
  statusesCount: number;
  mediaCount: number;
  favouritesCount: number;
  /** Twitter's classic RFC-2822-ish string, e.g. "Thu Dec 13 08:41:26 +0000 2007".
   *  `new Date()` parses it without help. */
  createdAt: string | null;
  /** Raw response so callers can persist it into twitterRawProfile. */
  raw: Record<string, unknown>;
};

/* =========================================================================
   Public methods
   ========================================================================= */

export type TwitterClientContext = {
  bountyId?: string | null;
  claimId?: string | null;
  userId?: string | null;
};

export async function getUserInfo(
  handle: string,
  ctx: TwitterClientContext = {},
): Promise<TwitterUserInfo> {
  const userName = handle.replace(/^@/, "");
  const payload = await request<RawUserInfoEnvelope>({
    method: "GET",
    path: "/twitter/user/info",
    query: { userName },
    costUsd: COST.userInfo,
    ctx,
  });

  // The endpoint always wraps under `data`, but the top-level envelope
  // also carries `status: "success" | "error"` and an optional `msg`.
  if (payload.status === "error") {
    throw new Error(
      `twitterapi.io error: ${payload.msg ?? "unknown error"}`,
    );
  }
  const data = (payload.data ?? payload) as RawTwitterUser;
  return {
    id: String(data.id ?? data.userId ?? data.rest_id ?? ""),
    userName: String(data.userName ?? data.screen_name ?? userName),
    name: data.name ?? null,
    profilePicture: data.profilePicture ?? data.profile_image_url ?? null,
    coverPicture: data.coverPicture ?? null,
    description: data.description ?? null,
    location: data.location ?? null,
    // Real payload uses `isBlueVerified`. Older mocks / fallbacks left in
    // for resilience.
    isVerified: Boolean(
      data.isBlueVerified ?? data.isVerified ?? data.verified ?? false,
    ),
    verifiedType: data.verifiedType ?? null,
    followers: Number(data.followers ?? data.followersCount ?? 0),
    following: Number(data.following ?? data.followingCount ?? 0),
    statusesCount: Number(data.statusesCount ?? data.tweetCount ?? 0),
    mediaCount: Number(data.mediaCount ?? 0),
    favouritesCount: Number(data.favouritesCount ?? 0),
    createdAt: data.createdAt ?? data.created_at ?? null,
    raw: payload as Record<string, unknown>,
  };
}

/* =========================================================================
   getTweetById — single tweet by id. Endpoint accepts a comma-separated
   list but we only ever pass one for the create-bounty preview path.
   ========================================================================= */

export type TwitterTweet = {
  id: string;
  text: string;
  createdAt: string | null;
  url: string | null;
  /** Parent tweet id when this tweet is a reply; null on top-level
   *  tweets. Sourced from twitterapi.io's `inReplyToId`. */
  inReplyToTweetId: string | null;
  /** Mirror of the API's own boolean. Equivalent to
   *  `inReplyToTweetId != null` but kept distinct in case the upstream
   *  semantics ever diverge (e.g. quote-replies). */
  isReply: boolean;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    views: number;
    bookmarks: number;
  };
  author: {
    id: string;
    userName: string;
    name: string | null;
    profilePicture: string | null;
    isVerified: boolean;
  };
  raw: Record<string, unknown>;
};

export async function getTweetById(
  tweetId: string,
  ctx: TwitterClientContext = {},
): Promise<TwitterTweet> {
  if (!/^\d{6,25}$/.test(tweetId)) {
    throw new Error(`Invalid tweet id: ${tweetId}`);
  }
  const payload = await request<RawTweetsEnvelope>({
    method: "GET",
    path: "/twitter/tweets",
    query: { tweet_ids: tweetId },
    costUsd: COST.tweetById,
    ctx,
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.message ?? "unknown error"}`);
  }
  const t = payload.tweets?.[0];
  if (!t) {
    throw new Error("Tweet not found or not public");
  }
  const author = t.author ?? {};
  const inReplyToId =
    typeof t.inReplyToId === "string" && t.inReplyToId.length > 0
      ? t.inReplyToId
      : null;
  return {
    id: String(t.id ?? tweetId),
    text: String(t.text ?? ""),
    createdAt: t.createdAt ?? null,
    url: t.url ?? null,
    inReplyToTweetId: inReplyToId,
    isReply: Boolean(t.isReply ?? inReplyToId != null),
    metrics: {
      likes: Number(t.likeCount ?? 0),
      retweets: Number(t.retweetCount ?? 0),
      replies: Number(t.replyCount ?? 0),
      quotes: Number(t.quoteCount ?? 0),
      views: Number(t.viewCount ?? 0),
      bookmarks: Number(t.bookmarkCount ?? 0),
    },
    author: {
      id: String(author.id ?? author.userId ?? ""),
      userName: String(author.userName ?? author.screen_name ?? ""),
      name: author.name ?? null,
      profilePicture: author.profilePicture ?? author.profile_image_url ?? null,
      isVerified: Boolean(
        author.isBlueVerified ?? author.isVerified ?? author.verified ?? false,
      ),
    },
    raw: t as unknown as Record<string, unknown>,
  };
}

/* ---- stubs (Phase 7+) ---------------------------------------------------- */

/**
 * @deprecated Phase 6 — twitterapi.io's `/twitter/tweet/likes` endpoint
 * only returns the most-recent ~100 likers per tweet. A bounty with
 * 100K likes can't reliably surface a hunter at position 5,000, so we
 * dropped Like as a required action. Kept exported for back-compat with
 * any out-of-tree code; throws on call.
 */
export async function getTweetLikers(
  _tweetId: string,
  _opts: { cursor?: string; ctx?: TwitterClientContext } = {},
): Promise<never> {
  throw new Error(
    "getTweetLikers is deprecated in Phase 6 — like verification was removed",
  );
}

/* =========================================================================
   Tweet engagers — used by Layer 1 verification.
   ========================================================================= */

export type RetweeterRow = {
  twitterId: string;
  handle: string;
  displayName: string | null;
};

export type TweetReplyRow = {
  tweetId: string;
  authorTwitterId: string;
  authorHandle: string;
  text: string;
  createdAt: string | null;
  inReplyToTweetId: string | null;
};

export type TweetQuoteRow = {
  tweetId: string;
  authorTwitterId: string;
  authorHandle: string;
  text: string;
  createdAt: string | null;
  quotedTweetId: string | null;
};

/**
 * One page of retweeters. Cursor advances forward; `null` cursor means
 * done. The endpoint orders by retweet time descending.
 */
export async function getTweetRetweeters(
  tweetId: string,
  opts: { cursor?: string | null; ctx?: TwitterClientContext } = {},
): Promise<{ retweeters: RetweeterRow[]; nextCursor: string | null }> {
  const payload = await request<RawRetweetersEnvelope>({
    method: "GET",
    path: "/twitter/tweet/retweeters",
    query: { tweetId, cursor: opts.cursor ?? undefined },
    costUsd: COST.engagers,
    ctx: opts.ctx ?? {},
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.message ?? "unknown"}`);
  }
  return {
    retweeters: (payload.users ?? []).map((u) => ({
      twitterId: String(u.id ?? ""),
      handle: String(u.userName ?? "").toLowerCase(),
      displayName: u.name ?? null,
    })),
    nextCursor: extractCursor(payload),
  };
}

/**
 * Tweet replies — paginated, ~20 per page. Caller filters by author.
 * The `tweetId` should be the root tweet of the conversation.
 */
export async function getTweetReplies(
  tweetId: string,
  opts: { cursor?: string | null; ctx?: TwitterClientContext } = {},
): Promise<{ replies: TweetReplyRow[]; nextCursor: string | null }> {
  const payload = await request<RawRepliesEnvelope>({
    method: "GET",
    path: "/twitter/tweet/replies",
    query: { tweetId, cursor: opts.cursor ?? undefined },
    costUsd: COST.replies,
    ctx: opts.ctx ?? {},
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.message ?? "unknown"}`);
  }
  return {
    replies: (payload.replies ?? payload.tweets ?? []).map((t) => ({
      tweetId: String(t.id ?? ""),
      authorTwitterId: String(t.author?.id ?? ""),
      authorHandle: String(t.author?.userName ?? "").toLowerCase(),
      text: String(t.text ?? ""),
      createdAt: t.createdAt ?? null,
      inReplyToTweetId: t.inReplyToId ?? null,
    })),
    nextCursor: extractCursor(payload),
  };
}

/**
 * Quote tweets — paginated, 20 per page. Order: quote time desc.
 */
export async function getTweetQuotes(
  tweetId: string,
  opts: { cursor?: string | null; ctx?: TwitterClientContext } = {},
): Promise<{ quotes: TweetQuoteRow[]; nextCursor: string | null }> {
  const payload = await request<RawQuotesEnvelope>({
    method: "GET",
    path: "/twitter/tweet/quotes",
    query: { tweetId, cursor: opts.cursor ?? undefined },
    costUsd: COST.replies,
    ctx: opts.ctx ?? {},
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.message ?? "unknown"}`);
  }
  return {
    quotes: (payload.quotes ?? payload.tweets ?? []).map((t) => ({
      tweetId: String(t.id ?? ""),
      authorTwitterId: String(t.author?.id ?? ""),
      authorHandle: String(t.author?.userName ?? "").toLowerCase(),
      text: String(t.text ?? ""),
      createdAt: t.createdAt ?? null,
      quotedTweetId: t.quotedTweetId ?? null,
    })),
    nextCursor: extractCursor(payload),
  };
}

/**
 * Whether @source follows @target. Used by Layer 1 follow verification.
 * twitterapi.io charges 100 credits per call (~$0.001).
 */
export async function checkFollowRelationship(
  sourceHandle: string,
  targetHandle: string,
  opts: { ctx?: TwitterClientContext } = {},
): Promise<{ following: boolean; followedBy: boolean }> {
  const payload = await request<RawFollowRelationshipEnvelope>({
    method: "GET",
    path: "/twitter/user/check_follow_relationship",
    query: {
      source_user_name: sourceHandle.replace(/^@/, "").toLowerCase(),
      target_user_name: targetHandle.replace(/^@/, "").toLowerCase(),
    },
    costUsd: COST.followRelationship,
    ctx: opts.ctx ?? {},
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.message ?? "unknown"}`);
  }
  // Some envelopes wrap booleans inside `data`, others use top-level —
  // accept both shapes.
  const d = (payload.data ?? payload) as RawFollowRelationship;
  return {
    following: Boolean(d.following ?? d.isFollowing ?? false),
    followedBy: Boolean(d.followedBy ?? d.isFollowedBy ?? false),
  };
}

/* =========================================================================
   Filter rules — Layer 2 streaming setup.
   The actual WebSocket connection happens in `src/worker/stream-client.ts`;
   these REST helpers manage the rule list that the stream filters on.
   ========================================================================= */

export type FilterRule = {
  id: string;
  tag: string;
  value: string;
  intervalSeconds: number;
  isActive?: boolean;
};

export async function addFilterRule(args: {
  tag: string;
  value: string;
  intervalSeconds?: number;
  ctx?: TwitterClientContext;
}): Promise<{ ruleId: string }> {
  const payload = await request<{
    rule_id?: string;
    ruleId?: string;
    status?: "success" | "error";
    msg?: string;
  }>({
    method: "POST",
    path: "/oapi/tweet_filter/add_rule",
    body: {
      tag: args.tag,
      value: args.value,
      interval_seconds: args.intervalSeconds ?? 60,
    },
    costUsd: 0, // No per-call cost documented for rule mgmt.
    ctx: args.ctx ?? {},
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.msg ?? "unknown"}`);
  }
  const ruleId = payload.rule_id ?? payload.ruleId;
  if (!ruleId) {
    throw new Error("twitterapi.io: missing rule id in response");
  }
  return { ruleId };
}

export async function listFilterRules(
  ctx: TwitterClientContext = {},
): Promise<FilterRule[]> {
  const payload = await request<{
    rules?: Array<{
      rule_id?: string;
      id?: string;
      tag?: string;
      value?: string;
      interval_seconds?: number;
      is_effect?: boolean;
    }>;
    status?: "success" | "error";
    msg?: string;
  }>({
    method: "GET",
    path: "/oapi/tweet_filter/get_rules",
    costUsd: 0,
    ctx,
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.msg ?? "unknown"}`);
  }
  return (payload.rules ?? []).map((r) => ({
    id: String(r.rule_id ?? r.id ?? ""),
    tag: String(r.tag ?? ""),
    value: String(r.value ?? ""),
    intervalSeconds: Number(r.interval_seconds ?? 60),
    isActive: r.is_effect,
  }));
}

export async function updateFilterRule(args: {
  ruleId: string;
  tag: string;
  value: string;
  intervalSeconds?: number;
  /** Default true — `add_rule` returns a rule that's inactive; you need
   *  to call `update_rule` with `is_effect: true` to start receiving
   *  events. */
  isEffect?: boolean;
  ctx?: TwitterClientContext;
}): Promise<void> {
  const payload = await request<{ status?: "success" | "error"; msg?: string }>({
    method: "POST",
    path: "/oapi/tweet_filter/update_rule",
    body: {
      rule_id: args.ruleId,
      tag: args.tag,
      value: args.value,
      interval_seconds: args.intervalSeconds ?? 60,
      is_effect: args.isEffect ?? true,
    },
    costUsd: 0,
    ctx: args.ctx ?? {},
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.msg ?? "unknown"}`);
  }
}

export async function deleteFilterRule(
  ruleId: string,
  ctx: TwitterClientContext = {},
): Promise<void> {
  const payload = await request<{ status?: "success" | "error"; msg?: string }>({
    method: "POST",
    path: "/oapi/tweet_filter/delete_rule",
    body: { rule_id: ruleId },
    costUsd: 0,
    ctx,
  });
  if (payload.status === "error") {
    throw new Error(`twitterapi.io error: ${payload.msg ?? "unknown"}`);
  }
}

/* =========================================================================
   Internal helpers
   ========================================================================= */

function extractCursor(envelope: {
  next_cursor?: string | null;
  next_cursor_str?: string | null;
  nextCursor?: string | null;
  has_next_page?: boolean;
  has_more?: boolean;
}): string | null {
  const cursor =
    envelope.next_cursor ??
    envelope.next_cursor_str ??
    envelope.nextCursor ??
    null;
  // twitterapi.io's docs warn: `has_more` can lie. We trust the cursor
  // string instead — if it's empty or missing, we stop paginating.
  if (typeof cursor !== "string" || cursor.length === 0) return null;
  if (envelope.has_next_page === false || envelope.has_more === false) {
    return null;
  }
  return cursor;
}

/* =========================================================================
   Follower list — backbone of the smart-followers reverse cache.
   ========================================================================= */

export type TwitterFollowerRow = {
  twitterId: string;
  handle: string;
  displayName: string | null;
};

export type FollowersPage = {
  followers: TwitterFollowerRow[];
  nextCursor: string | null;
};

/**
 * One page of a handle's follower list. Caller drives pagination by
 * threading the returned `nextCursor` into the next call; `null` means
 * we've reached the end.
 *
 * twitterapi.io's OpenAPI doesn't document the cursor field name, so we
 * accept the common variants seen in practice (`next_cursor`,
 * `next_cursor_str`, `nextCursor`). The "no more" signal is either a
 * missing cursor, an empty string, or `has_next_page: false`.
 *
 * Cost: each call charges ~`COST.engagers` (200 rows / page) — kept in
 * the cost table so cost reports include follower spend automatically.
 */
export async function getUserFollowers(
  handle: string,
  opts: {
    cursor?: string | null;
    pageSize?: number;
    ctx?: TwitterClientContext;
  } = {},
): Promise<FollowersPage> {
  const userName = handle.replace(/^@/, "").trim().toLowerCase();
  if (!userName) {
    throw new Error("getUserFollowers: handle is empty");
  }
  const payload = await request<RawFollowersEnvelope>({
    method: "GET",
    path: "/twitter/user/followers",
    query: {
      userName,
      cursor: opts.cursor ?? undefined,
      pageSize: opts.pageSize,
    },
    costUsd: COST.engagers,
    ctx: opts.ctx ?? {},
  });
  if (payload.status === "error") {
    throw new Error(
      `twitterapi.io error: ${payload.message ?? "unknown error"}`,
    );
  }
  const followers = (payload.followers ?? []).map((f) => ({
    twitterId: String(f.id ?? ""),
    handle: String(f.userName ?? "").toLowerCase(),
    displayName: f.name ?? null,
  }));
  const rawCursor =
    payload.next_cursor ??
    payload.next_cursor_str ??
    payload.nextCursor ??
    null;
  const hasMore =
    payload.has_next_page !== false &&
    typeof rawCursor === "string" &&
    rawCursor.length > 0;
  return {
    followers,
    nextCursor: hasMore ? rawCursor : null,
  };
}

/* =========================================================================
   Internals — request, retry, log
   ========================================================================= */

type RawTwitterUser = {
  id?: string | number;
  userId?: string | number;
  rest_id?: string;
  userName?: string;
  screen_name?: string;
  name?: string | null;
  profilePicture?: string | null;
  profile_image_url?: string | null;
  coverPicture?: string | null;
  description?: string | null;
  location?: string | null;
  /** Real twitterapi.io payload uses this. */
  isBlueVerified?: boolean;
  /** Older / mocked payloads. */
  isVerified?: boolean;
  verified?: boolean;
  verifiedType?: string | null;
  followers?: number;
  followersCount?: number;
  following?: number;
  followingCount?: number;
  statusesCount?: number;
  tweetCount?: number;
  mediaCount?: number;
  favouritesCount?: number;
  createdAt?: string;
  created_at?: string;
};

type RawUserInfoEnvelope = {
  data?: RawTwitterUser;
  status?: "success" | "error";
  msg?: string;
} & RawTwitterUser;

type RawTweet = {
  id?: string | number;
  text?: string;
  createdAt?: string;
  url?: string;
  inReplyToId?: string | null;
  isReply?: boolean;
  conversationId?: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  author?: RawTwitterUser & { profile_image_url?: string };
};

type RawTweetsEnvelope = {
  tweets?: RawTweet[];
  status?: "success" | "error";
  message?: string;
};

type RawFollower = {
  id?: string | number;
  userName?: string;
  name?: string | null;
};

type RawFollowersEnvelope = {
  followers?: RawFollower[];
  status?: "success" | "error";
  message?: string;
  next_cursor?: string | null;
  next_cursor_str?: string | null;
  nextCursor?: string | null;
  /** twitterapi.io sometimes returns this boolean alongside the cursor. */
  has_next_page?: boolean;
};

type RawRetweetersEnvelope = {
  users?: RawTwitterUser[];
  status?: "success" | "error";
  message?: string;
  msg?: string;
  next_cursor?: string | null;
  next_cursor_str?: string | null;
  nextCursor?: string | null;
  has_next_page?: boolean;
  has_more?: boolean;
};

type RawReplyTweet = RawTweet & {
  inReplyToId?: string | null;
  quotedTweetId?: string | null;
};

type RawRepliesEnvelope = {
  replies?: RawReplyTweet[];
  /** Some envelopes use `tweets` instead — accept either. */
  tweets?: RawReplyTweet[];
  status?: "success" | "error";
  message?: string;
  msg?: string;
  next_cursor?: string | null;
  next_cursor_str?: string | null;
  nextCursor?: string | null;
  has_next_page?: boolean;
  has_more?: boolean;
};

type RawQuotesEnvelope = {
  quotes?: RawReplyTweet[];
  tweets?: RawReplyTweet[];
  status?: "success" | "error";
  message?: string;
  msg?: string;
  next_cursor?: string | null;
  next_cursor_str?: string | null;
  nextCursor?: string | null;
  has_next_page?: boolean;
  has_more?: boolean;
};

type RawFollowRelationship = {
  following?: boolean;
  followedBy?: boolean;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
};

type RawFollowRelationshipEnvelope = RawFollowRelationship & {
  data?: RawFollowRelationship;
  status?: "success" | "error";
  message?: string;
  msg?: string;
};

type RequestArgs = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  costUsd: number;
  ctx: TwitterClientContext;
};

class TwitterApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "TwitterApiError";
  }
}

/**
 * Per-request timeout for the underlying fetch. twitterapi.io's
 * pagination endpoints normally return in well under a second; anything
 * above this almost certainly means the upstream is wedged on their
 * side. We'd rather bail and let the retry path (or the verify route's
 * own failure handling) take over than hang the SSE connection / hunter
 * UI for minutes.
 */
const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(args: RequestArgs): Promise<T> {
  const apiKey = process.env.TWITTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TWITTER_API_KEY is not set. Add it to .env.local before calling the Twitter client.",
    );
  }

  const url = buildUrl(args.path, args.query);
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = performance.now();
    let statusCode: number | null = null;
    let success = false;
    let errorMessage: string | null = null;

    try {
      const res = await fetch(url, {
        method: args.method,
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: args.body ? JSON.stringify(args.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      statusCode = res.status;

      if (res.status === 429 || res.status >= 500) {
        const text = await safeReadText(res);
        errorMessage = `${res.status} ${res.statusText}: ${text.slice(0, 200)}`;
        lastErr = new TwitterApiError(res.status, errorMessage, text);
        await logCall({ args, statusCode, success: false, errorMessage, startedAt });
        if (attempt < maxAttempts) {
          await backoff(attempt);
          continue;
        }
        throw lastErr;
      }

      if (!res.ok) {
        const text = await safeReadText(res);
        errorMessage = `${res.status} ${res.statusText}: ${text.slice(0, 200)}`;
        await logCall({ args, statusCode, success: false, errorMessage, startedAt });
        throw new TwitterApiError(res.status, errorMessage, text);
      }

      const json = (await res.json()) as T;
      success = true;
      await logCall({ args, statusCode, success, errorMessage: null, startedAt });
      return json;
    } catch (err) {
      lastErr = err;
      if (statusCode === null) {
        // Network / timeout: still log it so cost dashboards reflect attempts.
        errorMessage = err instanceof Error ? err.message : String(err);
        await logCall({
          args,
          statusCode: null,
          success: false,
          errorMessage,
          startedAt,
        });
        if (attempt < maxAttempts) {
          await backoff(attempt);
          continue;
        }
      }
      if (!(err instanceof TwitterApiError && (err.statusCode === 429 || err.statusCode >= 500))) {
        throw err;
      }
    }
  }
  throw lastErr ?? new Error("twitterapi.io: exhausted retries");
}

function buildUrl(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(TWITTER_API_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<failed to read body>";
  }
}

function backoff(attempt: number): Promise<void> {
  const base = 250 * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 200;
  return new Promise((r) => setTimeout(r, base + jitter));
}

async function logCall(p: {
  args: RequestArgs;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
  startedAt: number;
}): Promise<void> {
  try {
    await getDb()
      .insert(apiCallLog)
      .values({
        service: SERVICE,
        endpoint: p.args.path,
        method: p.args.method,
        statusCode: p.statusCode ?? null,
        success: p.success,
        estimatedCostUsd: p.args.costUsd.toFixed(8),
        responseTimeMs: Math.round(performance.now() - p.startedAt),
        bountyId: p.args.ctx.bountyId ?? null,
        claimId: p.args.ctx.claimId ?? null,
        userId: p.args.ctx.userId ?? null,
        errorMessage: p.errorMessage,
        requestMetadata: { query: p.args.query },
      });
  } catch (err) {
    // Logging failures must never poison the actual response path.
    console.warn("twitterapi.io: failed to write apiCallLog row", err);
  }
}

// `sql` import kept available for callers that want to extend logging.
export { sql };
