/**
 * Recomputes denormalized counters on the bounties table from actual
 * claim rows. Run after manual DB surgery or if a bug ever drifts the
 * counters in production.
 *
 *   npm run db:reconcile
 *
 * Idempotent. Logs every bounty whose counters changed (with deltas)
 * and exits 0 even if there were drifts — operators can pipe to grep to
 * decide whether to alert.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

type Row = {
  id: string;
  slug: string;
  current_was: number;
  pending_was: number;
  claimed_was: number;
  failed_was: number;
  current_actual: number;
  pending_actual: number;
  claimed_actual: number;
  failed_actual: number;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }
  const client = postgres(url, { max: 2, prepare: false });
  const db = drizzle(client, { schema });

  // First pass: see who's drifted.
  //
  // Phase 8.5+ semantics:
  //   current_hunters_count  = claims in verified-or-better statuses
  //                            (initial_verified through claimed_reward)
  //   pending_hunters_count  = claims still mid-flow (awaiting_action,
  //                            action_claimed) — the "N hunting" hint
  //   claimed_hunters_count  = claims at claimed_reward
  //   failed_hunters_count   = claims at failed (terminal)
  const drifted = (await db.execute(sql`
    WITH actuals AS (
      SELECT
        b.id,
        b.slug,
        b.current_hunters_count       AS current_was,
        b.pending_hunters_count       AS pending_was,
        b.claimed_hunters_count       AS claimed_was,
        b.failed_hunters_count        AS failed_was,
        (SELECT COUNT(*) FROM claims c WHERE c.bounty_id = b.id
            AND c.status IN ('initial_verified','awaiting_final','verified','claiming','claimed_reward'))::int
          AS current_actual,
        (SELECT COUNT(*) FROM claims c WHERE c.bounty_id = b.id
            AND c.status IN ('awaiting_action','action_claimed'))::int
          AS pending_actual,
        (SELECT COUNT(*) FROM claims c WHERE c.bounty_id = b.id
            AND c.status = 'claimed_reward')::int
          AS claimed_actual,
        (SELECT COUNT(*) FROM claims c WHERE c.bounty_id = b.id
            AND c.status = 'failed')::int
          AS failed_actual
      FROM bounties b
    )
    SELECT *
    FROM actuals
    WHERE current_was <> current_actual
       OR pending_was <> pending_actual
       OR claimed_was <> claimed_actual
       OR failed_was  <> failed_actual
  `)) as unknown as Row[];

  if (drifted.length === 0) {
    console.log("All bounty counters match real claim rows. Nothing to do.");
    await client.end({ timeout: 5 });
    return;
  }

  console.log(`Drift detected on ${drifted.length} bounty row(s):`);
  for (const r of drifted) {
    console.log(
      `  ${r.slug}  ` +
        `current ${r.current_was}→${r.current_actual}  ` +
        `pending ${r.pending_was}→${r.pending_actual}  ` +
        `claimed ${r.claimed_was}→${r.claimed_actual}  ` +
        `failed ${r.failed_was}→${r.failed_actual}`,
    );
  }

  // Apply the fix in one statement so partial completion can't half-fix
  // the table.
  await db.execute(sql`
    UPDATE bounties b SET
      current_hunters_count = (
        SELECT COUNT(*) FROM claims c WHERE c.bounty_id = b.id
          AND c.status IN ('initial_verified','awaiting_final','verified','claiming','claimed_reward')
      ),
      pending_hunters_count = (
        SELECT COUNT(*) FROM claims c WHERE c.bounty_id = b.id
          AND c.status IN ('awaiting_action','action_claimed')
      ),
      claimed_hunters_count = (
        SELECT COUNT(*) FROM claims c WHERE c.bounty_id = b.id
          AND c.status = 'claimed_reward'
      ),
      failed_hunters_count = (
        SELECT COUNT(*) FROM claims c WHERE c.bounty_id = b.id
          AND c.status = 'failed'
      )
  `);

  console.log(`Reconciled ${drifted.length} bounty row(s).`);
  await client.end({ timeout: 5 });
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
