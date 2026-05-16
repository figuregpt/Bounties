import "server-only";
import { getDb } from "@/lib/db";
import { socialActivities } from "@/lib/db/schema";
import { publishEvent } from "./publisher";
import type { ActivityType, SocialActivityMetadata } from "@/types/database";

/**
 * Records one row in `social_activities` + broadcasts an SSE event so
 * open Discover tabs refresh the Live Activity panel without a full
 * reload. Best-effort: write failures are logged but never rejected,
 * because losing a feed row should never break the user action that
 * triggered it.
 */

type RecordActivityArgs = {
  type: ActivityType;
  actorUserId: string;
  bountyId?: string | null;
  claimId?: string | null;
  targetUserId?: string | null;
  metadata?: SocialActivityMetadata | null;
};

export async function recordActivity(args: RecordActivityArgs): Promise<void> {
  try {
    await getDb().insert(socialActivities).values({
      type: args.type,
      actorUserId: args.actorUserId,
      bountyId: args.bountyId ?? null,
      claimId: args.claimId ?? null,
      targetUserId: args.targetUserId ?? null,
      metadata: args.metadata ?? null,
      isPublic: true,
    });
    publishEvent("global", "activity_inserted", {
      type: args.type,
      bountyId: args.bountyId ?? null,
    });
  } catch (err) {
    console.warn(
      `[activity] insert failed (${args.type}):`,
      err instanceof Error ? err.message.slice(0, 200) : err,
    );
  }
}
