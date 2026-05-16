import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  tweetEngagementCache,
  tweetEngagers,
} from "@/lib/db/schema";
import {
  getTweetReplies,
  getTweetQuotes,
  getTweetRetweeters,
  type RetweeterRow,
  type TweetQuoteRow,
  type TweetReplyRow,
  type TwitterClientContext,
} from "@/lib/twitter/client";

/**
 * Tweet engager cache — shared across hunters of the same bounty.
 *
 * Two-layer storage:
 *   • `tweet_engagement_cache` — one row per (tweetId, type), tracks
 *     pagination cursor + `lastFetchedAt` so concurrent hunters reuse
 *     the same fetch budget.
 *   • `tweet_engagers` — one row per (tweetId, type, twitterId), the
 *     actual engager set with replyText/quoteText where applicable.
 *
 * Read-through pattern: callers pass the engagement type plus an
 * optional `targetTwitterId` they're trying to find. The cache walks
 * pages until either (a) the user is in the cache, (b) we hit
 * `MAX_PAGES`, or (c) the upstream paginator returns null. The hot
 * verify path early-exits as soon as the user shows up.
 *
 * Freshness: rows newer than `FRESH_TTL_MS` are served without
 * touching twitterapi.io even on a miss — assumes the user actually
 * hasn't done the action yet (they could be lying about completing it).
 *
 * Phase 8+ will share read-locks across concurrent verifications so
 * 20 hunters claiming the same viral bounty don't all paginate in
 * parallel.
 */

const FRESH_TTL_MS = 60_000;
const MAX_PAGES = 20;
/**
 * Walk budget for a single cache call. Even with the 20-second per-request
 * timeout in the twitter client, twenty slow pages can chain into minutes.
 * Bail at 45s and surface the partial result with `hitPaginationLimit`
 * so the verifier returns a user-actionable failure instead of letting
 * the API request hang.
 */
const WALK_BUDGET_MS = 45_000;

export type EngagerType = "retweet" | "reply" | "quote";

export type CachedEngager = {
  twitterId: string;
  handle: string | null;
  engagementTweetId: string | null;
  engagementText: string | null;
  /** Timestamp from Twitter on the engagement (reply / quote tweet
   *  creation time). Used to pick the most recent engagement when a
   *  hunter has posted multiple replies on the same tweet. Null for
   *  retweets (Twitter doesn't expose a per-retweet timestamp). */
  engagementCreatedAt: Date | null;
};

export type EngagerLookupResult = {
  /** All engagers currently in the cache for this (tweetId, type). */
  engagers: CachedEngager[];
  /** True if we hit `MAX_PAGES` without exhausting the upstream feed.
   *  Verifiers turn this into a "verification limit reached" failure
   *  category. */
  hitPaginationLimit: boolean;
  /** Whether the cache served the request without any new API calls. */
  servedFromCache: boolean;
};

type Ctx = TwitterClientContext;

/**
 * Returns every engager we know about for `(tweetId, type)`, paginating
 * fresh pages when the cache is stale. When `targetTwitterId` is given
 * we short-circuit as soon as that user is found — minimizes API spend
 * on the hot Layer-1 verification path.
 */
export async function getCachedEngagers(
  tweetId: string,
  type: EngagerType,
  opts: {
    /** Stop paginating once this user appears in the cache. */
    targetTwitterId?: string;
    /**
     * Skip the freshness window and skip the "cache already contains the
     * target" early-exit, so a walk actually happens. Cursor is preserved
     * by default — we resume from `header.lastCursor` and only fetch new
     * pages (twitterapi.io orders engagement DESC, but new pages added
     * since our last walk will appear as nextCursor steps from where we
     * stopped).
     *
     * Use case: hunter retries after we already walked pages 1-5 last
     * time. Skip the "fresh, fully fetched, just hand back the cache"
     * early-exit, but resume from after page 5 instead of refetching
     * pages 1-5.
     */
    bypassCache?: boolean;
    /**
     * Additionally restart pagination from cursor=null. Use this when
     * the goal is to re-fetch already-walked pages — e.g., final
     * verification detecting deletions, since deleted replies just
     * vanish from old pages with no nextCursor signal.
     */
    restartCursor?: boolean;
    ctx?: Ctx;
  } = {},
): Promise<EngagerLookupResult> {
  const db = getDb();
  const now = Date.now();
  const ctx = opts.ctx ?? {};

  // 1) Load cache header. Create on first miss so we have a stable row
  //    to update the cursor on.
  const [cacheRow] = await db
    .select()
    .from(tweetEngagementCache)
    .where(
      and(
        eq(tweetEngagementCache.tweetId, tweetId),
        eq(tweetEngagementCache.engagementType, type),
      ),
    )
    .limit(1);
  let header = cacheRow;
  if (!header) {
    const [inserted] = await db
      .insert(tweetEngagementCache)
      .values({
        tweetId,
        engagementType: type,
        knownEngagerCount: 0,
        totalApiCallsMade: 0,
        isFullyFetched: false,
        isStale: false,
      })
      .returning();
    header = inserted;
  }

  const lastFetched = header.lastFetchedAt?.getTime() ?? 0;
  const isFresh =
    !header.isStale && now - lastFetched < FRESH_TTL_MS;

  // 2) Fresh + we already know the target → done, no API.
  //    Bypassed entirely on retry: the target's tweet text may have
  //    changed since we cached, so we need fresh pages.
  if (!opts.bypassCache && opts.targetTwitterId) {
    const [hit] = await db
      .select()
      .from(tweetEngagers)
      .where(
        and(
          eq(tweetEngagers.tweetId, tweetId),
          eq(tweetEngagers.engagementType, type),
          eq(tweetEngagers.engagerTwitterId, opts.targetTwitterId),
        ),
      )
      .limit(1);
    if (hit) {
      const engagers = await fetchAllEngagers(tweetId, type);
      return {
        engagers,
        hitPaginationLimit: false,
        servedFromCache: true,
      };
    }
  }
  if (!opts.bypassCache && isFresh && header.isFullyFetched) {
    const engagers = await fetchAllEngagers(tweetId, type);
    return {
      engagers,
      hitPaginationLimit: false,
      servedFromCache: true,
    };
  }

  // 3) Walk new pages. `restartCursor` forces a full re-walk from page 1
  //    (used by final verification to detect deletions). Otherwise we
  //    resume from `header.lastCursor` — even on bypassCache — so the
  //    common retry path doesn't refetch pages we already cached.
  let cursor: string | null = opts.restartCursor
    ? null
    : header.lastCursor ?? null;
  let pagesWalked = 0;
  let found = false;
  let budgetExhausted = false;
  let isFullyFetched = opts.restartCursor ? false : header.isFullyFetched;
  const walkStartedAt = Date.now();
  // In-memory accumulator — what we actually saw on the wire. Verification
  // reads from this if the DB read-back returns less than what we fetched
  // (e.g. when the upsert silently failed).
  const seenEngagers: CachedEngager[] = [];

  for (;;) {
    if (pagesWalked >= MAX_PAGES) break;
    if (isFullyFetched) break;
    if (Date.now() - walkStartedAt > WALK_BUDGET_MS) {
      budgetExhausted = true;
      break;
    }

    const page = await fetchPage(type, tweetId, cursor, ctx);
    pagesWalked += 1;

    for (const r of page.rows) {
      seenEngagers.push({
        twitterId: r.twitterId,
        handle: r.handle,
        engagementTweetId: r.engagementTweetId,
        engagementText: r.engagementText,
        engagementCreatedAt: r.engagementCreatedAt,
      });
    }

    if (page.rows.length > 0) {
      // Twitter occasionally returns multiple engagements from the same
      // user inside a single page (e.g. a hunter posts five replies on
      // one tweet — all share the same (tweetId, type, twitterId) key).
      // Postgres rejects the whole INSERT when ON CONFLICT would target
      // the same row twice, so we dedupe at the conflict-key level
      // before sending the batch. Keep the engagement with the latest
      // `engagementCreatedAt` so the verifier sees the hunter's CURRENT
      // reply (covers the "posted wrong text, deleted, posted again"
      // flow). Retweets have null timestamps — fall back to last-seen.
      const dedupedByKey = new Map<
        string,
        (typeof page.rows)[number]
      >();
      for (const r of page.rows) {
        const existing = dedupedByKey.get(r.twitterId);
        if (!existing) {
          dedupedByKey.set(r.twitterId, r);
          continue;
        }
        if (!existing.engagementCreatedAt) {
          dedupedByKey.set(r.twitterId, r);
          continue;
        }
        if (
          r.engagementCreatedAt &&
          r.engagementCreatedAt > existing.engagementCreatedAt
        ) {
          dedupedByKey.set(r.twitterId, r);
        }
      }
      const valuesBatch = Array.from(dedupedByKey.values()).map((r) => ({
        tweetId,
        engagementType: type,
        engagerTwitterId: r.twitterId,
        engagerHandle: r.handle,
        engagementTweetId: r.engagementTweetId,
        engagementText: r.engagementText,
        engagementCreatedAt: r.engagementCreatedAt,
      }));

      // DB writes are best-effort. Verification correctness lives in the
      // `seenEngagers` accumulator above; if the upsert blows up (e.g.
      // a schema migration we haven't run, an FK race, anything), we
      // log a concise breadcrumb and keep going so the user still gets
      // a clean verification result instead of a SQL dump.
      try {
        await db
          .insert(tweetEngagers)
          .values(valuesBatch)
          .onConflictDoUpdate({
            target: [
              tweetEngagers.tweetId,
              tweetEngagers.engagementType,
              tweetEngagers.engagerTwitterId,
            ],
            set: {
              // Only overwrite if the incoming engagement is newer than
              // (or as new as) what we already have. Older pages can
              // legitimately surface OLDER replies for the same hunter,
              // and without this guard a later page walk would clobber
              // the hunter's current reply with a stale one. Retweets
              // have null timestamps — for those we fall back to
              // "always overwrite", matching the previous behavior.
              engagerHandle: sql`CASE
                WHEN EXCLUDED.engagement_created_at IS NULL
                  OR ${tweetEngagers.engagementCreatedAt} IS NULL
                  OR EXCLUDED.engagement_created_at >= ${tweetEngagers.engagementCreatedAt}
                THEN EXCLUDED.engager_handle
                ELSE ${tweetEngagers.engagerHandle}
              END`,
              engagementTweetId: sql`CASE
                WHEN EXCLUDED.engagement_created_at IS NULL
                  OR ${tweetEngagers.engagementCreatedAt} IS NULL
                  OR EXCLUDED.engagement_created_at >= ${tweetEngagers.engagementCreatedAt}
                THEN EXCLUDED.engagement_tweet_id
                ELSE ${tweetEngagers.engagementTweetId}
              END`,
              engagementText: sql`CASE
                WHEN EXCLUDED.engagement_created_at IS NULL
                  OR ${tweetEngagers.engagementCreatedAt} IS NULL
                  OR EXCLUDED.engagement_created_at >= ${tweetEngagers.engagementCreatedAt}
                THEN EXCLUDED.engagement_text
                ELSE ${tweetEngagers.engagementText}
              END`,
              engagementCreatedAt: sql`CASE
                WHEN EXCLUDED.engagement_created_at IS NULL
                  OR ${tweetEngagers.engagementCreatedAt} IS NULL
                  OR EXCLUDED.engagement_created_at >= ${tweetEngagers.engagementCreatedAt}
                THEN EXCLUDED.engagement_created_at
                ELSE ${tweetEngagers.engagementCreatedAt}
              END`,
              isStillValid: true,
              lastValidatedAt: sql`now()`,
            },
          });
      } catch (err) {
        console.error("[engager-cache] upsert failed (non-fatal):", {
          tweetId,
          type,
          batchSize: valuesBatch.length,
          errorCode: (err as { code?: string })?.code,
          errorMessage:
            err instanceof Error ? err.message.slice(0, 200) : "unknown",
        });
      }
    }

    cursor = page.nextCursor;
    if (cursor === null) {
      isFullyFetched = true;
      break;
    }
    if (
      opts.targetTwitterId &&
      page.rows.some((r) => r.twitterId === opts.targetTwitterId)
    ) {
      found = true;
      break;
    }
  }

  try {
    await db
      .update(tweetEngagementCache)
      .set({
        lastCursor: cursor,
        lastFetchedAt: new Date(),
        totalApiCallsMade: sql`${tweetEngagementCache.totalApiCallsMade} + ${pagesWalked}`,
        isFullyFetched,
        isStale: false,
      })
      .where(eq(tweetEngagementCache.id, header.id));
  } catch (err) {
    console.error(
      "[engager-cache] header update failed (non-fatal):",
      err instanceof Error ? err.message.slice(0, 200) : "unknown",
    );
  }

  // Merge: the DB read returns rows persisted across all callers, but
  // an upsert may have failed on this run. Union with the in-memory
  // accumulator so the verifier never misses an engagement it just saw
  // on the wire just because Postgres choked. De-dupe by twitterId.
  let engagers: CachedEngager[];
  try {
    const persisted = await fetchAllEngagers(tweetId, type);
    const merged = new Map<string, CachedEngager>();
    for (const e of persisted) merged.set(e.twitterId, e);
    for (const e of seenEngagers) {
      if (!merged.has(e.twitterId)) merged.set(e.twitterId, e);
    }
    engagers = Array.from(merged.values());
  } catch {
    engagers = seenEngagers;
  }
  return {
    engagers,
    // Either we ran out of pages or ran out of wall-clock budget — both
    // surface to the verifier as "couldn't paginate deep enough".
    hitPaginationLimit:
      !found &&
      !isFullyFetched &&
      (pagesWalked >= MAX_PAGES || budgetExhausted),
    servedFromCache: pagesWalked === 0,
  };
}

/** Forces the next call to fully refetch — used when the cron worker
 *  detects rule changes or after the bounty publishes. */
export async function invalidateEngagerCache(
  tweetId: string,
  type?: EngagerType,
): Promise<void> {
  const db = getDb();
  if (type) {
    await db
      .update(tweetEngagementCache)
      .set({ isStale: true })
      .where(
        and(
          eq(tweetEngagementCache.tweetId, tweetId),
          eq(tweetEngagementCache.engagementType, type),
        ),
      );
  } else {
    await db
      .update(tweetEngagementCache)
      .set({ isStale: true })
      .where(eq(tweetEngagementCache.tweetId, tweetId));
  }
}

/* =========================================================================
   Internals
   ========================================================================= */

async function fetchAllEngagers(
  tweetId: string,
  type: EngagerType,
): Promise<CachedEngager[]> {
  const rows = await getDb()
    .select({
      engagerTwitterId: tweetEngagers.engagerTwitterId,
      engagerHandle: tweetEngagers.engagerHandle,
      engagementTweetId: tweetEngagers.engagementTweetId,
      engagementText: tweetEngagers.engagementText,
      engagementCreatedAt: tweetEngagers.engagementCreatedAt,
    })
    .from(tweetEngagers)
    .where(
      and(
        eq(tweetEngagers.tweetId, tweetId),
        eq(tweetEngagers.engagementType, type),
        eq(tweetEngagers.isStillValid, true),
      ),
    )
    .orderBy(asc(tweetEngagers.fetchedAt));
  return rows.map((r) => ({
    twitterId: r.engagerTwitterId,
    handle: r.engagerHandle,
    engagementTweetId: r.engagementTweetId,
    engagementText: r.engagementText,
    engagementCreatedAt: r.engagementCreatedAt,
  }));
}

type PageResult = {
  rows: Array<{
    twitterId: string;
    handle: string | null;
    engagementTweetId: string | null;
    engagementText: string | null;
    engagementCreatedAt: Date | null;
  }>;
  nextCursor: string | null;
};

async function fetchPage(
  type: EngagerType,
  tweetId: string,
  cursor: string | null,
  ctx: Ctx,
): Promise<PageResult> {
  if (type === "retweet") {
    const page = await getTweetRetweeters(tweetId, { cursor, ctx });
    return {
      rows: page.retweeters.map((r: RetweeterRow) => ({
        twitterId: r.twitterId,
        handle: r.handle,
        engagementTweetId: null,
        engagementText: null,
        engagementCreatedAt: null,
      })),
      nextCursor: page.nextCursor,
    };
  }
  if (type === "reply") {
    const page = await getTweetReplies(tweetId, { cursor, ctx });
    return {
      rows: page.replies.map((r: TweetReplyRow) => ({
        twitterId: r.authorTwitterId,
        handle: r.authorHandle,
        engagementTweetId: r.tweetId,
        engagementText: r.text,
        engagementCreatedAt: parseTwitterDate(r.createdAt),
      })),
      nextCursor: page.nextCursor,
    };
  }
  const page = await getTweetQuotes(tweetId, { cursor, ctx });
  return {
    rows: page.quotes.map((r: TweetQuoteRow) => ({
      twitterId: r.authorTwitterId,
      handle: r.authorHandle,
      engagementTweetId: r.tweetId,
      engagementText: r.text,
      engagementCreatedAt: parseTwitterDate(r.createdAt),
    })),
    nextCursor: page.nextCursor,
  };
}

function parseTwitterDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
