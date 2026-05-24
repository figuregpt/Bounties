"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useClaimRealtime } from "@/hooks/useClaimRealtime";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Clock,
  Flame,
  Hourglass,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  DropdownTriggerButton,
} from "@/components/ui/dropdown";
import { BountyCard } from "@/components/bounties/bounty-card";
import { BountyCardSkeleton } from "@/components/bounties/bounty-card-skeleton";
import { EmptyState } from "@/components/bounties/empty-state";
import { FilterSidebar } from "@/components/bounties/filter-sidebar";
import { FilterSheetMobile } from "@/components/bounties/filter-sheet-mobile";
import {
  DEFAULT_FILTERS,
  type DiscoverFilters,
} from "@/components/bounties/filter-types";
import { useInfiniteBounties } from "@/hooks/useInfiniteBounties";
import type {
  BountyFeedItem,
  BountySortBy,
} from "@/lib/db/queries/bounties";
import type { LiveActivityRow } from "@/lib/db/queries/activities";
import { DiscordCtaCard } from "@/components/shared/discord-cta-card";
import { LiveActivityPanel } from "@/components/shared/live-activity-panel";
import { formatInt, formatUsd } from "@/lib/format";
import type { User } from "@/types/database";

/**
 * /discover client shell. Owns:
 *  • filter state (lifted from FilterSidebar + sort dropdown)
 *  • infinite scroll wiring via `useInfiniteBounties`
 *
 * The server passes the first page so the initial paint is cheap; the
 * hook only refetches when filters change or the user scrolls to the
 * sentinel near the bottom of the list.
 */

type Props = {
  user: User | null;
  initial: {
    items: BountyFeedItem[];
    nextCursor: string | null;
    totalCount: number;
    totalPoolUsd: number;
  };
  activities: LiveActivityRow[];
};

const SORT_OPTIONS: {
  value: BountySortBy;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "newest", label: "Newest", icon: Clock },
  { value: "hot", label: "Hot", icon: Flame },
  { value: "ending_soon", label: "Ending soon", icon: Hourglass },
  { value: "highest_reward", label: "Highest reward", icon: ArrowUpRight },
];

export function DiscoverClient({ user: _user, initial, activities }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // Count of filters diverging from defaults — surfaced as a badge on
  // the mobile Filters button. Treat preset/sortBy as "view modes",
  // not filter dimensions, so they don't bump the count.
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (
      filters.statuses.length !== DEFAULT_FILTERS.statuses.length ||
      filters.statuses[0] !== DEFAULT_FILTERS.statuses[0]
    ) {
      n += 1;
    }
    if (filters.rewardTokens.length > 0) n += 1;
    if (filters.minRewardPerHunterUsd > 0) n += 1;
    if (filters.showIneligible !== DEFAULT_FILTERS.showIneligible) n += 1;
    return n;
  }, [filters]);

  // Live activity feed — subscribe to the global SSE channel; every
  // `activity_inserted` event triggers a server-component refresh so
  // the LiveActivityPanel re-receives the latest rows. router.refresh
  // is cheap (re-runs the discover page query) and avoids building a
  // dedicated /api/activities polling endpoint.
  useClaimRealtime(
    "global",
    useCallback(
      (msg) => {
        if (msg.type === "activity_inserted") router.refresh();
      },
      [router],
    ),
  );

  const queryFilters = useMemo(
    () => ({
      sortBy: filters.sortBy,
      showIneligible: filters.showIneligible,
      rewardTokens:
        filters.rewardTokens.length > 0 ? filters.rewardTokens : undefined,
      status: filters.statuses.length > 0 ? filters.statuses : undefined,
      minRewardPerHunterUsd:
        filters.minRewardPerHunterUsd > 0
          ? filters.minRewardPerHunterUsd
          : undefined,
      searchQuery: filters.searchQuery,
      endingWithinHours: filters.endingWithinHours,
    }),
    [filters],
  );

  const {
    items,
    totalCount,
    isLoading,
    isLoadingMore,
    hasMore,
    sentinelRef,
  } = useInfiniteBounties({
    initial: {
      items: initial.items,
      nextCursor: initial.nextCursor,
      totalCount: initial.totalCount,
    },
    filters: queryFilters,
  });

  const isEmpty = !isLoading && items.length === 0;
  const filtersAreDefault =
    JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="space-y-6">
      {/* ─── Platform row ──────────────────────────────────────────── */}
      <PlatformRow />

      {/* ─── Discord CTA (dismissible) ─────────────────────────────── */}
      <DiscordCtaCard />

      {/* ─── Header ────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">Discover</h1>
          <p className="mt-1 text-body text-text-secondary">
            <span
              className="font-mono tabular-nums text-text-primary"
              data-numeric
            >
              {formatInt(totalCount)}
            </span>{" "}
            active{" "}
            {totalCount === 1 ? "bounty" : "bounties"}
            {initial.totalPoolUsd > 0 && (
              <>
                ,{" "}
                <span
                  className="font-mono tabular-nums text-text-primary"
                  data-numeric
                >
                  {formatUsd(initial.totalPoolUsd)}
                </span>{" "}
                in rewards
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/how-it-works"
            className="press inline-flex h-9 items-center rounded-[var(--radius-pill)] border border-border-default bg-bg-elevated px-3 text-small font-medium text-text-primary transition-colors hover:border-border-hover"
          >
            How it works
          </Link>
          <SortDropdown
            value={filters.sortBy}
            onChange={(sortBy) => setFilters({ ...filters, sortBy })}
          />
        </div>
      </header>

      {/* ─── Mobile filter row ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-border-default bg-bg-elevated px-3 text-small font-medium text-text-primary hover:border-border-hover"
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={2.25} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-primary px-1.5 text-[10px] font-semibold text-[#100F16]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* ─── 3-col grid (desktop) / single col (mobile) ────────────── */}
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        {/* Filters (desktop) */}
        <div className="hidden lg:block">
          <FilterSidebar filters={filters} onChange={setFilters} />
        </div>

        {/* Feed */}
        <main className="min-w-0">
          {isLoading ? (
            <SkeletonGrid />
          ) : isEmpty ? (
            <EmptyState
              variant={filtersAreDefault ? "no_bounties" : "filters_too_narrow"}
              onAction={
                filtersAreDefault
                  ? undefined
                  : () => setFilters({ ...DEFAULT_FILTERS })
              }
            />
          ) : (
            <FeedList
              items={items}
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              sentinelRef={sentinelRef}
            />
          )}
        </main>

        {/* Live activity (desktop) */}
        <div className="hidden lg:block">
          <LiveActivityPanel rows={activities} />
        </div>
      </div>

      {/* Mobile filter sheet — mounted at root so it overlays the
          whole viewport, including the bottom nav. */}
      <FilterSheetMobile
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onFiltersChange={setFilters}
      />
    </div>
  );
}

/* =========================================================================
   Sub-components
   ========================================================================= */

function SortDropdown({
  value,
  onChange,
}: {
  value: BountySortBy;
  onChange: (next: BountySortBy) => void;
}) {
  const active = SORT_OPTIONS.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownTrigger>
        <DropdownTriggerButton label="Sort">
          {active?.label ?? "Newest"}
        </DropdownTriggerButton>
      </DropdownTrigger>
      <DropdownContent className="w-48">
        {SORT_OPTIONS.map((o) => (
          <DropdownItem
            key={o.value}
            icon={o.icon}
            active={o.value === value}
            onSelect={() => onChange(o.value)}
          >
            {o.label}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

function FeedList({
  items,
  isLoadingMore,
  hasMore,
  sentinelRef,
}: {
  items: BountyFeedItem[];
  isLoadingMore: boolean;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {items.map((b, i) => (
            <motion.li
              key={b.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                delay: Math.min(i, 6) * 0.04,
                type: "spring",
                stiffness: 400,
                damping: 30,
              }}
            >
              <BountyCard bounty={b} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {isLoadingMore && (
        <div className="mt-3 space-y-3">
          <BountyCardSkeleton />
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} aria-hidden className="h-8" />
      )}

      {!hasMore && items.length > 0 && (
        <p className="mt-6 text-center text-caption uppercase tracking-wider text-text-tertiary">
          You&rsquo;ve reached the end
        </p>
      )}
    </>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <BountyCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Platform row — X live, Instagram + TikTok pending
   ───────────────────────────────────────────────────────────────────────── */

function PlatformRow() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PlatformChip name="X" active icon={<XLogo />} />
      <PlatformChip name="Instagram" icon={<InstagramLogo />} />
      <PlatformChip name="TikTok" icon={<TikTokLogo />} />
    </div>
  );
}

function PlatformChip({
  name,
  active,
  icon,
}: {
  name: string;
  active?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <span
      aria-disabled={!active}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] px-3.5 text-small font-medium transition-colors",
        active
          ? "bg-accent-soft text-accent-text"
          : "border border-border-default bg-bg-elevated text-text-tertiary",
      )}
    >
      <span
        className={cn(
          "grid size-5 place-items-center",
          active ? "text-accent-text" : "text-text-tertiary",
        )}
      >
        {icon}
      </span>
      <span>{name}</span>
      {!active && (
        <span className="ml-1 rounded-[var(--radius-pill)] bg-bg-base px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          Soon
        </span>
      )}
    </span>
  );
}

function XLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4"
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function InstagramLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none">
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function TikTokLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4"
      fill="currentColor"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .57.04.83.12V9.41a6.34 6.34 0 0 0-1-.05A6.33 6.33 0 0 0 5.27 20.5a6.34 6.34 0 0 0 10.86-4.43V8.95a8.16 8.16 0 0 0 4.77 1.52V7.04a4.85 4.85 0 0 1-1.31-.35Z" />
    </svg>
  );
}
