import "server-only";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  smartAccountFollowers,
  smartAccounts,
  TIER_REFRESH_INTERVALS_MS,
  type SmartAccountTier,
} from "@/lib/db/schema";
import { getUserFollowers } from "@/lib/twitter/client";
import type { SmartAccount } from "@/types/database";

/**
 * Smart-account follower sync workers.
 *
 * Architecture is the "reverse cache": instead of looking up "does this
 * hunter follow account X?" per signup ($0.20/hunter), we cache the
 * follower list of each smart account once + refresh on a tier-driven
 * cadence. Hunter eligibility then runs as a single indexed SELECT.
 *
 * Three primary functions:
 *   • syncSmartAccountFollowers — one account, walks pages until done
 *   • initialSyncAllSmartAccounts — first-time setup batch
 *   • refreshAllDueAccounts — picks accounts whose cache is stale
 *
 * All of them are safe to run from a CLI script today; Phase 8 wires
 * them into a proper cron worker.
 */

const DEFAULT_PAGE_SIZE = 200;
/** Per-page cost estimate, kept in sync with the twitterapi.io client. */
const COST_PER_PAGE_USD = 0.00015;

type SyncMode = "incremental" | "full";

type SyncOptions = {
  /** Cap on pages walked in a single run — keeps long syncs interruptible. */
  maxPages?: number;
  /** Pause between pages so we stay well under twitterapi.io's rate limits. */
  delayMs?: number;
  /** `full` clears the cursor before starting so we walk from the top. */
  mode?: SyncMode;
  /** Optional progress callback for CLI scripts. */
  onProgress?: (info: {
    smartAccountId: string;
    handle: string;
    pagesWalked: number;
    followersInserted: number;
    spentUsd: number;
    done: boolean;
  }) => void;
};

export type SyncResult = {
  smartAccountId: string;
  handle: string;
  pagesWalked: number;
  followersInserted: number;
  spentUsd: number;
  done: boolean;
};

/* =========================================================================
   syncSmartAccountFollowers — single account
   ========================================================================= */

export async function syncSmartAccountFollowers(
  smartAccountId: string,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(smartAccounts)
    .where(eq(smartAccounts.id, smartAccountId))
    .limit(1);
  if (!account) {
    throw new Error(`Smart account ${smartAccountId} not found`);
  }

  const mode: SyncMode = opts.mode ?? "incremental";
  let cursor: string | null =
    mode === "full" ? null : account.followersLastCursor;
  let pagesWalked = 0;
  let followersInserted = 0;
  const maxPages = opts.maxPages ?? 1000;

  // `full` mode also bumps a marker on rows so we can prune followers
  // that disappeared between full re-syncs. Phase 8 will use this for
  // unfollow detection; for now we just refresh `cachedAt`.
  for (;;) {
    let page;
    try {
      page = await getUserFollowers(account.handle, {
        cursor,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    } catch (err) {
      console.warn(
        `[smart-followers] ${account.handle} page ${pagesWalked + 1} failed:`,
        err,
      );
      break;
    }

    if (page.followers.length > 0) {
      const rows = page.followers.map((f) => ({
        smartAccountId: account.id,
        followerTwitterId: f.twitterId,
        followerHandle: f.handle || null,
      }));
      // Upsert on the (smart_account, follower) unique constraint so a
      // re-sync refreshes `cachedAt` without duplicating rows.
      await db
        .insert(smartAccountFollowers)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            smartAccountFollowers.smartAccountId,
            smartAccountFollowers.followerTwitterId,
          ],
          set: {
            followerHandle: sql`EXCLUDED.follower_handle`,
            cachedAt: sql`now()`,
          },
        });
      followersInserted += rows.length;
    }

    pagesWalked += 1;
    cursor = page.nextCursor;

    // Update the account row each page so a kill-9'd sync resumes cleanly.
    await db
      .update(smartAccounts)
      .set({
        followersLastCursor: cursor,
        followersCachedAt: new Date(),
        estimatedRefreshCost: sql`${smartAccounts.estimatedRefreshCost} + ${COST_PER_PAGE_USD}`,
        updatedAt: new Date(),
      })
      .where(eq(smartAccounts.id, account.id));

    opts.onProgress?.({
      smartAccountId: account.id,
      handle: account.handle,
      pagesWalked,
      followersInserted,
      spentUsd: pagesWalked * COST_PER_PAGE_USD,
      done: cursor === null,
    });

    if (cursor === null) {
      await db
        .update(smartAccounts)
        .set({
          followersFullySynced: true,
          followerCountSnapshot: followersInserted,
          updatedAt: new Date(),
        })
        .where(eq(smartAccounts.id, account.id));
      break;
    }
    if (pagesWalked >= maxPages) break;
    if (opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
  }

  return {
    smartAccountId: account.id,
    handle: account.handle,
    pagesWalked,
    followersInserted,
    spentUsd: pagesWalked * COST_PER_PAGE_USD,
    done: cursor === null,
  };
}

/* =========================================================================
   initialSyncAllSmartAccounts — first-time bulk sync
   ========================================================================= */

export async function initialSyncAllSmartAccounts(
  opts: SyncOptions & { concurrency?: number } = {},
): Promise<SyncResult[]> {
  const db = getDb();
  const accounts = await db
    .select()
    .from(smartAccounts)
    .where(
      and(
        eq(smartAccounts.isActive, true),
        eq(smartAccounts.followersFullySynced, false),
      ),
    );
  return runBatched(accounts, opts);
}

/* =========================================================================
   refreshSmartAccountFollowers — single account, incremental
   ========================================================================= */

export async function refreshSmartAccountFollowers(
  smartAccountId: string,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  return syncSmartAccountFollowers(smartAccountId, {
    ...opts,
    mode: opts.mode ?? "incremental",
  });
}

/* =========================================================================
   refreshAllDueAccounts — cron entry point
   ========================================================================= */

export async function refreshAllDueAccounts(
  opts: SyncOptions & { concurrency?: number; now?: Date } = {},
): Promise<SyncResult[]> {
  const db = getDb();
  const now = opts.now ?? new Date();
  // We compute "due" entirely in SQL so a worker can pick the next
  // batch without pulling the entire table.
  const due = await db
    .select()
    .from(smartAccounts)
    .where(
      and(
        eq(smartAccounts.isActive, true),
        or(
          // Never synced.
          eq(smartAccounts.followersFullySynced, false),
          // Past the incremental cadence for the tier.
          ...(["tier1", "tier2", "standard"] as SmartAccountTier[]).map((t) =>
            and(
              eq(smartAccounts.tier, t),
              lt(
                smartAccounts.followersCachedAt,
                new Date(now.getTime() - TIER_REFRESH_INTERVALS_MS[t].incrementalMs),
              ),
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(smartAccounts.followersCachedAt));
  return runBatched(due, opts);
}

/* =========================================================================
   Internals
   ========================================================================= */

async function runBatched(
  accounts: SmartAccount[],
  opts: SyncOptions & { concurrency?: number },
): Promise<SyncResult[]> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 5, 10));
  const results: SyncResult[] = [];
  for (let i = 0; i < accounts.length; i += concurrency) {
    const batch = accounts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((a) => syncSmartAccountFollowers(a.id, opts)),
    );
    results.push(...batchResults);
    if (opts.delayMs && i + concurrency < accounts.length) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
  }
  return results;
}
