import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth as nextAuth } from "@/lib/auth/config";
import type { User } from "@/types/database";

/**
 * Server-side auth helpers.
 *
 * Identity flows through NextAuth's `auth()` helper, which reads the
 * JWT session cookie and returns `{ user: { twitterId, handle, … } }`.
 * We then look up our `users` row keyed on twitterId.
 *
 * `getCurrentUser` is wrapped in React `cache()` so a single request
 * that hits both the layout and a route handler only verifies the JWT
 * once and only queries the users table once.
 *
 * TEST_AUTH_BYPASS — when this env var is exactly the string "true",
 * the helper additionally honors a `test-user-id` cookie that
 * impersonates the matching user. Used by the security-audit harness
 * to fire route-handler-level attacks (rate-limit, cross-user) without
 * mocking the entire NextAuth pipeline. Must NEVER be true in prod;
 * gated behind a hard env equality check, not a truthy comparison, so
 * an accidental "false" / "1" / etc. doesn't flip it on.
 */

const TEST_AUTH_BYPASS = process.env.TEST_AUTH_BYPASS === "true";
const TEST_USER_ID_COOKIE = "test-user-id";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (TEST_AUTH_BYPASS) {
    try {
      const jar = await cookies();
      const testUserId = jar.get(TEST_USER_ID_COOKIE)?.value;
      if (testUserId) {
        const [row] = await getDb()
          .select()
          .from(users)
          .where(eq(users.id, testUserId))
          .limit(1);
        if (row) return row;
      }
    } catch {
      // `cookies()` throws outside request scope (e.g. background jobs);
      // fall through to the NextAuth path silently.
    }
  }

  const session = await nextAuth();
  const twitterId = session?.user?.twitterId;
  if (!twitterId) return null;

  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.twitterId, twitterId))
    .limit(1);
  return row ?? null;
});

/**
 * Strict variant — redirects to /login if there's no session. Use in
 * server components & server actions that should never run anon.
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/* =========================================================================
   Referral codes — short, unambiguous, retried on collision.
   ========================================================================= */

const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1

function randomReferralCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return out;
}

export async function generateUniqueReferralCode(maxAttempts = 6): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = randomReferralCode();
    const [existing] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.referralCode, candidate)))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error(
    `generateUniqueReferralCode: failed after ${maxAttempts} attempts (alphabet is shrinking)`,
  );
}
