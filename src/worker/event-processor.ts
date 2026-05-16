import { and, eq, inArray, sql } from "drizzle-orm";
import {
  bounties,
  claims,
  streamEventsLog,
  tweetStreamSubscriptions,
  users,
} from "@/lib/db/schema";
import { markActionVerifiedFromStream } from "@/lib/bounties/verify-claim";
import { publishEvent } from "@/lib/realtime/publisher";
import type { Claim } from "@/types/database";
import { workerDb } from "./db";

/**
 * Per-event pipeline for Layer 2.
 *
 * Stream event shape — twitterapi.io's `tweet_filter` matches each new
 * tweet against the active rules and pushes the tweet payload over the
 * websocket. We normalize the relevant fields into `StreamEvent` so the
 * upstream payload shape is the only thing the WebSocket client needs
 * to translate.
 */

export type StreamEvent = {
  streamRuleId: string | null;
  tweetId: string;
  conversationId: string | null;
  authorTwitterId: string | null;
  authorHandle: string | null;
  text: string | null;
  isReply: boolean;
  isQuote: boolean;
  inReplyToTweetId: string | null;
  quotedTweetId: string | null;
};

export async function processStreamEvent(
  event: StreamEvent,
): Promise<void> {
  const db = workerDb();

  // Always log the event first — even non-matches help debug "why isn't
  // my reply showing up". We update `matched_claim_id` later if we hit.
  const [logRow] = await db
    .insert(streamEventsLog)
    .values({
      streamRuleId: event.streamRuleId,
      tweetId: event.tweetId,
      conversationId: event.conversationId,
      authorTwitterId: event.authorTwitterId,
      authorHandle: event.authorHandle,
      text: event.text,
      isReply: event.isReply,
      isQuote: event.isQuote,
      inReplyToTweetId: event.inReplyToTweetId,
      quotedTweetId: event.quotedTweetId,
    })
    .returning({ id: streamEventsLog.id });

  // Bump the subscription heartbeat so health checks see liveness.
  if (event.streamRuleId) {
    await db
      .update(tweetStreamSubscriptions)
      .set({
        eventsReceivedCount: sql`${tweetStreamSubscriptions.eventsReceivedCount} + 1`,
        lastEventAt: new Date(),
      })
      .where(eq(tweetStreamSubscriptions.streamRuleId, event.streamRuleId));
  }

  // Without an author or a conversation, the event can't match a claim.
  if (!event.authorTwitterId) return;
  if (!event.conversationId && !event.quotedTweetId) return;

  // Find which bounty this event belongs to. Replies → match by
  // conversation_id == bounty.tweet_id. Quotes → match by
  // quoted_tweet_id == bounty.tweet_id.
  const targetTweetIds = [
    event.conversationId,
    event.quotedTweetId,
  ].filter((v): v is string => v != null);
  if (targetTweetIds.length === 0) return;

  const matchedBounties = await db
    .select({
      id: bounties.id,
      tweetId: bounties.tweetId,
      requiresReply: bounties.requiresReply,
      requiresQuote: bounties.requiresQuote,
    })
    .from(bounties)
    .where(inArray(bounties.tweetId, targetTweetIds));
  if (matchedBounties.length === 0) return;

  // Resolve the author → app user. Without a user row there's no claim
  // to update; we still keep the log entry above for ops visibility.
  const [authorUser] = await db
    .select({ id: users.id, twitterId: users.twitterId })
    .from(users)
    .where(eq(users.twitterId, event.authorTwitterId))
    .limit(1);
  if (!authorUser) return;

  for (const bounty of matchedBounties) {
    const isReplyMatch =
      event.isReply &&
      bounty.requiresReply &&
      event.conversationId === bounty.tweetId;
    const isQuoteMatch =
      event.isQuote &&
      bounty.requiresQuote &&
      event.quotedTweetId === bounty.tweetId;
    if (!isReplyMatch && !isQuoteMatch) continue;

    const [claim] = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.bountyId, bounty.id),
          eq(claims.hunterUserId, authorUser.id),
        ),
      )
      .limit(1);
    if (!claim) continue;

    const updated = await markActionVerifiedFromStream({
      claimId: claim.id,
      action: isReplyMatch ? "reply" : "quote",
      tweetId: event.tweetId,
      text: event.text ?? "",
    });
    if (!updated) continue;

    // Backfill the event log with the claim we resolved this to.
    await db
      .update(streamEventsLog)
      .set({ matchedClaimId: updated.id })
      .where(eq(streamEventsLog.id, logRow.id));

    publishOnUpdate(updated);
  }
}

function publishOnUpdate(claim: Claim) {
  const baseData = {
    claimId: claim.id,
    bountyId: claim.bountyId,
    status: claim.status,
  };
  if (claim.status === "initial_verified") {
    publishEvent(`user-${claim.hunterUserId}`, "claim_verified", baseData);
    publishEvent(`bounty-${claim.bountyId}`, "new_verification", {
      claimId: claim.id,
    });
  } else {
    // Action got verified but the claim isn't fully verified yet —
    // surface a generic update so the UI can re-fetch and tick the
    // individual checkbox.
    publishEvent(`user-${claim.hunterUserId}`, "bounty_updated", baseData);
  }
}
