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
}: {
  hunters: HunterRow[];
  /** Override the empty-state copy (the detail page swaps it for
   *  "Be the first hunter on this bounty"). */
  emptyHint?: string;
  /** Reward-token logo applied to every row's chip. Looked up once at
   *  the page level so we don't JOIN tokens per claim row. */
  tokenLogoUrl?: string | null;
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

            <StatusBadge status={h.status} />

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

function StatusBadge({ status }: { status: HunterRow["status"] }) {
  const tone = toneFor(status);
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

function toneFor(status: HunterRow["status"]): {
  label: string;
  bg: string;
  text: string;
} {
  switch (status) {
    case "claimed_reward":
      return {
        label: "Claimed",
        bg: "bg-success-soft",
        text: "text-success",
      };
    case "verified":
      return {
        label: "Verified",
        bg: "bg-accent-soft",
        text: "text-accent-text",
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
