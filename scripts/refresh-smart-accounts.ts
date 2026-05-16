/**
 * Tier-aware refresh — picks smart accounts whose cache is past their
 * tier's incremental interval (tier1: 7d, tier2: 14d, standard: 30d)
 * and walks them.
 *
 * Usage:
 *   npm run smart-accounts:refresh
 *
 * Designed to be triggered by a daily cron (Phase 8 wires that up). For
 * now run it manually whenever the cost report says there are accounts
 * due.
 */
import { refreshAllDueAccounts } from "../src/lib/smart-followers/sync";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set — load via dotenv-cli");
  }
  if (!process.env.TWITTER_API_KEY) {
    throw new Error("TWITTER_API_KEY not set");
  }

  console.log("🔁  refreshing all due smart accounts");
  const results = await refreshAllDueAccounts({
    concurrency: 5,
    delayMs: 250,
    mode: "incremental",
    onProgress: (info) => {
      console.log(
        `    @${info.handle} · pages=${info.pagesWalked} · +${info.followersInserted.toLocaleString()} · $${info.spentUsd.toFixed(4)}${info.done ? " · done" : ""}`,
      );
    },
  });

  if (results.length === 0) {
    console.log("    nothing due — all caches fresh");
    return;
  }
  const totalNew = results.reduce((acc, r) => acc + r.followersInserted, 0);
  const totalCost = results.reduce((acc, r) => acc + r.spentUsd, 0);
  console.log(
    `\n✅  ${results.length} accounts refreshed · ${totalNew.toLocaleString()} follower rows touched · $${totalCost.toFixed(4)} spent`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
