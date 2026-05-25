import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getBountyBySlug,
  incrementBountyView,
} from "@/lib/db/queries/bounties";
import {
  getBountyHunters,
  getClaimForBountyAndUser,
} from "@/lib/db/queries/claims";
import { getTokenInfo } from "@/lib/db/queries/tokens";
import { checkEligibility } from "@/lib/bounties/eligibility";
import { getBountyUIState } from "@/lib/bounties/state";
import { formatTokenAmount } from "@/lib/format";
import { BountyDetailClient } from "./bounty-detail-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bounty = await getBountyBySlug(slug, null);
  if (!bounty) return { title: "Bounty not found" };

  const creator = bounty.creator.handle;
  const reward = `${formatTokenAmount(bounty.rewardPerHunter)} ${bounty.rewardTokenSymbol}`;
  const title = `${reward} · @${creator}`;
  // Lottery bounties accept unlimited participants — "5 slots · 2
  // claimed" reads as a half-full pool, which it isn't. Re-frame
  // around winners + joined count to match what's on the page.
  const isLottery = bounty.distributionModel === "pool_lottery";
  const description = isLottery
    ? `${bounty.maxHunters} random winners · ${bounty.currentHuntersCount} joined. Reply, retweet, or follow to enter this bounty on Solana.`
    : `${bounty.maxHunters} slots · ${bounty.currentHuntersCount} claimed. Reply, retweet, or follow to hunt this bounty on Solana.`;
  const url = `/bounties/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: "bounties.fm",
      // Image auto-wired from co-located opengraph-image.tsx.
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: `@${creator}`,
    },
  };
}

/**
 * Bounty detail server shell.
 *
 * Everything that needs DB access lives here so the client component
 * stays focused on UI state. We deliberately fire `incrementBountyView`
 * without `await` — the counter is best-effort and shouldn't push our
 * TTFB up by 30-80ms.
 */
export default async function BountyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const bounty = await getBountyBySlug(slug, user?.id ?? null);
  if (!bounty) notFound();

  // Fire-and-forget view counter — never block the render path on it.
  void incrementBountyView(bounty.id).catch(() => {});

  // Lottery pages need a higher cap because we group rows into
  // Winners / Not picked / In progress — capping at 20 would hide
  // most of the losers and make the draw look smaller than it was.
  // For a 5-winner / 200-entrant draw the user wants to see both
  // sides; the section is collapsible so the larger DOM only renders
  // on demand.
  const huntersLimit =
    bounty.distributionModel === "pool_lottery" ? 500 : 20;
  const [claim, hunters, tokenInfo] = await Promise.all([
    user ? getClaimForBountyAndUser(bounty.id, user.id) : Promise.resolve(null),
    getBountyHunters(bounty.id, { limit: huntersLimit }),
    getTokenInfo(bounty.rewardTokenMint),
  ]);

  const eligibility = checkEligibility(user, bounty);
  const uiState = getBountyUIState({ bounty, user, claim, eligibility });

  return (
    <BountyDetailClient
      bounty={bounty}
      claim={claim}
      eligibility={eligibility}
      uiState={uiState}
      hunters={hunters}
      userId={user?.id ?? null}
      tokenInfo={tokenInfo}
    />
  );
}
