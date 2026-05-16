import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TokenChip } from "@/components/bounties/token-chip";
import { formatHandle, formatRelativeTime } from "@/lib/format";
import type { LiveActivityRow } from "@/lib/db/queries/activities";

/**
 * Row in the live activity feed. Each row links into the bounty detail
 * if one is associated (e.g. a "claim verified" event references a
 * bounty); otherwise the avatar still routes to the actor's profile.
 */
export function ActivityRow({ row }: { row: LiveActivityRow }) {
  const verb = verbFor(row.type);
  const initial = (row.actor.displayName ?? row.actor.handle)
    .charAt(0)
    .toUpperCase();

  const content = (
    <div className="flex items-start gap-2.5 rounded-[10px] px-2 py-2 transition-colors hover:bg-bg-elevated">
      <Avatar className="size-[22px] shrink-0">
        <AvatarImage src={row.actor.avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="bg-accent-soft text-[10px] uppercase text-accent-text">
          {initial}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-caption text-text-primary">
          <span className="font-medium">
            {formatHandle(row.actor.handle)}
          </span>{" "}
          <span className="text-text-secondary">{verb}</span>
        </p>
        <p className="truncate text-caption text-text-tertiary">
          {row.bounty?.tweetText
            ? row.bounty.tweetText.slice(0, 38) +
              (row.bounty.tweetText.length > 38 ? "…" : "")
            : "—"}{" "}
          · {formatRelativeTime(row.createdAt)}
        </p>
      </div>
      {row.bounty && (
        <TokenChip
          size="sm"
          symbol={row.bounty.rewardTokenSymbol}
          amount={row.bounty.rewardPerHunter}
          logoUrl={row.bounty.rewardTokenLogoUrl}
        />
      )}
    </div>
  );

  if (row.bounty) {
    return (
      <Link href={`/bounties/${row.bounty.slug}`} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function verbFor(type: LiveActivityRow["type"]): string {
  switch (type) {
    case "bounty_created":
      return "posted a bounty";
    case "bounty_completed":
      return "completed a bounty";
    case "bounty_claimed":
      return "claimed";
    case "claim_started":
      return "started hunting";
    case "claim_verified":
      return "verified a claim";
    case "claim_failed":
      return "failed a claim";
    case "level_up":
      return "leveled up";
    case "achievement":
      return "unlocked an achievement";
    case "follow":
      return "followed";
    case "referral_joined":
      return "joined via referral";
    default:
      return "moved";
  }
}
