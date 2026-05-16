import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getTweetById } from "@/lib/twitter/client";
import { extractTweetId } from "@/lib/validation/bounty";

export const dynamic = "force-dynamic";

const BodySchema = z.union([
  z.object({ tweetId: z.string().min(6).max(25) }),
  z.object({ tweetUrl: z.string().url() }),
]);

/**
 * POST /api/bounties/fetch-tweet — used by the create-bounty form to
 * resolve a tweet URL (or raw id) into the full tweet payload via
 * twitterapi.io. Accepts either `tweetUrl` or `tweetId`.
 *
 * Requires auth — fetching tweets is metered (~$0.00015/call) and we
 * don't want anon scraping. The user's id is forwarded to the Twitter
 * client so the api_call_log row carries it for cost attribution.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const tweetId =
    "tweetId" in parsed.data
      ? parsed.data.tweetId
      : extractTweetId(parsed.data.tweetUrl);
  if (!tweetId) {
    return NextResponse.json(
      { ok: false, error: "Couldn't extract a tweet id from that URL" },
      { status: 400 },
    );
  }

  try {
    const tweet = await getTweetById(tweetId, { userId: user.id });
    return NextResponse.json({ ok: true, tweet });
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
