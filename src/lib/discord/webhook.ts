import "server-only";

/**
 * Discord webhook helper for new-bounty announcements.
 *
 * Posts a rich embed to the channel configured by
 * DISCORD_BOUNTY_WEBHOOK_URL whenever a draft is launched. The whole
 * thing is fire-and-forget — the launch route awaits nothing and a
 * webhook outage must not block bounty activation.
 *
 * We deliberately avoid the discord.js client here: a single POST is
 * cheaper, has zero deps, and avoids carrying a bot user (presence,
 * gateway, intents) we don't need.
 */

import { formatTokenAmount } from "@/lib/format";
import type { EligibilityFilters } from "@/lib/db/schema/bounties";

export type BountyAnnouncementInput = {
  slug: string;
  rewardTokenSymbol: string;
  rewardPerHunter: string | number;
  rewardPerHunterUsd?: string | number | null;
  totalPool: string | number;
  totalPoolUsd?: string | number | null;
  maxHunters: number;
  distributionModel: string;
  endsAt: Date | string;
  tweetUrl: string;
  tweetAuthorHandle: string | null;
  tweetText?: string | null;
  eligibilityFilters: EligibilityFilters;
  creator: {
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  /** Logo for the reward token, surfaced in the embed thumbnail if
   *  we have one. The launch route can pass through whatever the
   *  enrichment cache returned. */
  tokenLogoUrl?: string | null;
};

const FALLBACK_APP_URL = "https://bounties.fm";
// Solana embed accent (left border) + emoji.
const EMBED_EMOJI = "🟢";
const EMBED_COLOR = 0x14f195;

export async function announceBountyLaunched(
  input: BountyAnnouncementInput,
): Promise<void> {
  const url = process.env.DISCORD_BOUNTY_WEBHOOK_URL;
  if (!url) return;

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? FALLBACK_APP_URL
  ).replace(/\/$/, "");
  const bountyUrl = `${appUrl}/bounties/${input.slug}`;
  const endsAt =
    input.endsAt instanceof Date ? input.endsAt : new Date(input.endsAt);
  // Discord renders <t:UNIX:R> as live relative time ("in 2 days").
  const endsAtUnix = Math.floor(endsAt.getTime() / 1000);

  const reward = `${formatTokenAmount(input.rewardPerHunter)} ${input.rewardTokenSymbol}`;
  const rewardUsd =
    input.rewardPerHunterUsd != null
      ? ` (~$${Number(input.rewardPerHunterUsd).toFixed(2)})`
      : "";
  const pool = `${formatTokenAmount(input.totalPool)} ${input.rewardTokenSymbol}`;
  const poolUsd =
    input.totalPoolUsd != null
      ? ` (~$${Number(input.totalPoolUsd).toFixed(2)})`
      : "";

  const requirementLines = formatRequirements(input.eligibilityFilters);
  const creatorName =
    input.creator.displayName ??
    (input.creator.handle ? `@${input.creator.handle}` : "Anonymous");

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "Network",
      value: `${EMBED_EMOJI} Solana`,
      inline: true,
    },
    {
      name: "Reward per hunter",
      value: `${reward}${rewardUsd}`,
      inline: true,
    },
    {
      name: "Total pool",
      value: `${pool}${poolUsd}`,
      inline: true,
    },
    {
      name: "Slots",
      value:
        input.distributionModel === "pool_lottery"
          ? `${input.maxHunters} winners drawn at random`
          : `${input.maxHunters} hunters`,
      inline: true,
    },
    {
      name: "Ends",
      value: `<t:${endsAtUnix}:R> (<t:${endsAtUnix}:f>)`,
      inline: false,
    },
  ];

  if (requirementLines.length > 0) {
    fields.push({
      name: "Requirements",
      value: requirementLines.map((l) => `• ${l}`).join("\n"),
      inline: false,
    });
  }

  fields.push({
    name: "Links",
    value: [
      `[Open bounty](${bountyUrl})`,
      `[View tweet](${input.tweetUrl})`,
    ].join(" · "),
    inline: false,
  });

  const tweetPreview = (input.tweetText ?? "").trim();
  const description =
    tweetPreview.length > 0
      ? truncate(tweetPreview, 280)
      : "A new bounty is live. Complete the actions on X to earn the reward.";

  const embed: Record<string, unknown> = {
    title: `${EMBED_EMOJI} ${input.rewardTokenSymbol} bounty just went live on Solana`,
    url: bountyUrl,
    description,
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
    author: {
      name: `by ${creatorName}${
        input.creator.handle ? ` (@${input.creator.handle})` : ""
      }`,
      ...(input.creator.avatarUrl ? { icon_url: input.creator.avatarUrl } : {}),
      ...(input.creator.handle
        ? { url: `${appUrl}/profile/${input.creator.handle}` }
        : {}),
    },
    fields,
    footer: { text: "bounties.fm" },
    ...(input.tokenLogoUrl ? { thumbnail: { url: input.tokenLogoUrl } } : {}),
  };

  // Optional role ping. Discord renders <@&ROLE_ID> as a clickable
  // role mention; we have to allow-list the role id explicitly via
  // allowed_mentions so other random IDs in the content can't be
  // weaponized into @everyone-style noise.
  const roleId = process.env.DISCORD_BOUNTY_PING_ROLE_ID?.trim();
  const rolePrefix = roleId ? `<@&${roleId}> ` : "";

  const body = JSON.stringify({
    content: `${rolePrefix}New Solana bounty — **${reward}**${rewardUsd} for ${input.maxHunters} hunters`,
    embeds: [embed],
    allowed_mentions: roleId
      ? { parse: [], roles: [roleId] }
      : { parse: [] },
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[discord] webhook returned ${res.status}: ${text.slice(0, 200)}`,
      );
    }
  } catch (err) {
    console.warn(
      "[discord] webhook post failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

function formatRequirements(f: EligibilityFilters | null | undefined): string[] {
  if (!f) return [];
  const out: string[] = [];
  if (f.minFollowers && f.minFollowers > 0) {
    out.push(`${f.minFollowers.toLocaleString("en-US")}+ followers on X`);
  }
  if (f.requireVerified) {
    out.push("Verified X account");
  }
  if (f.minAccountAgeMonths && f.minAccountAgeMonths > 0) {
    out.push(`${f.minAccountAgeMonths}+ months on X`);
  }
  if (f.minPreviousBounties && f.minPreviousBounties > 0) {
    out.push(`${f.minPreviousBounties}+ completed bounties`);
  }
  if (f.minReputationScore != null && Number(f.minReputationScore) > 0) {
    out.push(`${Number(f.minReputationScore).toFixed(0)}+ reputation`);
  }
  if (f.requireReputationTier) {
    out.push(`${f.requireReputationTier} tier`);
  }
  if (f.smartFollowers && f.smartFollowers.minimum > 0) {
    out.push(
      `${f.smartFollowers.minimum}+ smart-account followers`,
    );
  }
  if (f.holderRequirement && f.holderRequirement.minAmount > 0) {
    out.push(
      `Hold ${f.holderRequirement.minAmount.toLocaleString("en-US")}+ ${f.holderRequirement.symbol} in your wallet`,
    );
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}
