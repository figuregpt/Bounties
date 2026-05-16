import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { bounties } from "./bounties";
import { claims } from "./claims";

/* =========================================================================
   notifications — in-app feed. Push/email channels share the same row.
   ========================================================================= */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    imageUrl: text("image_url"),
    linkUrl: text("link_url"),

    relatedBountyId: uuid("related_bounty_id").references(() => bounties.id, {
      onDelete: "set null",
    }),
    relatedClaimId: uuid("related_claim_id").references(() => claims.id, {
      onDelete: "set null",
    }),
    relatedUserId: uuid("related_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    read: boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    delivered: boolean("delivered").notNull().default(false),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    channels: text("channels")
      .array()
      .notNull()
      .default(sql`ARRAY['web']::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_unread_idx").on(
      table.userId,
      table.read,
      table.createdAt.desc(),
    ),
    index("notifications_user_feed_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("notifications_delivery_idx").on(table.delivered, table.createdAt),
  ],
);
