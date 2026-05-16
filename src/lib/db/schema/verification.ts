import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bounties } from "./bounties";

/* =========================================================================
   tweet_engagement_cache — cursor & pagination state per (tweet, type)
   ========================================================================= */

export const tweetEngagementCache = pgTable(
  "tweet_engagement_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tweetId: text("tweet_id").notNull(),
    engagementType: text("engagement_type").notNull(),
    lastCursor: text("last_cursor"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    nextScheduledFetchAt: timestamp("next_scheduled_fetch_at", {
      withTimezone: true,
    }),
    knownEngagerCount: integer("known_engager_count").notNull().default(0),
    totalApiCallsMade: integer("total_api_calls_made").notNull().default(0),
    isFullyFetched: boolean("is_fully_fetched").notNull().default(false),
    isStale: boolean("is_stale").notNull().default(false),
  },
  (table) => [
    uniqueIndex("tweet_engagement_cache_tweet_type_unique").on(
      table.tweetId,
      table.engagementType,
    ),
    index("tweet_engagement_cache_next_fetch_idx").on(
      table.nextScheduledFetchAt,
    ),
    index("tweet_engagement_cache_stale_idx").on(
      table.isStale,
      table.lastFetchedAt.asc(),
    ),
  ],
);

/* =========================================================================
   tweet_engagers — individual engagement records we've fetched
   ========================================================================= */

export const tweetEngagers = pgTable(
  "tweet_engagers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tweetId: text("tweet_id").notNull(),
    engagementType: text("engagement_type").notNull(),
    engagerTwitterId: text("engager_twitter_id").notNull(),
    engagerHandle: text("engager_handle"),
    engagementTweetId: text("engagement_tweet_id"),
    engagementText: text("engagement_text"),
    engagementCreatedAt: timestamp("engagement_created_at", {
      withTimezone: true,
    }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isStillValid: boolean("is_still_valid").notNull().default(true),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tweet_engagers_unique").on(
      table.tweetId,
      table.engagementType,
      table.engagerTwitterId,
    ),
    index("tweet_engagers_tweet_type_idx").on(
      table.tweetId,
      table.engagementType,
    ),
    index("tweet_engagers_twitter_id_idx").on(table.engagerTwitterId),
    index("tweet_engagers_active_idx").on(
      table.tweetId,
      table.engagementType,
      table.isStillValid,
    ),
  ],
);

/* =========================================================================
   tweet_stream_subscriptions — twitterapi.io WebSocket rule tracking
   ========================================================================= */

export const tweetStreamSubscriptions = pgTable(
  "tweet_stream_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bountyId: uuid("bounty_id")
      .notNull()
      .references(() => bounties.id, { onDelete: "cascade" }),
    tweetId: text("tweet_id").notNull(),
    streamRuleId: text("stream_rule_id"),
    ruleValue: text("rule_value"),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    eventsReceivedCount: integer("events_received_count")
      .notNull()
      .default(0),
    /** Bumped every time the worker processes a tweet matching this
     *  rule — used by the health probe to detect "stream died". */
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  },
  (table) => [
    index("tweet_stream_subs_bounty_idx").on(table.bountyId),
    index("tweet_stream_subs_active_idx").on(
      table.isActive,
      table.subscribedAt,
    ),
    // At most one ACTIVE subscription per bounty. Old (isActive=false)
    // rows stay around as an audit trail; the partial index makes the
    // constraint specific to live subscriptions.
    uniqueIndex("tweet_stream_subs_one_active_per_bounty")
      .on(table.bountyId)
      .where(sql`${table.isActive} = true`),
  ],
);

/* =========================================================================
   stream_events_log — every event the Layer-2 worker processes.
   Useful for debugging match/no-match issues, replaying events, and
   auditing what each verified claim was based on.
   ========================================================================= */

export const streamEventsLog = pgTable(
  "stream_events_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    streamRuleId: text("stream_rule_id"),
    tweetId: text("tweet_id").notNull(),
    conversationId: text("conversation_id"),
    authorTwitterId: text("author_twitter_id"),
    authorHandle: text("author_handle"),
    text: text("text"),
    isReply: boolean("is_reply").notNull().default(false),
    isQuote: boolean("is_quote").notNull().default(false),
    inReplyToTweetId: text("in_reply_to_tweet_id"),
    quotedTweetId: text("quoted_tweet_id"),
    /** Set if this event helped advance a claim; null when the worker
     *  saw the event but there was no matching claim. */
    matchedClaimId: uuid("matched_claim_id"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("stream_events_log_conversation_idx").on(
      table.conversationId,
      table.receivedAt,
    ),
    index("stream_events_log_author_idx").on(
      table.authorTwitterId,
      table.receivedAt,
    ),
    index("stream_events_log_claim_idx").on(table.matchedClaimId),
  ],
);
