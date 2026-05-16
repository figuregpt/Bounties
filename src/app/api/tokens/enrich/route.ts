import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  enrichToken,
  isValidSolanaMint,
  TokenFlaggedError,
  TokenLogoMissingError,
  TokenNotFoundError,
  TokenPriceUnavailableError,
} from "@/lib/tokens/enrichment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/tokens/enrich — { mintAddress } → enriched token JSON.
 *
 * Auth-gated to prevent random clients from using us as a free
 * DexScreener proxy. The route is idempotent — first call hits
 * DexScreener + Solana RPC, subsequent calls within 5 minutes return
 * the cached `tokens` row.
 *
 * Errors map to HTTP:
 *   • invalid mint format         → 400
 *   • no DexScreener pairs        → 404
 *   • DexScreener has no price    → 422 (different from "not found" —
 *                                   token exists, just no liquidity)
 *   • token flagged as scam       → 403
 *   • upstream timeout / other    → 502
 */

const BodySchema = z.object({
  mintAddress: z.string().min(32).max(48),
});

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

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body" },
      { status: 400 },
    );
  }
  const mintAddress = parsed.data.mintAddress.trim();
  if (!isValidSolanaMint(mintAddress)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Doesn't look like a Solana token address",
        errorCode: "invalid_mint",
      },
      { status: 400 },
    );
  }

  try {
    const enriched = await enrichToken(mintAddress);
    return NextResponse.json({ ok: true, token: enriched });
  } catch (err) {
    if (err instanceof TokenFlaggedError) {
      return NextResponse.json(
        {
          ok: false,
          error: "This token is flagged and can't be used for bounties",
          errorCode: "token_flagged",
        },
        { status: 403 },
      );
    }
    if (err instanceof TokenNotFoundError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Token not found on DexScreener",
          errorCode: "token_not_found",
        },
        { status: 404 },
      );
    }
    if (err instanceof TokenPriceUnavailableError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This token has no tracked price yet. Add liquidity on a DEX first, then come back.",
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
            "This token isn't fully registered on DexScreener — it needs a logo to be usable for bounties.",
          errorCode: "token_logo_missing",
        },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== "production") {
      console.warn("[POST /api/tokens/enrich] failed:", message);
    }
    return NextResponse.json(
      {
        ok: false,
        error: "Couldn't enrich token right now — please retry",
        errorCode: "upstream_error",
        details: message,
      },
      { status: 502 },
    );
  }
}
