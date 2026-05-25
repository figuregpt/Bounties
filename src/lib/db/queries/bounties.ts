/**
 * Bounty queries — discover feed, detail, creator dashboards, search.
 */
import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bounties, claims, tokens, users } from "@/lib/db/schema";

/**
 * Claim statuses that count toward "X of Y slots claimed". A claim
 * occupies a slot as soon as Layer 1 or Layer 2 verifies the action —
 * not when the user clicks "Hunt now". See `bounty_updated` SSE
 * publishers wherever a status transition crosses this boundary.
 */
const VERIFIED_OR_BETTER_STATUSES = [
  "initial_verified",
  "awaiting_final",
  "verified",
  "claiming",
  "claimed_reward",
] as const;

/**
 * Claim statuses where the user is mid-flow but hasn't verified yet.
 * Counted in `inProgressCount` for the "N hunting" hint, NOT toward
 * the headline slot count.
 */
const IN_PROGRESS_STATUSES = ["awaiting_action", "action_claimed"] as const;

function verifiedClaimsCountSql() {
  return sql<number>`(
    SELECT COUNT(*)::int FROM ${claims}
    WHERE ${claims.bountyId} = ${bounties.id}
      AND ${claims.status} IN (${sql.join(
        VERIFIED_OR_BETTER_STATUSES.map((s) => sql`${s}`),
        sql`, `,
      )})
  )`;
}

function inProgressClaimsCountSql() {
  return sql<number>`(
    SELECT COUNT(*)::int FROM ${claims}
    WHERE ${claims.bountyId} = ${bounties.id}
      AND ${claims.status} IN (${sql.join(
        IN_PROGRESS_STATUSES.map((s) => sql`${s}`),
        sql`, `,
      )})
  )`;
}

/**
 * For lottery bounties, counts every hunter who ever reached the pool
 * — winners (still verified/claiming/claimed) PLUS people the random
 * draw demoted to `failed/not_selected_lottery`. The verified-only
 * count would erase 95% of the participants right after the draw and
 * leave "8 joined" on a bounty that 152 people actually entered.
 *
 * Returns the same value as verifiedClaimsCountSql() for non-lottery
 * bounties since `not_selected_lottery` is a lottery-only category.
 */
function lotteryJoinedCountSql() {
  return sql<number>`(
    SELECT COUNT(*)::int FROM ${claims}
    WHERE ${claims.bountyId} = ${bounties.id}
      AND (
        ${claims.status} IN (${sql.join(
          VERIFIED_OR_BETTER_STATUSES.map((s) => sql`${s}`),
          sql`, `,
        )})
        OR (
          ${claims.status} = 'failed'
          AND ${claims.failureCategory} = 'not_selected_lottery'
        )
      )
  )`;
}
import type {
  Bounty,
  BountyCategory,
  BountyStatus,
  User,
} from "@/types/database";
import {
  checkEligibility,
  type EligibilityResult,
} from "@/lib/bounties/eligibility";

/* =========================================================================
   Types
   ========================================================================= */

export type BountySortBy =
  | "newest"
  | "hot"
  | "ending_soon"
  | "highest_reward";

export type BountyFilters = {
  status?: BountyStatus | BountyStatus[];
  rewardTokens?: string[];
  minRewardPerHunterUsd?: number;
  categories?: BountyCategory[];
  searchQuery?: string;
  showIneligible?: boolean;
  /** When true, include active bounties whose verified slot count has
   *  already hit `maxHunters`. Default behaviour hides them — they
   *  aren't accepting new hunters until endsAt rolls over. */
  showFilled?: boolean;
  sortBy?: BountySortBy;
  /** Convenience: rejects rows whose endsAt is more than N hours away. */
  endingWithinHours?: number;
  isFeatured?: boolean;
};

export type Pagination = {
  /** Opaque base64 cursor — current encoding is `{offset:number}`. */
  cursor?: string;
  limit: number;
};

export type FeedCreator = {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  isCreatorVerified: boolean;
};

export type FeedRewardToken = {
  logoUrl: string | null;
  category: string | null;
  isAdminVerified: boolean;
};

export type BountyFeedItem = Bounty & {
  creator: FeedCreator;
  eligibility: EligibilityResult;
  /** Token metadata for the card avatar. Null when the reward mint
   *  isn't in our `tokens` cache yet (rare — only legacy seed rows). */
  rewardToken: FeedRewardToken | null;
  /** Phase 8.5+: number of claims with verified-or-better status —
   *  what the UI shows as "X of Y slots claimed". Computed live from
   *  the claims table, shadows the denormalized counter on the row. */
  currentHuntersCount: number;
  /** Number of claims still mid-flow (awaiting_action / action_claimed)
   *  — surfaced separately as "N hunting". */
  inProgressCount: number;
  /** For lottery bounties only: total historical participant count,
   *  including hunters who completed actions but lost the random
   *  draw (status=failed, category=not_selected_lottery). The
   *  detail panel uses this for the "X joined · Y winners" line so
   *  completed lotteries don't read as "8 joined" when 152 people
   *  actually entered. Equal to currentHuntersCount on non-lottery
   *  bounties. */
  lotteryJoinedCount: number;
  /** True only when the current user has a row in claims for this bounty. */
  claimedByCurrentUser: boolean;
};

export type BountyDetail = Bounty & {
  creator: FeedCreator & { bio: string | null };
  /** Same live-computed semantics as `BountyFeedItem.currentHuntersCount`. */
  currentHuntersCount: number;
  inProgressCount: number;
  /** See BountyFeedItem.lotteryJoinedCount. */
  lotteryJoinedCount: number;
};

/* =========================================================================
   Cursor encoding (offset-based for Phase 4)
   ========================================================================= */

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const json = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { offset?: number };
    return Number.isFinite(json.offset) ? Number(json.offset) : 0;
  } catch {
    return 0;
  }
}

/* =========================================================================
   getActiveBounties — primary discover feed
   ========================================================================= */

export async function getActiveBounties(
  user: User | null,
  filters: BountyFilters,
  pagination: Pagination,
): Promise<{
  items: BountyFeedItem[];
  nextCursor: string | null;
  totalCount: number;
}> {
  const db = getDb();
  const offset = decodeCursor(pagination.cursor);
  // Over-fetch when filtering by eligibility client-side so we can fill the
  // page even after dropping ineligible rows. Capped to avoid runaway costs.
  const oversample =
    filters.showIneligible || !user ? 1 : 3;
  const fetchLimit = Math.min(pagination.limit * oversample, 200);

  const where = buildWhere(filters);
  const orderBy = buildOrderBy(filters.sortBy);

  /* ---- Page query: bounty + creator + reward-token JOINs ----------- */
  // Computed slot counts: COUNT(*) subqueries scoped to this bounty's
  // id, using the canonical status partitions defined above. Postgres
  // satisfies these via the (bounty_id, status) index on claims —
  // EXPLAIN-cheap even with 20 rows in the page.
  const rows = await db
    .select({
      bounty: bounties,
      creator: {
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isCreatorVerified: users.isCreatorVerified,
      },
      rewardToken: {
        logoUrl: tokens.logoUrl,
        category: tokens.category,
        isAdminVerified: tokens.isAdminVerified,
      },
      computedCurrentHuntersCount: verifiedClaimsCountSql(),
      inProgressCount: inProgressClaimsCountSql(),
      lotteryJoinedCount: lotteryJoinedCountSql(),
    })
    .from(bounties)
    .innerJoin(users, eq(bounties.creatorUserId, users.id))
    .leftJoin(tokens, eq(bounties.rewardTokenMint, tokens.mint))
    .where(where)
    .orderBy(...orderBy)
    .limit(fetchLimit)
    .offset(offset);

  /* ---- Total count for "{N} active bounties" header ----------------- */
  const [{ count: totalCount } = { count: 0 }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(bounties)
    .where(where);

  /* ---- Enrich with eligibility ------------------------------------- */
  const enriched: BountyFeedItem[] = rows.map(
    ({
      bounty,
      creator,
      rewardToken,
      computedCurrentHuntersCount,
      inProgressCount,
      lotteryJoinedCount,
    }) => ({
      ...bounty,
      // Shadow the denormalized counter with the live count over
      // verified+ claims. Phase 8.5+ contract: this is the only number
      // the UI shows under "X of Y slots".
      currentHuntersCount: Number(computedCurrentHuntersCount ?? 0),
      inProgressCount: Number(inProgressCount ?? 0),
      lotteryJoinedCount: Number(lotteryJoinedCount ?? 0),
      creator,
      rewardToken: rewardToken
        ? {
            logoUrl: rewardToken.logoUrl,
            category: rewardToken.category,
            isAdminVerified: rewardToken.isAdminVerified ?? false,
          }
        : null,
      eligibility: checkEligibility(user, bounty),
      claimedByCurrentUser: false, // wired in Phase 7 when claims start landing.
    }),
  );

  const showAll = filters.showIneligible ?? false;
  const visible = showAll
    ? enriched
    : enriched.filter(
        (b) => b.eligibility.eligible || b.eligibility.requirements.length === 0,
      );

  const page = visible.slice(0, pagination.limit);
  // Advance cursor by the number of *source* rows we consumed to produce
  // this page, not by the visible slice length — otherwise filtered-out
  // rows would be re-fetched on the next page.
  const consumed = computeConsumed(visible, page.length, fetchLimit);
  const nextCursor =
    rows.length < fetchLimit && page.length === visible.length
      ? null
      : encodeCursor(offset + consumed);

  return { items: page, nextCursor, totalCount };
}

function computeConsumed(
  visible: BountyFeedItem[],
  pageLen: number,
  fetchLimit: number,
): number {
  // If we didn't filter anything out, advance by exactly pageLen.
  // Otherwise approximate: assume the entire fetched batch was consumed
  // when we hit the visible page boundary partway through.
  if (visible.length === pageLen) return pageLen;
  return fetchLimit;
}

/* =========================================================================
   Where & order builders
   ========================================================================= */

function buildWhere(filters: BountyFilters): SQL | undefined {
  const conds: SQL[] = [];

  // Status filter. Default to "active" only. The `endsAt > now` gate
  // below only fires for active-only queries — completed/refunded
  // bounties live entirely in the past and we want them visible when
  // the user toggles those status filters on.
  let statusList: BountyStatus[];
  if (Array.isArray(filters.status)) {
    statusList = filters.status.length > 0 ? filters.status : ["active"];
    conds.push(inArray(bounties.status, statusList));
  } else if (filters.status) {
    statusList = [filters.status];
    conds.push(eq(bounties.status, filters.status));
  } else {
    statusList = ["active"];
    conds.push(eq(bounties.status, "active"));
  }
  conds.push(eq(bounties.isHidden, false));
  if (statusList.every((s) => s === "active")) {
    conds.push(gt(bounties.endsAt, new Date()));
    // Filled non-lottery bounties stay `active` in the DB until their
    // endsAt rolls around (final verification + refund must happen on
    // the original clock so hunters can't claim & immediately delete
    // their actions). By default they're hidden from the feed — they
    // aren't accepting new hunters and showing a 40/40 progress bar
    // with no Hunt-now path is just noise. The "Show filled" toggle
    // in the sidebar opts back in.
    //
    // Lottery bounties accept participants past maxHunters by design,
    // so we never short-circuit those.
    //
    // We compare against the live verified-claim count, not the
    // denormalized counter, so a stale `current_hunters_count` row
    // doesn't keep a filled bounty visible.
    if (!filters.showFilled) {
      conds.push(
        sql`(
          ${bounties.distributionModel} = 'pool_lottery'
          OR (
            SELECT COUNT(*)::int FROM ${claims}
            WHERE ${claims.bountyId} = ${bounties.id}
              AND ${claims.status} IN (${sql.join(
                VERIFIED_OR_BETTER_STATUSES.map((s) => sql`${s}`),
                sql`, `,
              )})
          ) < ${bounties.maxHunters}
        )`,
      );
    }
  }

  if (filters.rewardTokens && filters.rewardTokens.length > 0) {
    // Tokens can be specified by SYMBOL (USDC, SOL — canonical chips)
    // OR by full base58 MINT address (pasted into the filter UI).
    // Match either side so the picker stays flexible.
    conds.push(
      or(
        inArray(bounties.rewardTokenSymbol, filters.rewardTokens),
        inArray(bounties.rewardTokenMint, filters.rewardTokens),
      )!,
    );
  }

  if (
    filters.minRewardPerHunterUsd != null &&
    filters.minRewardPerHunterUsd > 0
  ) {
    conds.push(
      sql`${bounties.rewardPerHunterUsd} >= ${filters.minRewardPerHunterUsd.toFixed(6)}`,
    );
  }

  if (filters.categories && filters.categories.length > 0) {
    conds.push(inArray(bounties.category, filters.categories));
  }

  if (filters.endingWithinHours != null && filters.endingWithinHours > 0) {
    const horizon = new Date(
      Date.now() + filters.endingWithinHours * 60 * 60 * 1000,
    );
    conds.push(sql`${bounties.endsAt} <= ${horizon.toISOString()}`);
  }

  if (filters.isFeatured) {
    conds.push(eq(bounties.isFeatured, true));
    conds.push(
      or(
        isNull(bounties.featuredUntil),
        gt(bounties.featuredUntil, new Date()),
      )!,
    );
  }

  if (filters.searchQuery && filters.searchQuery.trim()) {
    const q = `%${filters.searchQuery.trim()}%`;
    conds.push(
      or(
        ilike(bounties.slug, q),
        ilike(bounties.tweetAuthorHandle, q),
        sql`${bounties.tweetCachedData}->>'text' ILIKE ${q}`,
      )!,
    );
  }

  return conds.length > 0 ? and(...conds) : undefined;
}

function buildOrderBy(sortBy: BountySortBy = "newest"): SQL[] {
  switch (sortBy) {
    case "ending_soon":
      return [asc(bounties.endsAt), desc(bounties.id)];
    case "highest_reward":
      return [
        desc(bounties.rewardPerHunterUsd),
        desc(bounties.createdAt),
        desc(bounties.id),
      ];
    case "hot":
      return [
        desc(bounties.currentHuntersCount),
        desc(bounties.createdAt),
        desc(bounties.id),
      ];
    case "newest":
    default:
      return [desc(bounties.createdAt), desc(bounties.id)];
  }
}

/* =========================================================================
   Single-bounty fetchers (used by Phase 5 detail, stubbed for now)
   ========================================================================= */

export async function getBountyById(
  id: string,
  _userId: string | null,
): Promise<BountyDetail | null> {
  const [row] = await getDb()
    .select({
      bounty: bounties,
      creator: {
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isCreatorVerified: users.isCreatorVerified,
        bio: users.bio,
      },
      computedCurrentHuntersCount: verifiedClaimsCountSql(),
      inProgressCount: inProgressClaimsCountSql(),
      lotteryJoinedCount: lotteryJoinedCountSql(),
    })
    .from(bounties)
    .innerJoin(users, eq(bounties.creatorUserId, users.id))
    .where(eq(bounties.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...row.bounty,
    currentHuntersCount: Number(row.computedCurrentHuntersCount ?? 0),
    inProgressCount: Number(row.inProgressCount ?? 0),
    lotteryJoinedCount: Number(row.lotteryJoinedCount ?? 0),
    creator: row.creator,
  };
}

export async function getBountyBySlug(
  slug: string,
  _userId: string | null,
): Promise<BountyDetail | null> {
  const [row] = await getDb()
    .select({
      bounty: bounties,
      creator: {
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isCreatorVerified: users.isCreatorVerified,
        bio: users.bio,
      },
      computedCurrentHuntersCount: verifiedClaimsCountSql(),
      inProgressCount: inProgressClaimsCountSql(),
      lotteryJoinedCount: lotteryJoinedCountSql(),
    })
    .from(bounties)
    .innerJoin(users, eq(bounties.creatorUserId, users.id))
    .where(eq(bounties.slug, slug))
    .limit(1);
  if (!row) return null;
  return {
    ...row.bounty,
    currentHuntersCount: Number(row.computedCurrentHuntersCount ?? 0),
    inProgressCount: Number(row.inProgressCount ?? 0),
    lotteryJoinedCount: Number(row.lotteryJoinedCount ?? 0),
    creator: row.creator,
  };
}

export async function getFeaturedBounties(
  user: User | null,
  limit: number,
): Promise<BountyFeedItem[]> {
  const { items } = await getActiveBounties(
    user,
    { isFeatured: true, showIneligible: true },
    { limit },
  );
  return items;
}

export async function getBountiesByCreator(
  creatorUserId: string,
  _status?: BountyStatus | BountyStatus[],
): Promise<Bounty[]> {
  // TODO(phase-6): creator dashboard list.
  throw new Error("getBountiesByCreator: not implemented");
}

export async function getBountiesByCategory(
  category: BountyCategory,
  pagination: Pagination,
): Promise<{ items: BountyFeedItem[]; nextCursor: string | null }> {
  const { items, nextCursor } = await getActiveBounties(
    null,
    { categories: [category], showIneligible: true },
    pagination,
  );
  return { items, nextCursor };
}

export async function searchBounties(
  q: string,
  pagination: Pagination,
): Promise<{ items: BountyFeedItem[]; nextCursor: string | null }> {
  const { items, nextCursor } = await getActiveBounties(
    null,
    { searchQuery: q, showIneligible: true },
    pagination,
  );
  return { items, nextCursor };
}

export async function incrementBountyView(bountyId: string): Promise<void> {
  await getDb()
    .update(bounties)
    .set({ viewCount: sql`${bounties.viewCount} + 1` })
    .where(eq(bounties.id, bountyId));
}
