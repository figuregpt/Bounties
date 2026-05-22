import type { Metadata } from "next";
import { and, eq, gt, sum } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bounties } from "@/lib/db/schema";
import { getActiveBounties } from "@/lib/db/queries/bounties";
import { getLiveActivities } from "@/lib/db/queries/activities";
import { DiscoverClient } from "./discover-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Discover" };

/**
 * Discover — protected app shell route. Renders the first page server-side
 * so the initial paint shows real cards; the client component takes over
 * for filter toggles and infinite scroll.
 */
export default async function DiscoverPage() {
  // The (app) layout already redirected on anon, but we re-resolve the user
  // here because eligibility computation needs the row.
  const user = await getCurrentUser();

  const [feed, activities, [poolRow]] = await Promise.all([
    getActiveBounties(
      user,
      // Match DEFAULT_FILTERS in filter-types.ts — ineligible shown by
      // default so first paint matches what the client's sidebar would
      // request once it hydrates.
      { sortBy: "newest", showIneligible: true },
      { limit: 20 },
    ),
    getLiveActivities({ limit: 10 }),
    getDb()
      .select({ sum: sum(bounties.totalPoolUsd) })
      .from(bounties)
      .where(
        and(eq(bounties.status, "active"), gt(bounties.endsAt, new Date())),
      ),
  ]);

  const totalPoolUsd = Number(poolRow?.sum ?? 0);

  return (
    <DiscoverClient
      user={user}
      initial={{
        items: feed.items,
        nextCursor: feed.nextCursor,
        totalCount: feed.totalCount,
        totalPoolUsd,
      }}
      activities={activities}
    />
  );
}
