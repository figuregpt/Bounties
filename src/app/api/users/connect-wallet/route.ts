import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isValidSolanaWallet } from "@/lib/solana/verify-tx";

export const dynamic = "force-dynamic";

/**
 * POST /api/users/connect-wallet — record the wallet a user has just
 * connected via wallet-adapter (Phantom / Solflare).
 *
 * Called from the create/claim flows the first time a session brings
 * a fresh wallet address. Subsequent connections to the same address
 * are no-ops. Reconnecting a *different* wallet replaces the saved
 * one — by design, so users can swap providers without contacting
 * support. UI surfaces the previous address in the menu for a moment.
 *
 * Note: this DOES NOT do a signature challenge — anyone who has the
 * session cookie could in theory set an arbitrary wallet. Real-money
 * paths (sendReward) re-check on-chain via tx verification anyway,
 * but if you want CSRF-style protection later, layer a sign-message
 * challenge on top.
 */

const BodySchema = z.object({
  walletAddress: z
    .string()
    .min(32, "Wallet address looks invalid")
    .max(48, "Wallet address looks invalid"),
  provider: z.string().max(32).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireAuth();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!isValidSolanaWallet(parsed.data.walletAddress)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Wallet address must be a valid on-curve Solana pubkey",
        errorCode: "invalid_address",
      },
      { status: 400 },
    );
  }

  // No-op when nothing changed — avoids a write per page load.
  if (user.walletAddress === parsed.data.walletAddress) {
    return NextResponse.json({
      ok: true,
      walletAddress: parsed.data.walletAddress,
      noop: true,
    });
  }

  const now = new Date();
  await getDb()
    .update(users)
    .set({
      walletAddress: parsed.data.walletAddress,
      walletConnectedAt: now,
      walletProvider: parsed.data.provider ?? null,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    ok: true,
    walletAddress: parsed.data.walletAddress,
  });
}
