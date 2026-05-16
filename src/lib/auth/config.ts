import NextAuth, { type NextAuthConfig } from "next-auth";
import Twitter from "next-auth/providers/twitter";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/lib/db";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerificationTokens,
} from "@/lib/db/schema";

/**
 * NextAuth v5 (Auth.js) — Twitter OAuth 2.0 sign-in.
 *
 * Two-layer user model:
 *   • Auth.js tracks its own identity record in `auth_users` /
 *     `auth_accounts` via the DrizzleAdapter (provider linkage,
 *     OAuth-token rotation, audit).
 *   • Our app's `users` table holds product data (bounties, claims,
 *     wallet, smart-follower counts). The signIn callback below
 *     bridges them: on each successful Twitter OAuth, we upsert our
 *     `users` row keyed by `twitterId`.
 *
 * JWT session strategy keeps reads cheap — `auth_sessions` /
 * `auth_verification_tokens` exist for forward-compat but the cookie
 * holds the session today.
 *
 * The exported `auth`, `signIn`, `signOut` helpers are the canonical
 * server-side entry points. Anywhere else that previously used Privy
 * should import these.
 */

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(getDb(), {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  providers: [
    // v5 Twitter provider is OAuth 2.0 by default; the `authorization`
    // URL on the built-in already bakes in the scopes we want
    // (`users.read tweet.read offline.access`). Don't override —
    // passing a `{ params }` object without a base URL crashes
    // `getAuthorizationUrl` with "TypeError: Invalid URL".
    Twitter({
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  callbacks: {
    // Upsert our `users` row on every sign-in. Lazy-import the helper
    // so the auth config can be loaded by Edge middleware without
    // dragging the twitterapi.io enrichment dependency tree along.
    async signIn({ profile, account }) {
      if (account?.provider !== "twitter") return true;
      const data = (profile as { data?: TwitterProfileData } | undefined)
        ?.data;
      if (!data?.id) {
        console.warn("[auth] Twitter signIn missing profile.data.id", {
          profile,
        });
        return false;
      }
      try {
        const { upsertUserFromTwitter } = await import("./upsert-user");
        await upsertUserFromTwitter({
          twitterId: data.id,
          handle: data.username,
          displayName: data.name,
          avatarUrl: data.profile_image_url ?? null,
          twitterVerified: data.verified ?? false,
        });
      } catch (err) {
        console.error("[auth] upsertUserFromTwitter failed:", err);
        // Don't block sign-in on enrichment failure — the user record
        // can be backfilled by an admin script if twitterapi.io is
        // down. Auth.js's adapter still records the auth_users row.
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      // Twitter profile only arrives on initial sign-in. Persist what
      // we need on the JWT so subsequent requests don't need a DB hit.
      if (account?.provider === "twitter" && profile) {
        const data = (profile as { data?: TwitterProfileData }).data;
        if (data) {
          token.twitterId = data.id;
          token.handle = data.username;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.twitterId =
          (token.twitterId as string | undefined) ?? null;
        session.user.handle = (token.handle as string | undefined) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
};

type TwitterProfileData = {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  verified?: boolean;
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
