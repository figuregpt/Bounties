import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users, userWallets } from "@/lib/db/schema";
import { getChainAdapter, isChain } from "@/lib/chains";

export const dynamic = "force-dynamic";

/**
 * POST /api/users/connect-wallet — record the wallet a user has just
 * connected, per chain.
 *
 * Called from the create/claim flows the first time a session brings a
 * fresh wallet address for a given chain. Writes to `user_wallets`
 * keyed on (userId, chain); for Solana it also keeps the legacy
 * `users.walletAddress` in sync during the migration window. Reconnecting
 * a different wallet for the same chain replaces the saved one — and
 * detaches that address from any other user on that chain.
 *
 * Note: still NO signature challenge — anyone with the session cookie
 * could set an arbitrary address. Reward payouts go to the saved address
 * itself, so this only ever helps the address's real owner; layer a
 * sign-message (SIWE / signMessage) challenge on top if you want
 * CSRF-style protection later.
 */

const BodySchema = z.object({
  walletAddress: z
    .string()
    .min(20, "Wallet address looks invalid")
    .max(64, "Wallet address looks invalid"),
  // Defaults to solana so existing clients that don't send `chain` keep
  // working unchanged.
  chain: z.string().optional(),
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

  const chain = parsed.data.chain ?? "solana";
  if (!isChain(chain)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported chain "${chain}"`, errorCode: "bad_chain" },
      { status: 400 },
    );
  }

  const adapter = getChainAdapter(chain);
  if (!adapter.isValidWallet(parsed.data.walletAddress)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          chain === "solana"
            ? "Wallet address must be a valid on-curve Solana pubkey"
            : "Wallet address must be a valid EVM (0x) address",
        errorCode: "invalid_address",
      },
      { status: 400 },
    );
  }
  const address = adapter.normalizeAddress(parsed.data.walletAddress);

  const now = new Date();
  const db = getDb();

  // Detach this (address, chain) from any other user — the same human can
  // run several Twitter accounts against one wallet. No exploit angle:
  // payouts go to the address itself, so re-binding only helps its owner.
  await db
    .delete(userWallets)
    .where(
      and(
        eq(userWallets.chain, chain),
        eq(userWallets.address, address),
        ne(userWallets.userId, user.id),
      ),
    );

  // Upsert the (userId, chain) binding.
  await db
    .insert(userWallets)
    .values({
      userId: user.id,
      chain,
      address,
      provider: parsed.data.provider ?? null,
      connectedAt: now,
    })
    .onConflictDoUpdate({
      target: [userWallets.userId, userWallets.chain],
      set: { address, provider: parsed.data.provider ?? null, connectedAt: now },
    });

  // Back-compat: mirror the Solana wallet onto the legacy users column so
  // code still reading user.walletAddress keeps working during migration.
  if (chain === "solana" && user.walletAddress !== address) {
    await db
      .update(users)
      .set({ walletAddress: null, updatedAt: now })
      .where(and(eq(users.walletAddress, address), ne(users.id, user.id)));
    await db
      .update(users)
      .set({
        walletAddress: address,
        walletConnectedAt: now,
        walletProvider: parsed.data.provider ?? null,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
  }

  return NextResponse.json({ ok: true, chain, walletAddress: address });
}
