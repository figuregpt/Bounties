/**
 * Dev seed — populates the local DB with a realistic-shaped dataset.
 *
 * Usage:
 *   npm run db:seed
 *
 * The script is fully idempotent inside a single run (uses TRUNCATE) but
 * relies on dotenv-cli to inject DATABASE_URL via the npm script. Do NOT
 * point this at a production database — it wipes every table it touches.
 */
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { getAllCanonicalTokens } from "@/lib/tokens/canonical";
import {
  ANSEM_DECIMALS,
  ANSEM_LOGO_URL,
  ANSEM_MINT,
  ANSEM_NAME,
  ANSEM_SYMBOL,
} from "@/lib/tokens/ansem";
import type {
  ActionConfig,
  BountyCategory,
  BountyStatus,
  ClaimStatus,
  DistributionModel,
  EligibilityFilters,
  TweetCachedData,
} from "@/types/database";

/* =========================================================================
   Tiny deterministic PRNG so reseeds produce the same dataset.
   ========================================================================= */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0xb0_07_1e_5f); // "bounties"
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const hoursFromNow = (n: number) =>
  new Date(Date.now() + n * 60 * 60 * 1000);

/** Dedupe canonical token seeds by mint — wrapped SOL has the same
 *  address across networks, so a naive `getAllCanonicalTokens()` flat
 *  list would try to insert it twice and explode on the unique mint
 *  constraint. */
function uniqueByMint<T extends { mint: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.mint)) continue;
    seen.add(r.mint);
    out.push(r);
  }
  return out;
}

/* =========================================================================
   Connection
   ========================================================================= */

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local — `npm run db:seed` loads it via dotenv-cli.",
    );
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  console.log("🌱  Seeding bounties.fm dev database…");
  console.log("    URL:", url.replace(/:\/\/[^@]+@/, "://****@"));

  /* ---------------------------------------------------------------- wipe */
  // CASCADE in the right order: leaves → roots.
  await db.execute(sql`
    TRUNCATE TABLE
      audit_log,
      api_call_log,
      daily_metrics,
      buybacks,
      platform_revenue,
      social_activities,
      social_follows,
      notifications,
      tweet_stream_subscriptions,
      tweet_engagers,
      tweet_engagement_cache,
      smart_account_followers,
      smart_accounts,
      claims,
      bounties,
      tokens,
      feature_flags,
      users
    RESTART IDENTITY CASCADE;
  `);
  console.log("    cleared existing data");

  /* ---------------------------------------------------------------- tokens */
  // Canonical (USDC / SOL / BNTY) rows come from the network-aware
  // registry — seeding ALL networks so a devnet build still finds its
  // own USDC mint when the fixture lookup runs further down. The
  // bounty seed below picks the current-network mint by symbol via
  // `getCanonicalBySymbol`. SOL mint is shared across networks so it
  // only inserts once.
  const canonicalRows = uniqueByMint(
    getAllCanonicalTokens().map((t) => ({
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      category: t.category,
      isWhitelisted: true,
      whitelistedAt: daysAgo(60),
      isVerified: true,
      isAdminVerified: true,
      firstSeenAt: t.firstSeenAt,
      coingeckoId:
        t.symbol === "USDC" ? "usd-coin" : t.symbol === "SOL" ? "solana" : null,
      jupiterPriceUsd: (t.priceUsd > 0
        ? t.priceUsd
        : t.symbol === "SOL"
          ? 168.42
          : t.symbol === "BNTY"
            ? 0.0421
            : 0
      ).toString(),
      jupiterPriceUpdatedAt: hoursFromNow(-1),
      logoUrl: t.logoUrl,
    })),
  );
  const tokens = await db
    .insert(schema.tokens)
    .values([
      ...canonicalRows,
      {
        // The one live reward token. Seed price is a bootstrap — the
        // first enrichToken call overwrites it with live DexScreener data.
        mint: ANSEM_MINT,
        symbol: ANSEM_SYMBOL,
        name: ANSEM_NAME,
        decimals: ANSEM_DECIMALS,
        category: "memecoin",
        isWhitelisted: true,
        whitelistedAt: daysAgo(10),
        isVerified: true,
        isAdminVerified: true,
        jupiterPriceUsd: "0.28",
        jupiterPriceUpdatedAt: hoursFromNow(-1),
        logoUrl: ANSEM_LOGO_URL,
      },
    ])
    .returning();
  console.log(`    ✓ ${tokens.length} tokens`);

  /* ---------------------------------------------------------------- smart accounts */
  // 20 placeholder smart accounts so the eligibility filter has
  // something to point at in dev. Real production list lands via
  // `npm run smart-accounts:seed -- ./data/smart-accounts.txt`.
  const smartSeedHandles = [
    { handle: "aeyakovenko", tier: "tier1" },
    { handle: "solana", tier: "tier1" },
    { handle: "ansem", tier: "tier1" },
    { handle: "rajgokal", tier: "tier1" },
    { handle: "armaniferrante", tier: "tier1" },
    { handle: "jup_dex", tier: "tier2" },
    { handle: "phantom", tier: "tier2" },
    { handle: "backpack_xyz", tier: "tier2" },
    { handle: "magiceden_nft", tier: "tier2" },
    { handle: "tensor_hq", tier: "tier2" },
    { handle: "solanafloor", tier: "standard" },
    { handle: "solanaspaces", tier: "standard" },
    { handle: "bagsdotfm", tier: "standard" },
    { handle: "drift_protocol", tier: "standard" },
    { handle: "kamino_lend", tier: "standard" },
    { handle: "marginfi", tier: "standard" },
    { handle: "metaplex", tier: "standard" },
    { handle: "helius_labs", tier: "standard" },
    { handle: "sanctumso", tier: "standard" },
    { handle: "step_finance_", tier: "standard" },
  ];
  const smartRows = await db
    .insert(schema.smartAccounts)
    .values(
      smartSeedHandles.map((s, i) => ({
        handle: s.handle,
        tier: s.tier,
        twitterId: `tw_smart_${i}`,
        displayName: s.handle.replace(/_/g, " "),
        followerCountSnapshot: between(50_000, 800_000),
        followersFullySynced: false,
        isActive: true,
      })),
    )
    .returning();
  console.log(
    `    ✓ ${smartRows.length} smart accounts (placeholder — run smart-accounts:seed for real data)`,
  );

  /* ---------------------------------------------------------------- users */
  // 1 admin (your test account)
  const [admin] = await db
    .insert(schema.users)
    .values({
      privyId: "did:privy:admin",
      walletAddress: "AdM1Nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      handle: "admin",
      displayName: "Admin",
      avatarUrl: "https://i.pravatar.cc/150?u=admin",
      bio: "bounties.fm test account",
      twitterId: "tw_admin",
      twitterHandle: "admin",
      twitterVerified: true,
      twitterFollowers: 12450,
      twitterFollowing: 320,
      twitterTweetCount: 8200,
      twitterAccountCreatedAt: daysAgo(1200),
      accountTier: "premium",
      reputationScore: "950.00",
      totalBountiesCompleted: 87,
      totalRewardsEarnedUsd: "12500.42",
      isCreatorVerified: true,
      referralCode: "ADMIN-OG",
    })
    .returning();

  // 5 creators
  const creatorRows = Array.from({ length: 5 }).map((_, i) => ({
    privyId: `did:privy:creator${i}`,
    walletAddress: `Cr3aT0r${i}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 44),
    handle: `creator_${i}`,
    displayName: `Creator ${i + 1}`,
    avatarUrl: `https://i.pravatar.cc/150?u=creator${i}`,
    bio: pick([
      "memecoin trenches",
      "Building in public",
      "DePIN maxi",
      "Solana eco contributor",
      "founder · launching soon",
    ]),
    twitterId: `tw_creator_${i}`,
    twitterHandle: `creator_${i}`,
    twitterVerified: rand() > 0.4,
    twitterFollowers: between(2_000, 80_000),
    twitterFollowing: between(100, 2_000),
    twitterTweetCount: between(500, 20_000),
    twitterAccountCreatedAt: daysAgo(between(180, 2000)),
    accountTier: "verified" as const,
    reputationScore: (600 + rand() * 300).toFixed(2),
    isCreatorVerified: rand() > 0.5,
    totalBountiesCreated: between(2, 25),
    totalSpentAsCreatorUsd: (rand() * 50_000).toFixed(2),
    referralCode: `CR${i.toString().padStart(2, "0")}`,
  }));
  const creators = await db
    .insert(schema.users)
    .values(creatorRows)
    .returning();

  // 10 hunters
  const hunterRows = Array.from({ length: 10 }).map((_, i) => {
    const followers = between(50, 50_000);
    const verified = followers > 5_000 && rand() > 0.5;
    return {
      privyId: `did:privy:hunter${i}`,
      walletAddress: `Hun73r${i}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.slice(
        0,
        44,
      ),
      handle: `hunter_${i}`,
      displayName: `Hunter ${i + 1}`,
      avatarUrl: `https://i.pravatar.cc/150?u=hunter${i}`,
      twitterId: `tw_hunter_${i}`,
      twitterHandle: `hunter_${i}`,
      twitterVerified: verified,
      twitterFollowers: followers,
      twitterFollowing: between(50, 5_000),
      twitterTweetCount: between(100, 30_000),
      twitterAccountCreatedAt: daysAgo(between(30, 2400)),
      accountTier: verified ? ("verified" as const) : ("standard" as const),
      reputationScore: (rand() * 800).toFixed(2),
      totalBountiesCompleted: between(0, 40),
      totalBountiesFailed: between(0, 8),
      totalRewardsEarnedUsd: (rand() * 5_000).toFixed(2),
      streakDays: between(0, 14),
      longestStreakDays: between(0, 42),
      referralCode: `HU${i.toString().padStart(2, "0")}`,
      referredByUserId: i === 0 ? admin.id : i > 5 ? null : admin.id,
    };
  });
  const hunters = await db
    .insert(schema.users)
    .values(hunterRows)
    .returning();

  console.log(
    `    ✓ ${1 + creators.length + hunters.length} users (1 admin, ${creators.length} creators, ${hunters.length} hunters)`,
  );

  /* ---------------------------------------------------------------- smart account followers */
  // For each hunter, randomly attach 0-12 smart accounts as their
  // followers. This populates the reverse-cache so the eligibility
  // filter has live data in dev without hitting twitterapi.io.
  const smartFollowerRows: (typeof schema.smartAccountFollowers.$inferInsert)[] = [];
  const huntersWithSmart: Array<{ id: string; count: number }> = [];
  const allHunters = [admin, ...creators, ...hunters];
  for (const u of allHunters) {
    const followCount = between(0, Math.min(12, smartRows.length));
    if (followCount === 0) {
      huntersWithSmart.push({ id: u.id, count: 0 });
      continue;
    }
    const shuffled = [...smartRows].sort(() => rand() - 0.5);
    for (const sa of shuffled.slice(0, followCount)) {
      smartFollowerRows.push({
        smartAccountId: sa.id,
        followerTwitterId: u.twitterId,
        followerHandle: u.handle,
      });
    }
    huntersWithSmart.push({ id: u.id, count: followCount });
  }
  if (smartFollowerRows.length > 0) {
    await db.insert(schema.smartAccountFollowers).values(smartFollowerRows);
  }
  // Persist the denorm so the eligibility check reads off `users` only.
  for (const h of huntersWithSmart) {
    if (h.count === 0) continue;
    await db
      .update(schema.users)
      .set({
        smartFollowerCount: h.count,
        smartFollowerLastCheckedAt: new Date(),
      })
      .where(eq(schema.users.id, h.id));
  }
  console.log(
    `    ✓ ${smartFollowerRows.length} smart_account_followers + denorm counts populated`,
  );

  /* ---------------------------------------------------------------- bounties */
  // Every fixture bounty pays ANSEM — the only reward token the product
  // supports. The old per-symbol aliases all resolve to the same row so
  // scenario definitions below stay untouched.
  const ansem = tokens.find((t) => t.mint === ANSEM_MINT)!;
  const usdc = ansem;
  const sol = ansem;
  const bnty = ansem;
  const wif = ansem;
  const bonk = ansem;
  const tokenList = [ansem];

  const emptyRules = {
    mustContainAll: [],
    forbidden: [],
    minLength: 0,
    minWordCount: 0,
    matchType: "word" as const,
  };
  const baseAction: ActionConfig = {
    like: false,
    retweet: true,
    follow: { required: false, targetHandle: "" },
    reply: { required: false, rules: emptyRules },
    quote: { required: false, rules: emptyRules },
  };

  const baseEligibility: EligibilityFilters = {
    minFollowers: null,
    requireVerified: false,
    minAccountAgeMonths: null,
    minReputationScore: null,
    allowedCountries: null,
    blockedCountries: null,
    minPreviousBounties: null,
    requireReputationTier: null,
  };

  const tweetSnapshot = (handle: string, text: string): TweetCachedData => ({
    authorId: `tw_${handle}`,
    authorHandle: handle,
    authorName: handle.replace(/_/g, " "),
    text,
    metrics: {
      likes: between(20, 5000),
      retweets: between(5, 800),
      replies: between(2, 300),
      quotes: between(0, 80),
    },
    capturedAt: new Date().toISOString(),
  });

  type BountySpec = {
    status: BountyStatus;
    creator: typeof creators[number];
    token: typeof tokens[number];
    rewardPerHunter: number;
    rewardPerHunterUsd: number;
    maxHunters: number;
    distributionModel: DistributionModel;
    requiresReply?: boolean;
    requiresQuote?: boolean;
    minFollowers?: number;
    requireVerified?: boolean;
    category: BountyCategory;
    tweetText: string;
    isFeatured?: boolean;
    daysOld: number;
    endsInHours: number;
    pendingCount?: number;
    claimedCount?: number;
    failedCount?: number;
  };

  const specs: BountySpec[] = [
    // 8 active
    {
      status: "active",
      creator: creators[0],
      token: usdc,
      rewardPerHunter: 5,
      rewardPerHunterUsd: 5,
      maxHunters: 200,
      distributionModel: "fixed_slot",
      category: "memecoin_launch",
      tweetText: "we live. $MEME launching on bags.fm tonight 🚀",
      isFeatured: true,
      daysOld: 1,
      endsInHours: 22,
      pendingCount: 12,
      claimedCount: 38,
      failedCount: 3,
    },
    {
      status: "active",
      creator: creators[1],
      token: sol,
      rewardPerHunter: 0.05,
      rewardPerHunterUsd: 8.42,
      maxHunters: 100,
      distributionModel: "fixed_slot",
      requireVerified: true,
      minFollowers: 1000,
      category: "brand_marketing",
      tweetText: "Spread the word about our new launch — RT to qualify.",
      daysOld: 2,
      endsInHours: 48,
      pendingCount: 4,
      claimedCount: 18,
      failedCount: 1,
    },
    {
      status: "active",
      creator: creators[2],
      token: bnty,
      rewardPerHunter: 250,
      rewardPerHunterUsd: 10.52,
      maxHunters: 500,
      distributionModel: "pool_quadratic",
      requiresReply: true,
      category: "community_engagement",
      tweetText: "Reply with your favorite Solana primitive 👇",
      daysOld: 3,
      endsInHours: 72,
      pendingCount: 22,
      claimedCount: 110,
      failedCount: 12,
    },
    {
      status: "active",
      creator: creators[3],
      token: wif,
      rewardPerHunter: 5,
      rewardPerHunterUsd: 10.9,
      maxHunters: 50,
      distributionModel: "pool_lottery",
      category: "memecoin_launch",
      tweetText: "wif hunters assemble. quote tweet for entry.",
      requiresQuote: true,
      daysOld: 0,
      endsInHours: 4,
      pendingCount: 1,
      claimedCount: 8,
      failedCount: 0,
    },
    {
      status: "active",
      creator: creators[4],
      token: bonk,
      rewardPerHunter: 100_000,
      rewardPerHunterUsd: 1.89,
      maxHunters: 1000,
      distributionModel: "fixed_slot",
      category: "community_engagement",
      tweetText: "Tag a friend, like + RT for BONK 🔥",
      daysOld: 0,
      endsInHours: 12,
      pendingCount: 80,
      claimedCount: 420,
      failedCount: 21,
    },
    {
      status: "active",
      creator: creators[0],
      token: usdc,
      rewardPerHunter: 2,
      rewardPerHunterUsd: 2,
      maxHunters: 1000,
      distributionModel: "fixed_slot",
      category: "creator_promo",
      tweetText: "Help our creator hit 100k 🙏 — like + RT.",
      daysOld: 4,
      endsInHours: 96,
      pendingCount: 0,
      claimedCount: 5,
      failedCount: 0,
    },
    {
      status: "active",
      creator: creators[1],
      token: sol,
      rewardPerHunter: 0.1,
      rewardPerHunterUsd: 16.84,
      maxHunters: 25,
      distributionModel: "quality_tiered",
      requiresReply: true,
      minFollowers: 5000,
      requireVerified: true,
      category: "product_launch",
      tweetText: "Show us how you'd use this — best replies win 1.5x.",
      isFeatured: true,
      daysOld: 1,
      endsInHours: 36,
      pendingCount: 3,
      claimedCount: 6,
      failedCount: 1,
    },
    {
      status: "active",
      creator: creators[2],
      token: bnty,
      rewardPerHunter: 50,
      rewardPerHunterUsd: 2.1,
      maxHunters: 2000,
      distributionModel: "fixed_slot",
      category: "brand_marketing",
      tweetText: "Repost to spread the word 🚨",
      daysOld: 2,
      endsInHours: 60,
      pendingCount: 50,
      claimedCount: 311,
      failedCount: 18,
    },
    // 3 completed
    {
      status: "completed",
      creator: creators[3],
      token: usdc,
      rewardPerHunter: 1,
      rewardPerHunterUsd: 1,
      maxHunters: 100,
      distributionModel: "fixed_slot",
      category: "community_engagement",
      tweetText: "Help us hit 1k followers — like + RT.",
      daysOld: 10,
      endsInHours: -120,
      pendingCount: 0,
      claimedCount: 100,
      failedCount: 8,
    },
    {
      status: "completed",
      creator: creators[4],
      token: sol,
      rewardPerHunter: 0.02,
      rewardPerHunterUsd: 3.37,
      maxHunters: 50,
      distributionModel: "fixed_slot",
      category: "memecoin_launch",
      tweetText: "Launch week recap — RT if you got fills.",
      daysOld: 7,
      endsInHours: -48,
      pendingCount: 0,
      claimedCount: 50,
      failedCount: 4,
    },
    {
      status: "completed",
      creator: creators[0],
      token: wif,
      rewardPerHunter: 2,
      rewardPerHunterUsd: 4.36,
      maxHunters: 200,
      distributionModel: "pool_quadratic",
      requiresReply: true,
      category: "creator_promo",
      tweetText: "Best alpha drop — reply with your trade.",
      daysOld: 14,
      endsInHours: -240,
      pendingCount: 0,
      claimedCount: 198,
      failedCount: 22,
    },
    // 2 draft
    {
      status: "draft",
      creator: creators[1],
      token: bnty,
      rewardPerHunter: 500,
      rewardPerHunterUsd: 21.05,
      maxHunters: 100,
      distributionModel: "fixed_slot",
      category: "brand_marketing",
      tweetText: "(scheduled) BNTY drop incoming.",
      daysOld: 0,
      endsInHours: 168,
    },
    {
      status: "draft",
      creator: creators[2],
      token: usdc,
      rewardPerHunter: 3,
      rewardPerHunterUsd: 3,
      maxHunters: 333,
      distributionModel: "fixed_slot",
      category: "product_launch",
      tweetText: "(scheduled) launch reveal — to be announced.",
      daysOld: 0,
      endsInHours: 96,
    },
    // 1 cancelled
    {
      status: "cancelled",
      creator: creators[3],
      token: bonk,
      rewardPerHunter: 50_000,
      rewardPerHunterUsd: 0.95,
      maxHunters: 500,
      distributionModel: "fixed_slot",
      category: "memecoin_launch",
      tweetText: "BONK partnership update — actually nvm.",
      daysOld: 5,
      endsInHours: -48,
      pendingCount: 0,
      claimedCount: 0,
      failedCount: 0,
    },
    // 1 refunded
    {
      status: "refunded",
      creator: creators[4],
      token: usdc,
      rewardPerHunter: 10,
      rewardPerHunterUsd: 10,
      maxHunters: 50,
      distributionModel: "fixed_slot",
      category: "creator_promo",
      tweetText: "We're refunding this one — long story.",
      daysOld: 12,
      endsInHours: -72,
      pendingCount: 0,
      claimedCount: 0,
      failedCount: 0,
    },
  ];

  const bountyRows = specs.map((s, i) => {
    const action: ActionConfig = {
      ...baseAction,
      reply: {
        required: !!s.requiresReply,
        rules: { ...baseAction.reply.rules },
      },
      quote: {
        required: !!s.requiresQuote,
        rules: { ...baseAction.quote.rules },
      },
    };
    const eligibility: EligibilityFilters = {
      ...baseEligibility,
      minFollowers: s.minFollowers ?? null,
      requireVerified: s.requireVerified ?? false,
    };
    const totalPool = s.rewardPerHunter * s.maxHunters;
    const totalPoolUsd = s.rewardPerHunterUsd * s.maxHunters;
    return {
      creatorUserId: s.creator.id,
      slug: `${s.category.split("_")[0]}-${i}-${s.creator.handle.slice(-1)}${between(100, 999)}`,
      status: s.status,
      tweetId: `tweet_${i}_${between(10000, 99999)}`,
      tweetUrl: `https://x.com/${s.creator.twitterHandle}/status/${1_000_000 + i}`,
      tweetAuthorTwitterId: s.creator.twitterId,
      tweetAuthorHandle: s.creator.twitterHandle,
      tweetCachedData: tweetSnapshot(s.creator.twitterHandle, s.tweetText),
      tweetIsOwnedByCreator: true,
      actionConfig: action,
      requiresLike: action.like,
      requiresRetweet: action.retweet,
      requiresReply: action.reply.required,
      requiresQuote: action.quote.required,
      requiresFollow: action.follow.required,
      followTargetHandle: action.follow.required
        ? action.follow.targetHandle
        : null,
      replyMinLength: 0,
      replyMinWords: 0,
      replyMatchType: "word" as const,
      rewardTokenMint: s.token.mint,
      rewardTokenSymbol: s.token.symbol,
      rewardTokenDecimals: s.token.decimals,
      rewardPerHunter: s.rewardPerHunter.toString(),
      rewardPerHunterUsd: s.rewardPerHunterUsd.toFixed(6),
      maxHunters: s.maxHunters,
      totalPool: totalPool.toString(),
      totalPoolUsd: totalPoolUsd.toFixed(6),
      platformFeeBps: 500,
      platformFeeAmount: (totalPool * 0.05).toFixed(9),
      distributionModel: s.distributionModel,
      eligibilityFilters: eligibility,
      minFollowers: eligibility.minFollowers,
      requireVerified: eligibility.requireVerified,
      onChainStatus:
        s.status === "completed"
          ? "distributed"
          : s.status === "refunded"
            ? "refunded"
            : s.status === "draft"
              ? "pending"
              : "escrowed",
      escrowTxHash:
        s.status === "draft" || s.status === "cancelled"
          ? null
          : `escrow_tx_${i}_${between(100000, 999999)}`,
      escrowConfirmedAt:
        s.status === "draft" || s.status === "cancelled"
          ? null
          : daysAgo(s.daysOld),
      escrowAmount:
        s.status === "draft" || s.status === "cancelled"
          ? null
          : totalPool.toString(),
      createdAt: daysAgo(s.daysOld),
      updatedAt: daysAgo(s.daysOld),
      publishedAt:
        s.status === "draft" ? null : daysAgo(Math.max(0, s.daysOld - 0.1)),
      endsAt: hoursFromNow(s.endsInHours),
      completedAt: s.status === "completed" ? hoursFromNow(s.endsInHours) : null,
      cancelledAt: s.status === "cancelled" ? hoursFromNow(s.endsInHours) : null,
      currentHuntersCount:
        (s.pendingCount ?? 0) + (s.claimedCount ?? 0) + (s.failedCount ?? 0),
      claimedHuntersCount: s.claimedCount ?? 0,
      failedHuntersCount: s.failedCount ?? 0,
      pendingHuntersCount: s.pendingCount ?? 0,
      viewCount: between(50, 12_000),
      shareCount: between(0, 200),
      isFeatured: s.isFeatured ?? false,
      featuredUntil: s.isFeatured ? daysFromNow(2) : null,
      visibilityType: "public" as const,
      tags: pick([
        ["meme", "launch"],
        ["solana", "launch"],
        ["community", "rt"],
        ["alpha", "trading"],
        ["brand", "marketing"],
      ]),
      category: s.category,
    };
  });

  const bounties = await db
    .insert(schema.bounties)
    .values(bountyRows)
    .returning();
  console.log(`    ✓ ${bounties.length} bounties`);

  /* ---------------------------------------------------------------- claims */
  const claimStatuses: ClaimStatus[] = [
    "awaiting_action",
    "action_claimed",
    "initial_verified",
    "awaiting_final",
    "verified",
    "failed",
    "claimed_reward",
    "expired",
    "cancelled",
  ];

  const claimRows: (typeof schema.claims.$inferInsert)[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (claimRows.length < 30 && i < 500) {
    const bounty = pick(bounties);
    const hunter = pick(hunters);
    const key = `${bounty.id}:${hunter.id}`;
    if (seen.has(key)) {
      i++;
      continue;
    }
    seen.add(key);
    // Distribute across statuses; bias active bounties toward in-flight states.
    const status =
      bounty.status === "completed"
        ? pick<ClaimStatus>(["claimed_reward", "failed", "expired"])
        : bounty.status === "active"
          ? claimStatuses[claimRows.length % claimStatuses.length]
          : "cancelled";

    const huntStartedAt = daysAgo(rand() * 6);
    const actionClaimedAt =
      ["action_claimed", "initial_verified", "awaiting_final", "verified", "failed", "claimed_reward", "expired"].includes(
        status,
      )
        ? new Date(huntStartedAt.getTime() + 1000 * 60 * between(2, 30))
        : null;
    const initialVerifiedAt =
      ["initial_verified", "awaiting_final", "verified", "claimed_reward", "expired"].includes(
        status,
      ) && actionClaimedAt
        ? new Date(actionClaimedAt.getTime() + 1000 * 60 * 2)
        : null;
    const finalCheckScheduledAt = actionClaimedAt
      ? new Date(actionClaimedAt.getTime() + 1000 * 60 * 60 * 24)
      : null;
    const finalVerifiedAt =
      ["verified", "claimed_reward", "expired"].includes(status) &&
      finalCheckScheduledAt
        ? finalCheckScheduledAt
        : null;
    const claimWindowEndsAt = finalVerifiedAt
      ? new Date(finalVerifiedAt.getTime() + 1000 * 60 * 60 * 48)
      : null;

    claimRows.push({
      bountyId: bounty.id,
      hunterUserId: hunter.id,
      status,
      huntStartedAt,
      actionClaimedAt,
      initialVerifiedAt,
      finalCheckScheduledAt,
      finalCheckAttemptedAt: finalVerifiedAt,
      finalVerifiedAt,
      claimWindowEndsAt,
      claimedAt: status === "claimed_reward" ? finalVerifiedAt : null,
      failedAt: status === "failed" ? actionClaimedAt : null,
      cancelledAt: status === "cancelled" ? huntStartedAt : null,
      expiredAt: status === "expired" ? claimWindowEndsAt : null,
      likeVerified: bounty.requiresLike ? status !== "failed" : null,
      retweetVerified: bounty.requiresRetweet ? status !== "failed" : null,
      replyVerified: bounty.requiresReply
        ? status === "failed"
          ? false
          : status === "awaiting_action"
            ? null
            : true
        : null,
      replyTweetId: bounty.requiresReply ? `reply_${claimRows.length}` : null,
      replyText: bounty.requiresReply
        ? "great launch, lfg 🚀"
        : null,
      quoteVerified: bounty.requiresQuote ? status !== "failed" : null,
      failureReason: status === "failed" ? "Like was withdrawn before final check." : null,
      failureCategory: status === "failed" ? "action_withdrawn" : null,
      verificationAttempts: ["verified", "claimed_reward", "expired"].includes(status)
        ? 2
        : status === "awaiting_action"
          ? 0
          : 1,
      rewardAmount: bounty.rewardPerHunter,
      rewardAmountUsd: bounty.rewardPerHunterUsd,
      rewardTokenMint: bounty.rewardTokenMint,
      rewardTokenSymbol: bounty.rewardTokenSymbol,
      platformFeeAmount: (Number(bounty.rewardPerHunter) * 0.05).toFixed(9),
      claimTxHash:
        status === "claimed_reward" ? `claim_tx_${claimRows.length}_${between(100, 999)}` : null,
      claimTxConfirmedAt: status === "claimed_reward" ? finalVerifiedAt : null,
      sessionDurationSeconds: between(45, 600),
      mouseEventsCount: between(20, 800),
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
      userTwitterFollowersAtHunt: hunter.twitterFollowers,
      userTwitterVerifiedAtHunt: hunter.twitterVerified,
      userReputationScoreAtHunt: hunter.reputationScore,
      createdAt: huntStartedAt,
      updatedAt: huntStartedAt,
    });
    i++;
  }
  const claims = await db.insert(schema.claims).values(claimRows).returning();
  console.log(`    ✓ ${claims.length} claims`);

  // Phase 8 polish (F3): recompute the denormalized counters on
  // bounties so they match the actual rows we just inserted. Without
  // this, seed-time fudging of huntersCount can leave claimedHuntersCount
  // exceeding the real number of claim rows in `claimed_reward`, which
  // breaks refund math in any test that reseeds.
  await db.execute(sql`
    UPDATE bounties b SET
      current_hunters_count = (
        SELECT COUNT(*) FROM claims c
        WHERE c.bounty_id = b.id
          AND c.status IN ('initial_verified', 'awaiting_final', 'verified', 'claiming', 'claimed_reward')
      ),
      pending_hunters_count = (
        SELECT COUNT(*) FROM claims c
        WHERE c.bounty_id = b.id
          AND c.status IN ('awaiting_action', 'action_claimed')
      ),
      claimed_hunters_count = (
        SELECT COUNT(*) FROM claims c
        WHERE c.bounty_id = b.id AND c.status = 'claimed_reward'
      ),
      failed_hunters_count = (
        SELECT COUNT(*) FROM claims c
        WHERE c.bounty_id = b.id AND c.status = 'failed'
      )
  `);
  console.log("    ✓ bounty counters reconciled");

  /* ---------------------------------------------------------------- notifications */
  const adminNotifTypes = [
    "claim_initial_verified",
    "claim_final_verified",
    "claim_ready_to_claim",
    "claim_window_expiring",
    "claim_failed",
    "bounty_filled",
    "buyback_completed",
    "referral_signup",
    "reputation_tier_up",
    "new_eligible_bounty",
  ];
  const notifRows = Array.from({ length: 20 }).map((_, n) => {
    const type = adminNotifTypes[n % adminNotifTypes.length];
    const bounty = pick(bounties);
    return {
      userId: admin.id,
      type,
      title:
        type === "buyback_completed"
          ? "Weekly buyback executed 🔥"
          : type === "referral_signup"
            ? "Someone joined with your code"
            : type === "reputation_tier_up"
              ? "You leveled up to Verified"
              : `${type.replace(/_/g, " ")} · ${bounty.rewardTokenSymbol}`,
      body:
        type === "buyback_completed"
          ? "$1,240 in fees → 28k BNTY burned."
          : `Bounty: ${bounty.tweetCachedData.text.slice(0, 50)}…`,
      relatedBountyId: bounty.id,
      read: n > 12,
      readAt: n > 12 ? daysAgo(rand() * 3) : null,
      delivered: true,
      deliveredAt: daysAgo(rand() * 4),
      channels: ["web"],
      createdAt: daysAgo(rand() * 7),
    } satisfies typeof schema.notifications.$inferInsert;
  });
  await db.insert(schema.notifications).values(notifRows);
  console.log(`    ✓ ${notifRows.length} notifications (admin)`);

  /* ---------------------------------------------------------------- social */
  const followRows = [
    ...hunters.slice(0, 6).map((h) => ({
      followerUserId: h.id,
      followingUserId: admin.id,
    })),
    ...creators.slice(0, 3).map((c) => ({
      followerUserId: admin.id,
      followingUserId: c.id,
    })),
    ...hunters.slice(0, 4).map((h, idx) => ({
      followerUserId: h.id,
      followingUserId: creators[idx % creators.length].id,
    })),
  ];
  await db.insert(schema.socialFollows).values(followRows);

  const activeBounties = bounties.filter((b) => b.status === "active");
  const activityRows = [
    ...creators.slice(0, 4).map((c, idx) => ({
      actorUserId: c.id,
      type: "bounty_created" as const,
      bountyId: activeBounties[idx % activeBounties.length]?.id ?? null,
      metadata: { rewardSymbol: bounties[idx].rewardTokenSymbol },
      createdAt: daysAgo(rand() * 5),
    })),
    ...hunters.slice(0, 6).map((h, idx) => ({
      actorUserId: h.id,
      type: "claim_verified" as const,
      bountyId: activeBounties[idx % activeBounties.length]?.id ?? null,
      claimId: claims[idx % claims.length]?.id ?? null,
      metadata: { tier: h.accountTier },
      createdAt: daysAgo(rand() * 5),
    })),
  ];
  await db.insert(schema.socialActivities).values(activityRows);
  console.log(
    `    ✓ ${followRows.length} follows, ${activityRows.length} activities`,
  );

  /* ---------------------------------------------------------------- revenue */
  const claimedRewardClaims = claims.filter(
    (c) => c.status === "claimed_reward",
  );
  if (claimedRewardClaims.length > 0) {
    const revenueRows = claimedRewardClaims.slice(0, 10).map((c) => {
      const tokenInfo = tokenList.find((t) => t.mint === c.rewardTokenMint)!;
      const feeAmt = Number(c.rewardAmount) * 0.05;
      const feeUsd = Number(c.rewardAmountUsd ?? 0) * 0.05;
      return {
        sourceType: "claim_fee" as const,
        claimId: c.id,
        bountyId: c.bountyId,
        amount: feeAmt.toFixed(9),
        amountUsd: feeUsd.toFixed(6),
        tokenMint: c.rewardTokenMint,
        tokenSymbol: tokenInfo.symbol,
        includedInBuyback: false,
        createdAt: c.claimedAt ?? daysAgo(rand() * 7),
      } satisfies typeof schema.platformRevenue.$inferInsert;
    });
    await db.insert(schema.platformRevenue).values(revenueRows);
    console.log(`    ✓ ${revenueRows.length} platform_revenue rows`);
  }

  /* ---------------------------------------------------------------- api log */
  const apiServices: string[] = ["twitterapi", "jupiter", "helius", "solana"];
  const apiCallRows = Array.from({ length: 25 }).map((_, idx) => ({
    service: pick(apiServices),
    endpoint: pick([
      "/twitter/tweet/likes",
      "/twitter/tweet/retweets",
      "/twitter/tweet/replies",
      "/jupiter/quote",
      "/helius/getAsset",
    ]),
    method: "GET" as const,
    statusCode: rand() > 0.05 ? 200 : 429,
    success: rand() > 0.05,
    estimatedCostUsd: (rand() * 0.005).toFixed(8),
    responseTimeMs: between(80, 1200),
    bountyId: idx % 3 === 0 ? pick(bounties).id : null,
    createdAt: daysAgo(rand() * 7),
  }));
  await db.insert(schema.apiCallLog).values(apiCallRows);
  console.log(`    ✓ ${apiCallRows.length} api_call_log rows`);

  /* ---------------------------------------------------------------- summary */
  const [{ userCount }] = await db.execute<{ userCount: number }>(
    sql`SELECT COUNT(*)::int as "userCount" FROM users`,
  );
  const [{ bountyCount }] = await db.execute<{ bountyCount: number }>(
    sql`SELECT COUNT(*)::int as "bountyCount" FROM bounties`,
  );
  const [{ claimCount }] = await db.execute<{ claimCount: number }>(
    sql`SELECT COUNT(*)::int as "claimCount" FROM claims`,
  );
  const [{ notifCount }] = await db.execute<{ notifCount: number }>(
    sql`SELECT COUNT(*)::int as "notifCount" FROM notifications`,
  );

  console.log("");
  console.log("✅  Seed complete");
  console.log(`    users:          ${userCount}`);
  console.log(`    bounties:       ${bountyCount}`);
  console.log(`    claims:         ${claimCount}`);
  console.log(`    notifications:  ${notifCount}`);

  await client.end();
}

main().catch((err) => {
  console.error("❌  seed failed:", err);
  process.exit(1);
});
