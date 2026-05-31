"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BountyFeedItem, BountyFilters } from "@/lib/db/queries/bounties";

/**
 * Infinite-scroll feed reader. Built around plain fetch + useState so we
 * don't pull in SWR/React Query for one screen.
 *
 * Lifecycle:
 *  • Filter change → reset state and refetch first page.
 *  • `loadMore` → appends the next page using the server cursor.
 *  • A version counter discards out-of-order responses when filters
 *    change rapidly.
 */

type FetchResult = {
  ok: boolean;
  items?: BountyFeedItem[];
  nextCursor?: string | null;
  totalCount?: number;
  error?: string;
};

type Args = {
  /** First-page data injected by the server for the initial render. */
  initial: {
    items: BountyFeedItem[];
    nextCursor: string | null;
    totalCount: number;
  };
  filters: BountyFilters;
};

export function useInfiniteBounties({ initial, filters }: Args) {
  const [items, setItems] = useState<BountyFeedItem[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initial.nextCursor,
  );
  const [totalCount, setTotalCount] = useState(initial.totalCount);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Serializing filters lets useEffect dep-track them shallowly without
  // forcing the caller to memoize.
  const filtersKey = useMemo(() => stableFilters(filters), [filters]);
  // Suppresses the first refetch — the server already gave us the initial
  // page that matches `initial`. We only refetch after the filters actually
  // change relative to that initial.
  const firstRunRef = useRef(true);
  const versionRef = useRef(0);

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    let cancelled = false;
    const version = ++versionRef.current;
    setIsLoading(true);
    setError(null);
    (async () => {
      const res = await fetchPage(filtersKey, null);
      if (cancelled || versionRef.current !== version) return;
      if (!res.ok) {
        setError(res.error ?? "Failed to load bounties");
        setIsLoading(false);
        return;
      }
      setItems(res.items ?? []);
      setNextCursor(res.nextCursor ?? null);
      setTotalCount(res.totalCount ?? 0);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filtersKey]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || isLoading || !nextCursor) return;
    setIsLoadingMore(true);
    const version = versionRef.current;
    const res = await fetchPage(filtersKey, nextCursor);
    if (versionRef.current !== version) return;
    if (!res.ok) {
      setError(res.error ?? "Failed to load more bounties");
      setIsLoadingMore(false);
      return;
    }
    setItems((prev) => dedupe([...prev, ...(res.items ?? [])]));
    setNextCursor(res.nextCursor ?? null);
    setIsLoadingMore(false);
  }, [filtersKey, isLoading, isLoadingMore, nextCursor]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px 0px 200px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return {
    items,
    totalCount,
    isLoading,
    isLoadingMore,
    hasMore: nextCursor !== null,
    error,
    loadMore,
    sentinelRef,
  };
}

/* =========================================================================
   Helpers
   ========================================================================= */

async function fetchPage(
  filtersKey: string,
  cursor: string | null,
): Promise<FetchResult> {
  const params = JSON.parse(filtersKey) as Record<string, string | undefined>;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") search.set(k, v);
  }
  if (cursor) search.set("cursor", cursor);
  try {
    const res = await fetch(`/api/bounties?${search.toString()}`, {
      cache: "no-store",
    });
    const body = (await res.json()) as FetchResult;
    if (!res.ok || !body.ok) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return body;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function stableFilters(filters: BountyFilters): string {
  // Lossy → string conversion that the API route expects.
  const statusList = Array.isArray(filters.status)
    ? filters.status
    : filters.status
      ? [filters.status]
      : undefined;
  return JSON.stringify({
    sortBy: filters.sortBy,
    chain: filters.chain,
    showIneligible: filters.showIneligible ? "true" : undefined,
    showFilled: filters.showFilled ? "true" : undefined,
    rewardTokens: filters.rewardTokens?.length
      ? filters.rewardTokens.join(",")
      : undefined,
    statuses: statusList?.length ? statusList.join(",") : undefined,
    minRewardPerHunterUsd:
      filters.minRewardPerHunterUsd != null
        ? String(filters.minRewardPerHunterUsd)
        : undefined,
    q: filters.searchQuery,
    endingWithinHours:
      filters.endingWithinHours != null
        ? String(filters.endingWithinHours)
        : undefined,
  });
}

function dedupe(items: BountyFeedItem[]): BountyFeedItem[] {
  const seen = new Set<string>();
  const out: BountyFeedItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}
