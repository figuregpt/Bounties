/**
 * Activity queries — public live feed.
 *
 * Phase 4 reads from socialActivities; Phase 10 will push the same shape
 * over SSE/WebSocket.
 */
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bounties, socialActivities, tokens, users } from "@/lib/db/schema";
import type { ActivityType } from "@/types/database";

export type LiveActivityRow = {
  id: string;
  type: ActivityType;
  createdAt: Date;
  actor: {
    id: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    accountTier: string;
  };
  bounty: {
    id: string;
    slug: string;
    rewardTokenSymbol: string;
    rewardTokenLogoUrl: string | null;
    rewardPerHunter: string;
    tweetText: string | null;
  } | null;
};

const DEFAULT_TYPES: ActivityType[] = [
  "bounty_completed",
  "bounty_claimed",
  "claim_verified",
  "bounty_created",
];

export async function getLiveActivities(
  opts: { limit?: number; types?: ActivityType[] } = {},
): Promise<LiveActivityRow[]> {
  const db = getDb();
  const limit = opts.limit ?? 15;
  const types = opts.types ?? DEFAULT_TYPES;

  const rows = await db
    .select({
      id: socialActivities.id,
      type: socialActivities.type,
      createdAt: socialActivities.createdAt,
      actor: {
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        accountTier: users.accountTier,
      },
      bounty: {
        id: bounties.id,
        slug: bounties.slug,
        rewardTokenSymbol: bounties.rewardTokenSymbol,
        rewardPerHunter: bounties.rewardPerHunter,
        tweetCachedData: bounties.tweetCachedData,
      },
      rewardTokenLogoUrl: tokens.logoUrl,
    })
    .from(socialActivities)
    .innerJoin(users, eq(socialActivities.actorUserId, users.id))
    .leftJoin(bounties, eq(socialActivities.bountyId, bounties.id))
    .leftJoin(tokens, eq(bounties.rewardTokenMint, tokens.mint))
    .where(
      and(
        eq(socialActivities.isPublic, true),
        inArray(socialActivities.type, types),
      ),
    )
    .orderBy(desc(socialActivities.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type as ActivityType,
    createdAt: r.createdAt,
    actor: r.actor,
    bounty: r.bounty?.id
      ? {
          id: r.bounty.id,
          slug: r.bounty.slug,
          rewardTokenSymbol: r.bounty.rewardTokenSymbol,
          rewardTokenLogoUrl: r.rewardTokenLogoUrl ?? null,
          rewardPerHunter: r.bounty.rewardPerHunter,
          tweetText: r.bounty.tweetCachedData?.text ?? null,
        }
      : null,
  }));
}
