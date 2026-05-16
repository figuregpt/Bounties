import { NextResponse, type NextRequest } from "next/server";
import {
  getBountyBySlug,
  incrementBountyView,
} from "@/lib/db/queries/bounties";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/bounties/[slug]/view — bump the view counter.
 *
 * Anonymous-friendly on purpose so we capture interest from logged-out
 * traffic. The server component for /bounties/[slug] also fires this
 * inline (without awaiting), so the route is the explicit handle for
 * client-side debounced re-counting later.
 */
export async function PATCH(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const bounty = await getBountyBySlug(slug, null);
  if (!bounty) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  try {
    await incrementBountyView(bounty.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
