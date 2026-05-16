import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/* =========================================================================
   feature_flags — gradual rollouts & admin toggles
   ========================================================================= */

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  description: text("description"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  rolloutPercentage: integer("rollout_percentage").notNull().default(0),
  enabledForUserIds: uuid("enabled_for_user_ids").array(),
  enabledForReputationTier: text("enabled_for_reputation_tier").array(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
