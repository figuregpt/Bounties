import { z } from "zod";
import { getCanonicalBySymbol } from "@/lib/tokens/canonical";

/**
 * Zod schema for the create-bounty form. Used both client-side
 * (react-hook-form resolver) and server-side (POST /api/bounties body).
 *
 * The form mirrors the Phase 2 schema's denormalized columns so the
 * server can write the row without re-deriving fields.
 */

/* =========================================================================
   Constants (re-exported for the UI to render the same options)
   ========================================================================= */

/** Sentinel for the 5-minute test mode. Real value is 5/60 hours;
 *  declared as a named constant so client and server share the exact
 *  JS number representation for the `.includes` validation check. */
export const FIVE_MINUTES_HOURS = 5 / 60;
export const DURATION_HOURS_OPTIONS = [
  FIVE_MINUTES_HOURS,
  6,
  12,
  24,
  48,
  72,
] as const;
export type DurationHours = (typeof DURATION_HOURS_OPTIONS)[number];

/**
 * Flat USD fee creators pay to launch a bounty. Covers verification API
 * spend and infra. Collected on-chain as part of the escrow transfer
 * (see [src/app/(app)/create/create-bounty-client.tsx] and the
 * [/api/bounties/[slug]/launch] route) and recorded in `platform_revenue`
 * with sourceType='creation_fee'.
 */
export const BOUNTY_CREATION_FEE_USD = 1;
/** Spec-friendly alias. Same value, same source-of-truth. */
export const CREATION_FEE_USD = BOUNTY_CREATION_FEE_USD;

/**
 * Two independent minimum-reward floors. Both must pass for the
 * bounty to launch — `perHunter × maxHunters = totalPool`, so the
 * thresholds gate two different abuse vectors:
 *
 *   • Per-hunter floor — protects a hunter's time on any single
 *     verification. Below $0.50 even fast hunters can't earn enough to
 *     cover the cognitive cost of figuring out the bounty.
 *
 *   • Total-pool floor — protects the platform from spam launches.
 *     A creator setting up 100 slots × $0.50 = $50 is a real campaign;
 *     1 slot × $0.50 = $0.50 is noise.
 *
 * Enforced server-side in [POST /api/bounties] AND client-side in the
 * create form so the launch button reflects validity live.
 */
export const MIN_REWARD_PER_HUNTER_USD = 0.5;
export const MIN_TOTAL_POOL_USD = 10;

export const DISTRIBUTION_MODELS = [
  "fixed_slot",
  "pool_quadratic",
  "pool_lottery",
  "quality_tiered",
] as const;

export const BOUNTY_CATEGORIES = [
  "memecoin_launch",
  "brand_marketing",
  "community_engagement",
  "product_launch",
  "creator_promo",
  "other",
] as const;

export const MATCH_TYPES = ["word", "string"] as const;

export const REPUTATION_TIERS = [
  "standard",
  "verified",
  "premium",
] as const;

/* =========================================================================
   Sub-schemas
   ========================================================================= */

/** Shared rules schema for reply + quote. Phase 6 drops the
 *  "must include N of pool" sub-rule. */
const TextActionRulesSchema = z.object({
  mustContainAll: z
    .array(
      z
        .string()
        .min(1, { message: "Keywords can't be blank" })
        .max(80, { message: "Keep each keyword under 80 characters" }),
    )
    .max(20, { message: "Up to 20 must-contain keywords" }),
  forbidden: z
    .array(
      z
        .string()
        .min(1, { message: "Forbidden words can't be blank" })
        .max(80, { message: "Keep each forbidden word under 80 characters" }),
    )
    .max(20, { message: "Up to 20 forbidden words" }),
  minLength: z
    .number()
    .int({ message: "Minimum length must be a whole number" })
    .min(0, { message: "Minimum length can't be negative" })
    .max(1000, { message: "Minimum length is too high (max 1000)" }),
  minWordCount: z
    .number()
    .int({ message: "Minimum words must be a whole number" })
    .min(0, { message: "Minimum words can't be negative" })
    .max(200, { message: "Minimum words is too high (max 200)" }),
  matchType: z.enum(MATCH_TYPES, {
    message: "Pick a match type",
  }),
});

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

const FollowActionSchema = z
  .object({
    required: z.boolean(),
    targetHandle: z
      .string()
      .max(15, { message: "Twitter handles are 15 characters or fewer" })
      .transform((s) => s.replace(/^@/, "").trim().toLowerCase()),
  })
  .refine(
    (f) =>
      !f.required ||
      (f.targetHandle.length > 0 && HANDLE_PATTERN.test(f.targetHandle)),
    {
      message:
        "Pick the @handle hunters need to follow (letters, numbers and underscore only)",
      path: ["targetHandle"],
    },
  );

const ActionConfigSchema = z
  .object({
    /** Deprecated in Phase 6. The UI no longer offers it and we ignore
     *  the value when verifying claims (Phase 7). Type stays `boolean`
     *  so rows seeded before this phase still parse — new bounties
     *  always send `false`. */
    like: z.boolean(),
    retweet: z.boolean(),
    reply: z.object({
      required: z.boolean(),
      rules: TextActionRulesSchema,
    }),
    follow: FollowActionSchema,
    quote: z.object({
      required: z.boolean(),
      rules: TextActionRulesSchema,
    }),
  })
  .refine(
    (a) =>
      a.retweet || a.reply.required || a.follow.required || a.quote.required,
    { message: "Pick at least one action hunters need to complete" },
  );

/**
 * Smart followers config.
 *
 * Phase 6.3: just a minimum count. The smart-accounts list itself is
 * global (curated in `smart_accounts` table, loaded from
 * `data/smart-accounts.txt`), so individual bounty creators don't
 * supply handles. `enabled` is derived from `minimum > 0`.
 */
const SmartFollowersSchema = z.object({
  minimum: z
    .number()
    .int({ message: "Smart follower minimum must be a whole number" })
    .min(0, { message: "Smart follower minimum can't be negative" })
    .max(50, { message: "Smart follower minimum is capped at 50" }),
});

const EligibilityFiltersSchema = z.object({
  minFollowers: z
    .number()
    .int({ message: "Minimum followers must be a whole number" })
    .min(0, { message: "Minimum followers can't be negative" })
    .max(10_000_000, { message: "Minimum followers is too high" })
    .nullable(),
  requireVerified: z.boolean(),
  minAccountAgeMonths: z
    .number()
    .int({ message: "Account age must be a whole number of months" })
    .min(0, { message: "Account age can't be negative" })
    .max(240, { message: "Account age is capped at 240 months" })
    .nullable(),
  minReputationScore: z
    .number()
    .min(0, { message: "Reputation score can't be negative" })
    .max(1000, { message: "Reputation score is capped at 1000" })
    .nullable(),
  allowedCountries: z
    .array(z.string().length(2, { message: "Use 2-letter country codes" }))
    .nullable(),
  blockedCountries: z
    .array(z.string().length(2, { message: "Use 2-letter country codes" }))
    .nullable(),
  minPreviousBounties: z
    .number()
    .int({ message: "Previous bounties must be a whole number" })
    .min(0, { message: "Previous bounties can't be negative" })
    .max(10_000, { message: "Previous bounties is too high" })
    .nullable(),
  requireReputationTier: z
    .enum(REPUTATION_TIERS, { message: "Pick a reputation tier" })
    .nullable(),
  smartFollowers: SmartFollowersSchema.nullable().default(null),
});

/* =========================================================================
   The form schema
   ========================================================================= */

export const CreateBountySchema = z.object({
  // Tweet ---------------------------------------------------------------
  tweetUrl: z
    .string()
    .url({ message: "Please paste a valid tweet URL" })
    .refine(
      (s) => {
        try {
          const u = new URL(s);
          return (
            /(?:^|\.)(twitter|x)\.com$/i.test(u.hostname) &&
            /\/status\/\d{6,25}(?:\/?|$)/.test(u.pathname)
          );
        } catch {
          return false;
        }
      },
      {
        message:
          "Paste a Twitter or X tweet URL — e.g. https://x.com/user/status/12345",
      },
    ),

  // Actions -------------------------------------------------------------
  actionConfig: ActionConfigSchema,

  // Reward --------------------------------------------------------------
  rewardTokenMint: z
    .string()
    .min(32, { message: "Reward token mint looks invalid" })
    .max(44, { message: "Reward token mint looks invalid" }),
  rewardTokenSymbol: z
    .string()
    .min(1, { message: "Pick a reward token" })
    .max(20, { message: "Token symbol is too long" }),
  rewardTokenDecimals: z
    .number()
    .int({ message: "Token decimals must be a whole number" })
    .min(0, { message: "Token decimals can't be negative" })
    .max(18, { message: "Token decimals is capped at 18" }),
  rewardPerHunter: z
    .number()
    .positive({ message: "Reward must be greater than 0" }),
  rewardPerHunterUsd: z
    .number()
    .min(0, { message: "USD value can't be negative" })
    .nullable(),
  maxHunters: z
    .number()
    .int({ message: "Number of slots must be a whole number" })
    .min(1, { message: "Number of slots must be at least 1" })
    .max(10_000, { message: "Number of slots is capped at 10,000" }),

  // Eligibility ---------------------------------------------------------
  eligibilityFilters: EligibilityFiltersSchema,

  // Distribution + lifecycle -------------------------------------------
  distributionModel: z.enum(DISTRIBUTION_MODELS, {
    message: "Pick a distribution model",
  }),
  durationHours: z
    .number()
    .refine(
      (v) => (DURATION_HOURS_OPTIONS as readonly number[]).includes(v),
      { message: "Pick one of the offered campaign durations" },
    ),

  // Optional metadata --------------------------------------------------
  category: z
    .enum(BOUNTY_CATEGORIES, { message: "Pick a category" })
    .default("community_engagement"),
  tags: z
    .array(
      z
        .string()
        .min(1, { message: "Tags can't be blank" })
        .max(30, { message: "Keep each tag under 30 characters" }),
    )
    .max(10, { message: "Up to 10 tags" })
    .optional(),
});

export type CreateBountyInput = z.infer<typeof CreateBountySchema>;

/* =========================================================================
   Helpers
   ========================================================================= */

/** Extracts the tweet ID from a x.com / twitter.com URL. */
export function extractTweetId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(?:^|\.)(twitter|x)\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/status\/(\d{6,25})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Default form values — used by react-hook-form's `defaultValues`.
 *  The reward-token default resolves through the network-aware
 *  canonical map so devnet builds prefill devnet USDC's mint. */
export function defaultCreateBountyValues(
  defaults: Partial<CreateBountyInput> = {},
): CreateBountyInput {
  // USDC is canonical in every supported network — getCanonicalBySymbol
  // is guaranteed to return a row. The non-null assertion below means a
  // missing canonical surfaces immediately as a developer error instead
  // of silently falling back to a different network's mint (the bug
  // that drove the Phase 9A "mainnet USDC on devnet" incident).
  const usdc = getCanonicalBySymbol("USDC")!;
  return {
    tweetUrl: "",
    actionConfig: {
      like: false,
      // Reply is the default-on action — it's the most-valuable
      // engagement and toggling it reveals the rules section so
      // creators see the configuration surface immediately. Retweet
      // stays off so users make an explicit choice.
      retweet: false,
      follow: { required: false, targetHandle: "" },
      reply: {
        required: true,
        rules: emptyTextRules(),
      },
      quote: {
        required: false,
        rules: emptyTextRules(),
      },
    },
    rewardTokenMint: usdc.mint,
    rewardTokenSymbol: usdc.symbol,
    rewardTokenDecimals: usdc.decimals,
    rewardPerHunter: 1,
    rewardPerHunterUsd: 1,
    maxHunters: 100,
    eligibilityFilters: {
      minFollowers: null,
      requireVerified: false,
      minAccountAgeMonths: null,
      minReputationScore: null,
      allowedCountries: null,
      blockedCountries: null,
      minPreviousBounties: null,
      requireReputationTier: null,
      smartFollowers: { minimum: 0 },
    },
    distributionModel: "fixed_slot",
    durationHours: 24,
    category: "community_engagement",
    tags: [],
    ...defaults,
  };
}

/** Empty rules block reused by reply + quote defaults. */
export function emptyTextRules(): import("@/types/database").TextActionRules {
  return {
    mustContainAll: [],
    forbidden: [],
    minLength: 0,
    minWordCount: 0,
    matchType: "word",
  };
}
