import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bounties, platformRevenue, userWallets } from "@/lib/db/schema";
import { escrowMode, toRawAmount } from "@/lib/solana/escrow";
import { currentNetwork } from "@/lib/tokens/canonical";
import {
  getRevenueWalletPublicKeyOrNull,
  getTreasuryPublicKeyOrNull,
} from "@/lib/solana/env";
import { getChainAdapter, isChain } from "@/lib/chains";
import {
  BOUNTY_CREATION_FEE_USD,
  DURATION_HOURS_OPTIONS,
} from "@/lib/validation/bounty";
import { serializeZodIssues } from "@/lib/validation/field-labels";
import { getTokenInfo } from "@/lib/db/queries/tokens";
import { recordActivity } from "@/lib/realtime/activity";
import { announceBountyLaunched } from "@/lib/discord/webhook";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  /** Hours the bounty should stay open from publishedAt. */
  durationHours: z
    .number()
    .int({ message: "Duration must be a whole number of hours" })
    .refine(
      (v) => (DURATION_HOURS_OPTIONS as readonly number[]).includes(v),
      { message: "Pick one of the offered campaign durations" },
    ),
  /** Solana transaction signature for the escrow transfer. */
  escrowTxSignature: z
    .string()
    .min(8, { message: "Escrow transaction signature looks invalid" })
    .max(120, { message: "Escrow transaction signature looks invalid" })
    .optional(),
});

/**
 * POST /api/bounties/[slug]/launch — flips a draft into an active bounty.
 *
 * The route enforces:
 *   • the caller is the creator
 *   • the bounty is currently `status='draft'`
 *   • when escrowMode() is `devnet` or `mainnet`, the on-chain transfer
 *     resolves with the expected amount + treasury. `mock` mode skips
 *     on-chain verification — useful for local dev where we don't want
 *     to spend real funds testing the form.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const issues = serializeZodIssues(parsed.error);
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[POST /api/bounties/:slug/launch] validation failed",
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

  const db = getDb();
  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.slug, slug))
    .limit(1);
  if (!bounty) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (bounty.creatorUserId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Only the creator can launch this bounty" },
      { status: 403 },
    );
  }
  if (bounty.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: `Bounty is already ${bounty.status}` },
      { status: 409 },
    );
  }
  // Pre-migration drafts frozen on a removed chain (monad/base) can't
  // escrow through the Solana treasury — reject loudly instead of
  // activating a bounty nobody can settle.
  if (!isChain(bounty.chain)) {
    console.error(
      `[launch] bounty ${bounty.slug} is a draft on unsupported chain "${bounty.chain}" — cannot launch`,
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "This draft was created on a network we no longer support. Create a new bounty.",
        errorCode: "unsupported_chain",
      },
      { status: 409 },
    );
  }

  /* ---- Resolve creation fee in reward-token units ------------------ */
  // POST /api/bounties snapshots the fee onto the draft row from the
  // same price the client previewed; the escrow tx bakes that exact
  // amount, so verifying against the stored value can't drift. Drafts
  // created before the snapshot existed (NULL column) fall back to
  // re-deriving from the cached price.
  //
  // Devnet bypass: no tracked prices on devnet — fee stays 0.
  const tokenInfo = await getTokenInfo(bounty.rewardTokenMint, bounty.chain);
  const isDevnet = currentNetwork() === "devnet";
  let creationFeeAmount: number;
  if (bounty.creationFeeAmount != null) {
    creationFeeAmount = Number(bounty.creationFeeAmount);
  } else {
    if (!isDevnet && (!tokenInfo?.priceUsd || tokenInfo.priceUsd <= 0)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Reward token has no tracked price — can't compute creation fee",
          errorCode: "token_no_price",
        },
        { status: 422 },
      );
    }
    creationFeeAmount =
      isDevnet || !tokenInfo?.priceUsd || tokenInfo.priceUsd <= 0
        ? 0
        : BOUNTY_CREATION_FEE_USD / tokenInfo.priceUsd;
  }
  const totalEscrowAmount = Number(bounty.totalPool) + creationFeeAmount;

  /* ---- Escrow verification (Solana) --------------------------------- */
  const adapter = getChainAdapter("solana");
  const treasury = getTreasuryPublicKeyOrNull();
  const mode = escrowMode();

  let escrowTxHash: string | null = null;
  let escrowConfirmedAt: Date = new Date();
  const onChainStatus = "escrowed" as const;

  if (mode === "mock") {
    escrowTxHash =
      parsed.data.escrowTxSignature ??
      `mock_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
  } else {
    if (!treasury) {
      return NextResponse.json(
        { ok: false, error: "Treasury wallet not configured" },
        { status: 503 },
      );
    }
    if (!parsed.data.escrowTxSignature) {
      return NextResponse.json(
        { ok: false, error: "Missing escrowTxSignature" },
        { status: 400 },
      );
    }

    // Creator's Solana wallet (who funded the escrow). Resolved from
    // user_wallets; falls back to the legacy users.walletAddress column.
    const [creatorWalletRow] = await db
      .select({ address: userWallets.address })
      .from(userWallets)
      .where(
        and(eq(userWallets.userId, user.id), eq(userWallets.chain, "solana")),
      )
      .limit(1);
    const creatorWallet = creatorWalletRow?.address ?? user.walletAddress;
    if (!creatorWallet) {
      return NextResponse.json(
        {
          ok: false,
          error: "Connect a Solana wallet before launching a bounty",
          errorCode: "wallet_not_connected",
        },
        { status: 409 },
      );
    }

    // ANSEM is always an SPL transfer — no native-SOL path anymore.
    const toRaw = (n: number) => toRawAmount(n, bounty.rewardTokenDecimals);
    const expectedPoolRaw = toRaw(Number(bounty.totalPool));
    const expectedFeeRaw =
      creationFeeAmount > 0 ? toRaw(creationFeeAmount) : BigInt(0);
    const expectedMint = bounty.rewardTokenMint;

    // Fee routing:
    //  • revenue wallet configured → pool to treasury, fee to revenue.
    //  • otherwise → combined into one treasury transfer (legacy).
    const revenueWallet = getRevenueWalletPublicKeyOrNull();
    const splitFee = !!revenueWallet && creationFeeAmount > 0;

    let verifyExpectedAmount: bigint;
    let verifyExpectedFee:
      | { recipientWallet: string; amount: bigint }
      | undefined;
    if (splitFee) {
      verifyExpectedAmount = expectedPoolRaw;
      verifyExpectedFee = {
        recipientWallet: revenueWallet!,
        amount: expectedFeeRaw,
      };
    } else {
      verifyExpectedAmount = expectedPoolRaw + expectedFeeRaw;
      verifyExpectedFee = undefined;
    }

    const result = await adapter.verifyEscrowTx({
      signature: parsed.data.escrowTxSignature,
      expectedFromWallet: creatorWallet,
      expectedTreasuryWallet: treasury,
      expectedAmount: verifyExpectedAmount,
      expectedMint,
      expectedFee: verifyExpectedFee,
    });
    if (!result.ok) {
      // amount_too_low usually means the token price moved between
      // sign-and-server-verify (already-paid funds, useless lamport
      // numbers in the message). Surface a copy that tells the
      // creator their funds are safe and how to recover.
      const userMessage =
        result.code === "amount_too_low"
          ? "On-chain transfer amount didn't match what we expected — usually a quick price move between signing and confirmation. Your funds are safe; please contact support with the bounty slug and we'll resolve it."
          : result.reason;
      // Stash the raw reason in server logs for debugging without
      // leaking lamport noise to the user.
      console.warn(
        `[launch] verify failed for bounty=${bounty.slug} code=${result.code}: ${result.reason}`,
      );
      return NextResponse.json(
        {
          ok: false,
          error: userMessage,
          errorCode: result.code,
        },
        { status: 400 },
      );
    }
    if (result.feeRoutedTo === "treasury_legacy") {
      console.warn(
        `[launch] bounty ${bounty.slug} used legacy single-transfer mode — creation fee landed in treasury and will be picked up by the next sweep`,
      );
    }
    escrowTxHash = parsed.data.escrowTxSignature;
    escrowConfirmedAt = result.confirmedAt;
  }

  /* ---- Activate ----------------------------------------------------- */
  const now = new Date();
  const endsAt = new Date(
    now.getTime() + parsed.data.durationHours * 3600 * 1000,
  );

  const [activated] = await db
    .update(bounties)
    .set({
      status: "active",
      publishedAt: now,
      endsAt,
      escrowTxHash,
      escrowConfirmedAt,
      // Total escrowed = reward pool + creation fee.
      escrowAmount: totalEscrowAmount.toString(),
      creationFeeAmount: creationFeeAmount.toString(),
      creationFeeAmountUsd: BOUNTY_CREATION_FEE_USD.toFixed(6),
      // Stamp the chain-specific treasury that actually received the escrow.
      treasuryAddress: treasury,
      onChainStatus,
      updatedAt: now,
    })
    .where(eq(bounties.id, bounty.id))
    .returning();

  /* ---- Record the fee in platform_revenue -------------------------- */
  // Failure here shouldn't fail the launch — log it for ops triage. The
  // accounting backfill can reconcile from bounties.creation_fee_amount.
  try {
    await db.insert(platformRevenue).values({
      sourceType: "creation_fee",
      bountyId: bounty.id,
      amount: creationFeeAmount.toString(),
      amountUsd: BOUNTY_CREATION_FEE_USD.toFixed(6),
      tokenMint: bounty.rewardTokenMint,
      tokenSymbol: bounty.rewardTokenSymbol,
    });
  } catch (err) {
    console.warn(
      "[POST /api/bounties/:slug/launch] platform_revenue insert failed:",
      err instanceof Error ? err.message.slice(0, 200) : err,
    );
  }

  // Live-activity feed broadcast. Best-effort; insert failure logged
  // inside recordActivity, never fails the launch.
  void recordActivity({
    type: "bounty_created",
    actorUserId: bounty.creatorUserId,
    bountyId: bounty.id,
  });

  // Discord webhook announcement. Fire-and-forget — a missing webhook
  // env, network blip, or 4xx from Discord must never break activation.
  // We pass the freshly-activated bounty (`activated`) so endsAt reflects
  // the launch-time clock, not the draft placeholder.
  void announceBountyLaunched({
    slug: activated.slug,
    rewardTokenSymbol: activated.rewardTokenSymbol,
    rewardPerHunter: activated.rewardPerHunter,
    rewardPerHunterUsd: activated.rewardPerHunterUsd,
    totalPool: activated.totalPool,
    totalPoolUsd: activated.totalPoolUsd,
    maxHunters: activated.maxHunters,
    distributionModel: activated.distributionModel,
    endsAt: activated.endsAt,
    tweetUrl: activated.tweetUrl,
    tweetAuthorHandle: activated.tweetAuthorHandle,
    tweetText:
      typeof activated.tweetCachedData === "object" &&
      activated.tweetCachedData !== null &&
      "text" in activated.tweetCachedData
        ? String(
            (activated.tweetCachedData as { text?: unknown }).text ?? "",
          )
        : null,
    eligibilityFilters: activated.eligibilityFilters,
    creator: {
      handle: user.handle,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
    tokenLogoUrl: tokenInfo?.logoUrl ?? null,
  });

  return NextResponse.json({
    ok: true,
    bounty: { slug: activated.slug, id: activated.id },
  });
}
