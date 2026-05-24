import type { BountyStatus } from "@/types/database";
import type { BountySortBy } from "@/lib/db/queries/bounties";

/**
 * The single shape held by the discover page and threaded through every
 * filter UI control. Keep this tight — the API route translates it back
 * to query-string params using the same names.
 */
export type DiscoverFilters = {
  statuses: BountyStatus[];
  /** Token symbols OR base58 mint addresses. The token-picker UI adds
   *  symbols for canonical chips and mint strings for paste-box
   *  entries. The server matches either via `rewardTokenSymbol` /
   *  `rewardTokenMint` (see queries/bounties.ts:buildWhere). */
  rewardTokens: string[];
  minRewardPerHunterUsd: number;
  showIneligible: boolean;
  /** Filled non-lottery bounties are hidden from the feed by default —
   *  they can't accept new hunters until endsAt rolls around. Toggle
   *  this on to see them anyway (useful for browsing what people are
   *  posting). Doesn't affect pool_lottery, which never short-circuits
   *  on slot capacity. */
  showFilled: boolean;
  sortBy: BountySortBy;
  endingWithinHours?: number;
  searchQuery?: string;
  /** Used by the mobile chip row to apply opinionated presets. */
  preset?: "all" | "hot" | "ending_soon" | "high_reward" | "eligible_only";
};

export const DEFAULT_FILTERS: DiscoverFilters = {
  statuses: ["active"],
  rewardTokens: [],
  minRewardPerHunterUsd: 0,
  // Default ON: in early-network conditions we'd rather show a
  // hunter every live bounty than hide ones they happen to not
  // qualify for. Users can toggle off to narrow the feed.
  showIneligible: true,
  showFilled: false,
  sortBy: "newest",
  preset: "all",
};
