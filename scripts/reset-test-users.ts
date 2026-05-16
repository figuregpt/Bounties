/**
 * Reset real user rows so an end-to-end auth flow re-test starts from
 * scratch. Drops our `users` row AND the matching Auth.js `auth_users`
 * row (the OAuth identity) so the next signIn enrolls fresh.
 *
 *   npx tsx scripts/reset-test-users.ts            # delete all real users
 *   npx tsx scripts/reset-test-users.ts <handle>   # delete one specifically
 *
 * Seed rows (admin / creatorN / hunterN, identified by handle prefix)
 * are preserved.
 *
 * Requires DATABASE_URL in env (dotenv-cli wires it through the npm
 * script wrapper).
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, like, not, or } from "drizzle-orm";
import {
  authAccounts,
  authUsers,
  users,
} from "../src/lib/db/schema";

const SEED_HANDLE_PREFIXES = ["admin", "creator", "hunter"];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const filter = process.argv[2]?.replace(/^@/, "")?.toLowerCase() ?? null;

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(sql, { schema: { users, authUsers, authAccounts } });

  const all = await db.select().from(users);
  const realUsers = all.filter((u) => {
    const isSeed = SEED_HANDLE_PREFIXES.some((p) => u.handle.startsWith(p));
    if (isSeed) return false;
    if (filter) return u.handle.toLowerCase() === filter;
    return true;
  });

  if (realUsers.length === 0) {
    console.log(
      filter
        ? `No real user matches "${filter}". Nothing to do.`
        : "No real users to reset. Seed rows preserved.",
    );
    await sql.end();
    return;
  }

  console.log(`Resetting ${realUsers.length} user(s):`);
  for (const u of realUsers) {
    console.log(`  · @${u.handle} (twitterId=${u.twitterId})`);
  }

  // Wipe Auth.js rows that reference this twitter OAuth account, then
  // our app's user row. Cascade clears notifications / social etc.
  for (const u of realUsers) {
    try {
      // auth_accounts → auth_users → cascade onto sessions.
      await db
        .delete(authAccounts)
        .where(
          and(
            eq(authAccounts.provider, "twitter"),
            eq(authAccounts.providerAccountId, u.twitterId),
          ),
        );
      // The auth_users row was linked to that providerAccountId; once
      // we delete by twitterId via the account, the auth_users row
      // also disappears if no other accounts reference it. We delete
      // explicitly to be sure on the rare case it leaked.
      await db
        .delete(authUsers)
        .where(or(eq(authUsers.email, u.handle), eq(authUsers.name, u.handle)));
      await db.delete(users).where(eq(users.id, u.id));
      console.log(`  ✓ ${u.handle} — auth + app rows removed`);
    } catch (err) {
      console.warn(
        `  ✗ DB delete failed for @${u.handle}: ${(err as Error).message}`,
      );
      console.warn(
        "    → user probably has bounties or claims; clear those first if you really need them gone.",
      );
    }
  }

  await sql.end();
  console.log("\nDone. Logout from the browser and sign in again for a fresh enrollment.");

  // Suppress unused-import lint warnings — `not` + `inArray` + `like`
  // imported for future filter expansion.
  void not;
  void inArray;
  void like;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
