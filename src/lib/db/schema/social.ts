import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { bounties } from "./bounties";
import { claims } from "./claims";

/* =========================================================================
   social_follows — directed user → user follow edges
   ========================================================================= */

export const socialFollows = pgTable(
  "social_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerUserId: uuid("follower_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingUserId: uuid("following_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("social_follows_unique").on(
      table.followerUserId,
      table.followingUserId,
    ),
    index("social_follows_follower_idx").on(table.followerUserId),
    index("social_follows_following_idx").on(table.followingUserId),
  ],
);

/* =========================================================================
   social_activities — public activity feed
   ========================================================================= */

export type SocialActivityMetadata = Record<string, unknown>;

export const socialActivities = pgTable(
  "social_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    bountyId: uuid("bounty_id").references(() => bounties.id, {
      onDelete: "set null",
    }),
    claimId: uuid("claim_id").references(() => claims.id, {
      onDelete: "set null",
    }),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<SocialActivityMetadata>(),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("social_activities_actor_idx").on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
    index("social_activities_global_idx").on(
      table.isPublic,
      table.createdAt.desc(),
    ),
    index("social_activities_type_idx").on(table.type, table.createdAt.desc()),
  ],
);
