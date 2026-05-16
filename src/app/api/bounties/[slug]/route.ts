import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBountyBySlug } from "@/lib/db/queries/bounties";
import { getClaimForBountyAndUser } from "@/lib/db/queries/claims";
import { checkEligibility } from "@/lib/bounties/eligibility";
import { getBountyUIState } from "@/lib/bounties/state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/bounties/[slug] — full detail payload for the bounty page.
 *
 * Eligibility + UI state depend on the calling user, so the response
 * can't be shared across users. We force-dynamic and skip Next.js's
 * fetch cache; consumers are expected to hit this from a server
 * component on every request.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  const bounty = await getBountyBySlug(slug, user?.id ?? null);
  if (!bounty) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const claim = user
    ? await getClaimForBountyAndUser(bounty.id, user.id)
    : null;
  const eligibility = checkEligibility(user, bounty);
  const uiState = getBountyUIState({ bounty, user, claim, eligibility });

  return NextResponse.json({
    ok: true,
    bounty,
    claim,
    eligibility,
    uiState,
  });
}
