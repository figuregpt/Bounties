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
  const reward = `${bounty.rewardPerHunter} ${bounty.rewardTokenSymbol}`;
  return {
    title: `@${creator} · ${reward} bounty`,
    description: `${reward} per hunter, ${bounty.maxHunters} slots. Engage on Twitter, get paid on Solana.`,
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

  const [claim, hunters, tokenInfo] = await Promise.all([
    user ? getClaimForBountyAndUser(bounty.id, user.id) : Promise.resolve(null),
    getBountyHunters(bounty.id, { limit: 20 }),
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
