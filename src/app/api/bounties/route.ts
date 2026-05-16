import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bounties } from "@/lib/db/schema";
import {
  getActiveBounties,
  type BountySortBy,
} from "@/lib/db/queries/bounties";
import type {
  BountyStatus,
  TweetCachedData,
} from "@/types/database";
import {
  CreateBountySchema,
  extractTweetId,
  MIN_REWARD_PER_HUNTER_USD,
  MIN_TOTAL_POOL_USD,
} from "@/lib/validation/bounty";
import { serializeZodIssues } from "@/lib/validation/field-labels";
import { getTweetById } from "@/lib/twitter/client";
import {
  enrichToken,
  incrementTokenUsage,
  TokenFlaggedError,
  TokenLogoMissingError,
  TokenNotFoundError,
  TokenPriceUnavailableError,
} from "@/lib/tokens/enrichment";
import { currentNetwork } from "@/lib/tokens/canonical";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================================
   GET — discover feed (unchanged from Phase 4)
   ========================================================================= */

const SORT_VALUES = [
  "newest",
  "hot",
  "ending_soon",
  "highest_reward",
] as const satisfies readonly BountySortBy[];

const QuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  sortBy: z.enum(SORT_VALUES).optional(),
  showIneligible: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  rewardTokens: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    ),
  statuses: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? (v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean) as BountyStatus[])
        : undefined,
    ),
  minRewardPerHunterUsd: z.coerce.number().min(0).optional(),
  q: z.string().trim().min(1).optional(),
  endingWithinHours: z.coerce.number().int().min(1).optional(),
});

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const q = parsed.data;
  const user = await getCurrentUser();
  const result = await getActiveBounties(
    user,
    {
      sortBy: q.sortBy,
      showIneligible: q.showIneligible,
      rewardTokens: q.rewardTokens,
      // The "discover" feed honors whatever the user toggled — usually
      // "active" only, but they can swap to "completed" to browse the
      // archive. Empty/undefined falls back to active (see buildWhere).
      status: q.statuses && q.statuses.length > 0 ? q.statuses : undefined,
      minRewardPerHunterUsd: q.minRewardPerHunterUsd,
      searchQuery: q.q,
      endingWithinHours: q.endingWithinHours,
    },
    { cursor: q.cursor, limit: q.limit ?? 20 },
  );
  return NextResponse.json({ ok: true, ...result });
}

/* =========================================================================
   POST — create draft bounty (Phase 6)
   ========================================================================= */

/**
 * POST /api/bounties — creates a draft bounty.
 *
 * Two-step flow lets us atomically tie on-chain state to DB state:
 *   1. POST /api/bounties           → row created, status='draft'
 *   2. POST /api/bounties/{slug}/launch  → tx verified, status='active'
 *
 * If the user abandons before launch, the draft stays in the DB but is
 * never displayed in /discover (the feed filters status='active'). A
 * future cleanup job can sweep stale drafts.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = CreateBountySchema.safeParse(body);
  if (!parsed.success) {
    const issues = serializeZodIssues(parsed.error);
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[POST /api/bounties] validation failed",
        JSON.stringify({ body, issues }, null, 2),
      );
    }
    return NextResponse.json(
      {
        ok: false,
        errorCode: "validation_failed",
        error: "Some fields need attention",
        issues,
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  /* ---- Resolve reward token + enforce $5 floor ----------------------- */
  let tokenRow;
  try {
    tokenRow = await enrichToken(input.rewardTokenMint);
  } catch (err) {
    if (err instanceof TokenFlaggedError) {
      return NextResponse.json(
        {
          ok: false,
          error: "This token has been flagged. Choose a different token.",
          errorCode: "token_flagged",
        },
        { status: 403 },
      );
    }
    if (err instanceof TokenNotFoundError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Reward token not found on DexScreener",
          errorCode: "token_not_found",
        },
        { status: 400 },
      );
    }
    if (err instanceof TokenPriceUnavailableError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This token has no tracked price yet — add liquidity on a DEX first",
          errorCode: "token_no_price",
        },
        { status: 422 },
      );
    }
    if (err instanceof TokenLogoMissingError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This token doesn't have a logo on DexScreener yet — bounties need recognizable token branding",
          errorCode: "token_logo_missing",
        },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: `Couldn't resolve reward token: ${message}`,
        errorCode: "token_lookup_failed",
      },
      { status: 502 },
    );
  }

  if (tokenRow.flaggedAsScam) {
    return NextResponse.json(
      {
        ok: false,
        error: "This token has been flagged. Choose a different token.",
        errorCode: "token_flagged",
      },
      { status: 403 },
    );
  }

  const rewardUsdPerHunter = input.rewardPerHunter * tokenRow.priceUsd;
  const totalPoolUsd = rewardUsdPerHunter * input.maxHunters;
  // Two independent reward floors. We accumulate violations rather
  // than short-circuit so the create form can surface both at once if
  // the creator's numbers fail both checks.
  //
  // Devnet bypass: no real money at stake, and most devnet tokens
  // don't have a tracked price (they aren't on DexScreener). Skip the
  // floor entirely so testers can launch arbitrarily small bounties
  // with any mint. Mainnet keeps the full check.
  const floorIssues: Array<{ path: string; code: string; message: string }> =
    [];
  if (currentNetwork() !== "devnet") {
    if (rewardUsdPerHunter < MIN_REWARD_PER_HUNTER_USD) {
      floorIssues.push({
        path: "rewardPerHunter",
        code: "below_min_per_hunter",
        message: `Per-hunter reward must be at least $${MIN_REWARD_PER_HUNTER_USD} USD (currently ≈ $${rewardUsdPerHunter.toFixed(2)})`,
      });
    }
    if (totalPoolUsd < MIN_TOTAL_POOL_USD) {
      floorIssues.push({
        // Either knob fixes this — point at rewardPerHunter so the form
        // highlight is consistent with the per-hunter floor.
        path: "rewardPerHunter",
        code: "below_min_total_pool",
        message: `Total reward pool must be at least $${MIN_TOTAL_POOL_USD} USD (currently ≈ $${totalPoolUsd.toFixed(2)})`,
      });
    }
  }
  if (floorIssues.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: "validation_failed",
        error: "Some fields need attention",
        issues: floorIssues,
      },
      { status: 400 },
    );
  }

  /* ---- Resolve tweet ------------------------------------------------- */
  const tweetId = extractTweetId(input.tweetUrl);
  if (!tweetId) {
    return NextResponse.json(
      { ok: false, error: "Couldn't parse tweet id from URL" },
      { status: 400 },
    );
  }

  let tweetCached: TweetCachedData;
  let tweetAuthorHandle: string;
  let tweetAuthorTwitterId: string | null = null;
  let tweetIsOwnedByCreator = false;
  try {
    const tw = await getTweetById(tweetId, { userId: user.id });
    // Reply-tweet block: twitterapi.io's `/twitter/tweet/replies` only
    // enumerates *direct* replies to a tweet. If the creator picks a
    // reply (a tweet inside a thread), hunters who reply to it won't
    // ever be discovered by the verifier — every claim fails. Bail
    // here so the bounty never gets created.
    if (tw.isReply) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Bounties only work on main tweets for now — replies aren't supported. Pick the root post.",
          errorCode: "tweet_is_reply",
          issues: [
            {
              path: "tweetUrl",
              code: "tweet_is_reply",
              message: "Pick the root tweet, not a reply inside a thread",
            },
          ],
        },
        { status: 400 },
      );
    }
    tweetAuthorHandle = tw.author.userName;
    tweetAuthorTwitterId = tw.author.id || null;
    tweetIsOwnedByCreator =
      tw.author.id === user.twitterId ||
      tw.author.userName.toLowerCase() === user.twitterHandle.toLowerCase();
    tweetCached = {
      authorId: tw.author.id,
      authorHandle: tw.author.userName,
      authorName: tw.author.name ?? tw.author.userName,
      text: tw.text,
      metrics: {
        likes: tw.metrics.likes,
        retweets: tw.metrics.retweets,
        replies: tw.metrics.replies,
        quotes: tw.metrics.quotes,
      },
      capturedAt: new Date().toISOString(),
    };
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Couldn't fetch tweet: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 },
    );
  }

  /* ---- Compute derived fields --------------------------------------- */
  const totalPool = input.rewardPerHunter * input.maxHunters;
  const platformFeeBps = 500;
  const platformFeeAmount = (totalPool * platformFeeBps) / 10_000;

  const slug = await generateUniqueSlug({
    seed: tweetAuthorHandle || input.rewardTokenSymbol,
  });

  const db = getDb();
  const [created] = await db
    .insert(bounties)
    .values({
      creatorUserId: user.id,
      slug,
      status: "draft",
      tweetId,
      tweetUrl: input.tweetUrl,
      tweetAuthorTwitterId,
      tweetAuthorHandle,
      tweetCachedData: tweetCached,
      tweetIsOwnedByCreator,
      actionConfig: input.actionConfig,
      requiresLike: false, // Phase 6: deprecated, always false on new rows.
      requiresRetweet: input.actionConfig.retweet,
      requiresReply: input.actionConfig.reply.required,
      requiresQuote: input.actionConfig.quote.required,
      requiresFollow: input.actionConfig.follow.required,
      followTargetHandle: input.actionConfig.follow.required
        ? input.actionConfig.follow.targetHandle
        : null,
      replyKeywordsRequired:
        input.actionConfig.reply.rules.mustContainAll.length > 0
          ? input.actionConfig.reply.rules.mustContainAll
          : null,
      // Phase 6.3: pool-minimum subsection removed. Columns kept null
      // for back-compat — they'll be dropped in a future migration.
      replyKeywordsPool: null,
      replyKeywordsPoolMinimum: null,
      replyKeywordsForbidden:
        input.actionConfig.reply.rules.forbidden.length > 0
          ? input.actionConfig.reply.rules.forbidden
          : null,
      replyMinLength: input.actionConfig.reply.rules.minLength,
      replyMinWords: input.actionConfig.reply.rules.minWordCount,
      replyMatchType: input.actionConfig.reply.rules.matchType,
      // Token fields canonicalized from the enrichment lookup — the
      // client may have stale data, the server is the source of truth.
      rewardTokenMint: tokenRow.mint,
      rewardTokenSymbol: tokenRow.symbol,
      rewardTokenDecimals: tokenRow.decimals,
      rewardPerHunter: String(input.rewardPerHunter),
      rewardPerHunterUsd: rewardUsdPerHunter.toFixed(6),
      maxHunters: input.maxHunters,
      totalPool: String(totalPool),
      totalPoolUsd: totalPoolUsd.toFixed(6),
      platformFeeBps,
      platformFeeAmount: platformFeeAmount.toString(),
      distributionModel: input.distributionModel,
      distributionConfig: null,
      eligibilityFilters: input.eligibilityFilters,
      minFollowers: input.eligibilityFilters.minFollowers,
      requireVerified: input.eligibilityFilters.requireVerified,
      minAccountAgeMonths: input.eligibilityFilters.minAccountAgeMonths,
      minReputationScore:
        input.eligibilityFilters.minReputationScore != null
          ? input.eligibilityFilters.minReputationScore.toFixed(2)
          : null,
      allowedCountries: input.eligibilityFilters.allowedCountries,
      blockedCountries: input.eligibilityFilters.blockedCountries,
      minPreviousBounties: input.eligibilityFilters.minPreviousBounties,
      requireReputationTier: input.eligibilityFilters.requireReputationTier,
      onChainStatus: "pending",
      // endsAt is required by the schema — set it now using the chosen
      // duration; we'll bump it again on launch so the clock starts when
      // the bounty actually goes live.
      endsAt: new Date(Date.now() + input.durationHours * 3600 * 1000),
      category: input.category,
      tags: input.tags && input.tags.length > 0 ? input.tags : null,
      visibilityType: "public",
    })
    .returning();

  // Fire-and-forget popularity tracking. Failure here shouldn't fail
  // the create — worst case the quick-picks ranking is slightly off.
  try {
    await incrementTokenUsage(tokenRow.mint);
  } catch (err) {
    console.warn(
      "[POST /api/bounties] incrementTokenUsage failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({
    ok: true,
    bounty: {
      id: created.id,
      slug: created.slug,
      totalPool: created.totalPool,
      totalPoolUsd: created.totalPoolUsd,
      rewardTokenMint: created.rewardTokenMint,
      rewardTokenSymbol: created.rewardTokenSymbol,
      rewardTokenDecimals: created.rewardTokenDecimals,
      durationHours: input.durationHours,
    },
  });
}

/* =========================================================================
   Slug generation
   ========================================================================= */

const SLUG_SUFFIX_ALPHABET = "23456789abcdefghjkmnpqrstvwxyz";

async function generateUniqueSlug(args: { seed: string }): Promise<string> {
  const slugSeed = slugify(args.seed);
  for (let attempt = 0; attempt < 6; attempt++) {
    const suffix = randomSuffix(5);
    const candidate = `${slugSeed}-${suffix}`;
    const [existing] = await getDb()
      .select({ id: bounties.id })
      .from(bounties)
      .where(and(eq(bounties.slug, candidate)))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique slug after 6 attempts");
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "bounty"
  );
}

function randomSuffix(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SLUG_SUFFIX_ALPHABET[
      Math.floor(Math.random() * SLUG_SUFFIX_ALPHABET.length)
    ];
  }
  return out;
}
