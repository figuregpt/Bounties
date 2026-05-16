import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getBountyBySlug } from "@/lib/db/queries/bounties";
import { getBountyHunters } from "@/lib/db/queries/claims";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * GET /api/bounties/[slug]/hunters — recent claims for the bounty,
 * joined with hunter user data so the "Recent hunters" panel renders
 * without N+1.
 *
 * Phase 5 returns the first page only — true pagination lands when
 * we have an actual "load more" CTA in the UI.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // The slug-based lookup keeps URLs human-readable in the UI while still
  // letting us reuse the id-keyed hunter query.
  const bounty = await getBountyBySlug(slug, null);
  if (!bounty) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const hunters = await getBountyHunters(bounty.id, {
    limit: parsed.data.limit ?? 20,
  });
  return NextResponse.json({ ok: true, hunters });
}
