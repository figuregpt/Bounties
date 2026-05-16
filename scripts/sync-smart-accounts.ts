/**
 * One-shot bulk sync: walk every active smart account that hasn't been
 * fully synced yet, page-by-page.
 *
 * Usage:
 *   npm run smart-accounts:sync
 *
 * Long-running — expect minutes-to-hours depending on how many accounts
 * × how many followers. Progress is logged per page so a Ctrl-C
 * resumes cleanly on the next run (the cursor is persisted to
 * `smart_accounts.followers_last_cursor`).
 */
import { initialSyncAllSmartAccounts } from "../src/lib/smart-followers/sync";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set — load via dotenv-cli");
  }
  if (!process.env.TWITTER_API_KEY) {
    throw new Error("TWITTER_API_KEY not set");
  }

  console.log("🔄  initial sync — walking all unsynced active smart accounts");
  const results = await initialSyncAllSmartAccounts({
    concurrency: 3,
    delayMs: 500,
    onProgress: (info) => {
      console.log(
        `    @${info.handle} · pages=${info.pagesWalked} · followers=${info.followersInserted.toLocaleString()} · $${info.spentUsd.toFixed(4)}${info.done ? " · done" : ""}`,
      );
    },
  });

  const totalFollowers = results.reduce(
    (acc, r) => acc + r.followersInserted,
    0,
  );
  const totalCost = results.reduce((acc, r) => acc + r.spentUsd, 0);
  console.log(
    `\n✅  ${results.length} accounts synced · ${totalFollowers.toLocaleString()} followers cached · $${totalCost.toFixed(4)} spent`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
