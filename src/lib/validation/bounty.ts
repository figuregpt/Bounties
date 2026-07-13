import { z } from "zod";
import {
  ANSEM_DECIMALS,
  ANSEM_MINT,
  ANSEM_SYMBOL,
  MIN_REWARD_PER_HUNTER_ANSEM,
} from "@/lib/tokens/ansem";

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

export const DURATION_HOURS_OPTIONS = [6, 12, 24, 48, 72] as const;
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
 * Minimum reward per winner: 1 ANSEM, denominated in token units (the
 * old USD floors are gone — at ANSEM prices they'd contradict the
 * 1-ANSEM rule). `perHunter × maxHunters = totalPool`, so a
 * 1000-ANSEM pool can pay at most 1000 winners.
 *
 * Enforced server-side in [POST /api/bounties] AND client-side in the
 * create form so the launch button reflects validity live.
 */
export { MIN_REWARD_PER_HUNTER_ANSEM } from "@/lib/tokens/ansem";

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
  // Holder gate is ANSEM-only: mint/symbol/decimals are pinned so a
  // stale or tampered client can't gate on another token. Creators only
  // choose the minimum balance.
  holderRequirement: z
    .object({
      mint: z.literal(ANSEM_MINT, {
        message: "Holder requirement token is fixed to $ANSEM",
      }),
      minAmount: z
        .number()
        .positive({ message: "Minimum balance must be positive" }),
      symbol: z.literal(ANSEM_SYMBOL),
      decimals: z.literal(ANSEM_DECIMALS),
    })
    .nullable()
    .default(null),
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
  // Reward token is fixed to $ANSEM on Solana. The literals keep old
  // clients honest — anything else fails validation instead of silently
  // creating a differently-denominated bounty. The server re-canonicalizes
  // from the enrichment row regardless.
  rewardTokenMint: z.literal(ANSEM_MINT, {
    message: "Rewards are paid in $ANSEM only",
  }),
  rewardTokenSymbol: z.literal(ANSEM_SYMBOL),
  rewardTokenDecimals: z.literal(ANSEM_DECIMALS),
  rewardPerHunter: z
    .number()
    .min(MIN_REWARD_PER_HUNTER_ANSEM, {
      message: `Each winner must earn at least ${MIN_REWARD_PER_HUNTER_ANSEM} ANSEM`,
    }),
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
 *  The reward token is always $ANSEM. */
export function defaultCreateBountyValues(
  defaults: Partial<CreateBountyInput> = {},
): CreateBountyInput {
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
    rewardTokenMint: ANSEM_MINT,
    rewardTokenSymbol: ANSEM_SYMBOL,
    rewardTokenDecimals: ANSEM_DECIMALS,
    rewardPerHunter: 1,
    rewardPerHunterUsd: null,
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
      holderRequirement: null,
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
