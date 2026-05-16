import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  bounties,
  tweetStreamSubscriptions,
} from "@/lib/db/schema";
import {
  addFilterRule,
  deleteFilterRule,
  listFilterRules,
  updateFilterRule,
} from "@/lib/twitter/client";
import { workerDb } from "./db";

/**
 * Reconciles twitterapi.io filter rules with the set of active bounties.
 *
 * Strategy: one rule per bounty (tag = bountyId), value targets the
 * tweet's conversation so we catch replies/quotes that thread off it.
 * Twitterapi.io's filter DSL syntax: `conversation_id:<tweetId>`.
 *
 * Reconciliation steps each pass:
 *   1. Load active bounties (requires reply or quote — RT and follow
 *      don't fan out via the stream).
 *   2. Load current rules from twitterapi.io.
 *   3. Diff:
 *        • bounty in DB but no rule  → addFilterRule + update_rule
 *          (twitterapi.io marks new rules inactive until update_rule
 *          flips `is_effect=true`)
 *        • rule on api but bounty ended/finished → deleteFilterRule
 *          + flip subscription row inactive.
 *   4. Maintain `tweet_stream_subscriptions` audit table in lockstep.
 *
 * Idempotent — safe to run on a heartbeat. The worker calls
 * `reconcileRules()` at boot and every `RECONCILE_INTERVAL_MS`.
 */

const TAG_PREFIX = "bounty:";

export async function reconcileRules(): Promise<{
  added: number;
  removed: number;
  unchanged: number;
}> {
  const db = workerDb();
  const now = new Date();

  // 1) Active bounties that fan out via stream.
  const activeBounties = await db
    .select({
      id: bounties.id,
      tweetId: bounties.tweetId,
      requiresReply: bounties.requiresReply,
      requiresQuote: bounties.requiresQuote,
    })
    .from(bounties)
    .where(
      and(
        eq(bounties.status, "active"),
        gt(bounties.endsAt, now),
        or(eq(bounties.requiresReply, true), eq(bounties.requiresQuote, true)),
      ),
    );

  // 2) Current rules on the upstream service.
  const remoteRules = await listFilterRules();
  const remoteByTag = new Map(
    remoteRules
      .filter((r) => r.tag.startsWith(TAG_PREFIX))
      .map((r) => [r.tag.slice(TAG_PREFIX.length), r]),
  );

  let added = 0;
  let removed = 0;
  let unchanged = 0;

  // 3a) Add missing rules.
  for (const b of activeBounties) {
    const existing = remoteByTag.get(b.id);
    const value = `conversation_id:${b.tweetId}`;
    if (existing) {
      remoteByTag.delete(b.id); // mark processed
      // Re-enable if upstream toggled it off for any reason.
      if (existing.isActive === false || existing.value !== value) {
        await updateFilterRule({
          ruleId: existing.id,
          tag: `${TAG_PREFIX}${b.id}`,
          value,
          isEffect: true,
        });
      }
      unchanged += 1;
      continue;
    }
    const { ruleId } = await addFilterRule({
      tag: `${TAG_PREFIX}${b.id}`,
      value,
    });
    // New rules ship inactive — flip the switch.
    await updateFilterRule({
      ruleId,
      tag: `${TAG_PREFIX}${b.id}`,
      value,
      isEffect: true,
    });
    await db
      .insert(tweetStreamSubscriptions)
      .values({
        bountyId: b.id,
        tweetId: b.tweetId,
        streamRuleId: ruleId,
        ruleValue: value,
        isActive: true,
      })
      .onConflictDoNothing();
    added += 1;
  }

  // 3b) Remove orphaned rules — bounty ended or was deleted.
  for (const [bountyId, rule] of remoteByTag) {
    await deleteFilterRule(rule.id);
    await db
      .update(tweetStreamSubscriptions)
      .set({ isActive: false, unsubscribedAt: now })
      .where(
        and(
          eq(tweetStreamSubscriptions.bountyId, bountyId),
          eq(tweetStreamSubscriptions.isActive, true),
        ),
      );
    removed += 1;
  }

  // Sweep any subscription rows that lost their upstream rule for any
  // other reason (manual cleanup, etc.) so the partial-unique index
  // stays satisfiable.
  await db
    .update(tweetStreamSubscriptions)
    .set({ isActive: false, unsubscribedAt: now })
    .where(
      and(
        eq(tweetStreamSubscriptions.isActive, true),
        isNull(tweetStreamSubscriptions.streamRuleId),
      ),
    );

  // Surface a heartbeat so the next reconcile pass knows the worker is
  // healthy even when zero events flow.
  await db
    .update(tweetStreamSubscriptions)
    .set({ lastEventAt: sql`COALESCE(${tweetStreamSubscriptions.lastEventAt}, now())` })
    .where(eq(tweetStreamSubscriptions.isActive, true));

  return { added, removed, unchanged };
}
