/**
 * Seed `smart_accounts` from a file.
 *
 * Usage:
 *   npm run smart-accounts:seed -- ./data/smart-accounts.txt
 *
 * File format — one handle per line (with or without `@`). Lines
 * starting with `#` are ignored. Optionally tag a tier inline:
 *
 *   @ansem                tier1
 *   @aeyakovenko          tier1
 *   solana                tier2
 *   # comment line — skipped
 *   any_other_account
 *
 * After inserting, the script can optionally hydrate display names and
 * Twitter ids by calling `getUserInfo` for each new account. Pass
 * `--enrich` to opt in (costs ~$0.00018 × handle count).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import { smartAccounts } from "../src/lib/db/schema";

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const VALID_TIERS = new Set(["tier1", "tier2", "standard"]);

type ParsedLine = { handle: string; tier: "tier1" | "tier2" | "standard" };

async function main() {
  const argv = process.argv.slice(2);
  const enrich = argv.includes("--enrich");
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error(
      "Usage: npm run smart-accounts:seed -- <path-to-file> [--enrich]",
    );
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set — load via dotenv-cli");
  }

  const lines = parseFile(resolve(file));
  console.log(`📥  ${lines.length} handles parsed from ${file}`);

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema: { smartAccounts } });

  // Skip handles we've already ingested. We compare lower-cased + @-stripped
  // because the file may carry either form.
  const existing = await db
    .select({ handle: smartAccounts.handle })
    .from(smartAccounts)
    .where(
      inArray(
        smartAccounts.handle,
        lines.map((l) => l.handle),
      ),
    );
  const seen = new Set(existing.map((r) => r.handle));
  const fresh = lines.filter((l) => !seen.has(l.handle));
  if (fresh.length === 0) {
    console.log("    nothing new to seed");
    await client.end();
    return;
  }

  await db.insert(smartAccounts).values(
    fresh.map((l) => ({
      handle: l.handle,
      tier: l.tier,
    })),
  );
  console.log(`    ✓ inserted ${fresh.length} new accounts`);

  if (enrich) {
    console.log("🔎  enriching with twitterapi.io getUserInfo …");
    // Dynamic import so the script works even without TWITTER_API_KEY
    // when --enrich isn't passed.
    const { getUserInfo } = await import("../src/lib/twitter/client");
    for (const row of fresh) {
      try {
        const info = await getUserInfo(row.handle);
        await db
          .update(smartAccounts)
          .set({
            twitterId: info.id || null,
            displayName: info.name,
            avatarUrl: info.profilePicture,
            followerCountSnapshot: info.followers,
            updatedAt: new Date(),
          })
          .where(eq(smartAccounts.handle, row.handle));
        console.log(`    ✓ @${row.handle} → ${info.followers.toLocaleString()} followers`);
      } catch (err) {
        console.warn(
          `    ✗ @${row.handle} enrichment failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  await client.end();
  console.log("\n✅  seed-smart-accounts done");
}

function parseFile(path: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const seen = new Set<string>();
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = raw.split("#")[0].trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const handle = parts[0].replace(/^@/, "").toLowerCase();
    const tier = (parts[1] ?? "standard") as ParsedLine["tier"];
    if (!HANDLE_RE.test(handle)) {
      console.warn(`    ✗ skipping invalid handle: ${parts[0]}`);
      continue;
    }
    if (!VALID_TIERS.has(tier)) {
      console.warn(`    ✗ invalid tier "${tier}" for @${handle}, using standard`);
    }
    if (seen.has(handle)) continue;
    seen.add(handle);
    out.push({
      handle,
      tier: VALID_TIERS.has(tier) ? tier : "standard",
    });
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
