import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getChainAdapter } from "@/lib/chains";

/**
 * GET /api/wallet/holds-token — read-only balance check used by the
 * bounty detail page to upgrade the "Wallet holdings" eligibility row
 * once the hunter connects a wallet. The actual gate still runs server-
 * side inside POST /api/claims at slot reservation, so this endpoint is
 * purely an informational pre-check — it can't be relied on for auth.
 *
 * Auth: none — query carries the wallet address. Burning RPC on a
 * stranger's balance is fine; we expose no private data.
 */

const QuerySchema = z.object({
  wallet: z.string().min(20).max(64),
  mint: z.string().min(20).max(64),
  minAmount: z.coerce.number().positive(),
  decimals: z.coerce.number().int().min(0).max(9),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query" },
      { status: 400 },
    );
  }
  try {
    const holds = await getChainAdapter("solana").hasMinTokenBalance({
      wallet: parsed.data.wallet,
      mint: parsed.data.mint,
      minAmount: parsed.data.minAmount,
      decimals: parsed.data.decimals,
    });
    return NextResponse.json({ ok: true, holds });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
