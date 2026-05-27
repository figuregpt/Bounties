import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatHandle, formatRelativeTime } from "@/lib/format";
import { TokenChip } from "./token-chip";
import { cn } from "@/lib/utils";
import type { HunterRow } from "@/lib/db/queries/claims";

/**
 * Renders the recent-hunter list on the bounty detail page.
 *
 * Each row is its own Link so the whole strip is a click target. Status
 * badge color tracks the claim lifecycle without surfacing the gnarly
 * status names verbatim — "Hunting" / "Verified" / "Claimed" / "Failed"
 * is enough for the visitor.
 */
export function HunterList({
  hunters,
  emptyHint,
  tokenLogoUrl,
  isLottery = false,
}: {
  hunters: HunterRow[];
  /** Override the empty-state copy (the detail page swaps it for
   *  "Be the first hunter on this bounty"). */
  emptyHint?: string;
  /** Reward-token logo applied to every row's chip. Looked up once at
   *  the page level so we don't JOIN tokens per claim row. */
  tokenLogoUrl?: string | null;
  /** Lottery bounties swap "Verified" / "Claimed" labels for
   *  "Winner" / "Won" so the draw outcome is obvious from the row. */
  isLottery?: boolean;
}) {
  if (hunters.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-border-default px-6 py-10 text-center text-small text-text-tertiary">
        {emptyHint ?? "No hunters yet."}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-bg-surface">
      {hunters.map((h) => (
        <li key={h.id}>
          <Link
            href={`/profile/${h.hunter.handle}`}
            className="press flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-elevated"
          >
            <Avatar className="size-7 shrink-0">
              <AvatarImage
                src={h.hunter.avatarUrl ?? undefined}
                alt={`@${h.hunter.handle}`}
              />
              <AvatarFallback className="bg-accent-soft text-caption text-accent-text">
                {(h.hunter.displayName ?? h.hunter.handle)
                  .charAt(0)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-small text-text-primary">
                {h.hunter.displayName ?? formatHandle(h.hunter.handle)}
              </p>
              <p className="truncate text-caption text-text-tertiary">
                {formatHandle(h.hunter.handle)} ·{" "}
                {formatRelativeTime(h.createdAt)}
              </p>
            </div>

            <StatusBadge row={h} isLottery={isLottery} />

            <TokenChip
              size="sm"
              symbol={h.rewardTokenSymbol}
              amount={h.rewardAmount}
              logoUrl={tokenLogoUrl ?? null}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({
  row,
  isLottery,
}: {
  row: HunterRow;
  isLottery: boolean;
}) {
  const tone = toneFor(row, isLottery);
  return (
    <span
      className={cn(
        "hidden shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-caption uppercase tracking-wider sm:inline-flex",
        tone.bg,
        tone.text,
      )}
    >
      {tone.label}
    </span>
  );
}

function toneFor(
  row: HunterRow,
  isLottery: boolean,
): {
  label: string;
  bg: string;
  text: string;
} {
  // Lottery losers come back as status=failed with a dedicated
  // category — treat them as a neutral "didn't get drawn" instead of
  // the warning-tone "Failed" pill that withdraw-action failures get.
  if (
    row.status === "failed" &&
    row.failureCategory === "not_selected_lottery"
  ) {
    return {
      label: "Not picked",
      bg: "bg-bg-elevated",
      text: "text-text-tertiary",
    };
  }
  switch (row.status) {
    case "claimed_reward":
      // Lottery view collapses "verified (drawn but not claimed)" and
      // "claimed (drawn + reward sent)" into a single "Winner" pill —
      // both are winners and the claim-vs-pending distinction is
      // internal state the viewer doesn't need to disambiguate.
      return {
        label: isLottery ? "Winner" : "Claimed",
        bg: "bg-success-soft",
        text: "text-success",
      };
    case "verified":
      return {
        label: isLottery ? "Winner" : "Verified",
        bg: "bg-success-soft",
        text: "text-success",
      };
    case "failed":
      return {
        label: "Failed",
        bg: "bg-warning-soft",
        text: "text-warning",
      };
    default:
      return {
        label: "Hunting",
        bg: "bg-bg-elevated",
        text: "text-text-secondary",
      };
  }
}
