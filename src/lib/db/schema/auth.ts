import {
  pgTable,
  text,
  integer,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Auth.js (NextAuth v5) tables for the DrizzleAdapter.
 *
 * These are PARALLEL to our app's `users` table — Auth.js needs its own
 * canonical user/account/session records. The signIn callback in
 * `src/lib/auth/config.ts` bridges by upserting our `users` row keyed
 * on `twitterId` from the OAuth profile. JWT session strategy means
 * `authSessions` / `authVerificationTokens` are vestigial today; we
 * keep them so the adapter's API surface is fully satisfied if we ever
 * flip to database sessions.
 *
 * Table-name prefix `auth_*` is deliberate — keeps the namespace clean
 * next to our app tables. The DrizzleAdapter accepts a custom schema
 * map (`{ usersTable, accountsTable, ... }`) so the renamed tables
 * still work end-to-end.
 */

export const authUsers = pgTable("auth_users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);
