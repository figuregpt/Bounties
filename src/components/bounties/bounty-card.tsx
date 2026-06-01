"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Clock,
  MessageCircle,
  Quote,
  Repeat2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  formatHandle,
  formatTimeRemaining,
  formatTokenAmount,
  formatTokenPrice,
} from "@/lib/format";
import { CHAIN_LOGOS } from "@/lib/chains/logos";
import { chainLabel } from "@/lib/chains/evm/config";
import { TokenChip } from "./token-chip";
import { SafeTokenAvatar } from "./token-avatar";
import { TweetEmbed } from "./tweet-embed";
import { EligibilityBanner } from "./eligibility-banner";
import type { BountyFeedItem } from "@/lib/db/queries/bounties";

const HOVER_SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;

type Props = {
  bounty: BountyFeedItem;
  /** "feed" → full card. "compact" → no tweet embed (search results etc). */
  variant?: "feed" | "compact";
};

/**
 * The discover-feed workhorse. Every state the UI needs lives on the
 * `BountyFeedItem` returned by `getActiveBounties` — there are no
 * follow-up fetches.
 *
 * State precedence for the CTA (top → bottom wins):
 *   1. user already claimed reward → "Claimed"
 *   2. user has an in-flight claim → progress pill
 *   3. anon / signed-out → "Sign in to hunt"
 *   4. ineligible → "Not eligible"
 *   5. default → "Hunt now"
 */
export function BountyCard({ bounty, variant = "feed" }: Props) {
  const eligible = bounty.eligibility.eligible;
  const total = bounty.maxHunters;
  const isLottery = bounty.distributionModel === "pool_lottery";
  // Phase 8.5+: `currentHuntersCount` is the computed verified+ count.
  // It already includes claimed/finalized claims, so use it directly
  // for the progress bar — DON'T blend `inProgressCount` in or hunters
  // visually "fill" the bar before they've actually completed anything.
  const verified = bounty.currentHuntersCount;
  const inProgress = bounty.inProgressCount;
  // Lottery bounties don't have a fillable bar — anyone can join, the
  // pool of participants just grows until N winners are drawn at the
  // end. Show participants over winners but with a softer visual.
  const progressPct = isLottery
    ? 0
    : total > 0
      ? Math.min(100, Math.round((verified / total) * 100))
      : 0;
  const tokenSymbol = bounty.rewardTokenSymbol;
  const tokenName = (bounty.tweetCachedData?.authorName ?? "").trim();

  return (
    <motion.div
      whileHover={{ scale: 1.005 }}
      transition={HOVER_SPRING}
      className="press"
    >
      <Link
        href={`/bounties/${bounty.slug}`}
        className="block rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-5 transition-colors hover:border-border-hover"
      >
        {/* Header --------------------------------------------------- */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BountyTokenAvatar
              bountyId={bounty.id}
              symbol={tokenSymbol}
              category={bounty.rewardToken?.category ?? inferCategory(bounty)}
              logoUrl={bounty.rewardToken?.logoUrl ?? null}
              isAdminVerified={bounty.rewardToken?.isAdminVerified ?? false}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-body font-medium text-text-primary">
                  {tokenSymbol}
                </span>
                {tokenName && (
                  <span className="truncate text-body text-text-tertiary">
                    · {tokenName}
                  </span>
                )}
              </div>
              <p className="truncate text-caption text-text-tertiary">
                by{" "}
                <span className="text-text-secondary">
                  {formatHandle(bounty.creator.handle)}
                </span>
                {bounty.creator.isCreatorVerified && (
                  <span className="ml-1 inline-flex items-center gap-0.5 text-accent-text">
                    <Check className="size-3" strokeWidth={2.5} /> creator
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ChainBadge chain={bounty.chain} />
            {isLottery && (
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-text">
                Lottery
              </span>
            )}
            <StatusPill eligible={eligible} bounty={bounty} />
          </div>
        </div>

        {/* Tweet preview ------------------------------------------- */}
        {variant === "feed" && bounty.tweetCachedData && (
          <TweetEmbed
            tweet={bounty.tweetCachedData}
            authorAvatarUrl={null}
            className="mt-3"
          />
        )}

        {/* Required actions ---------------------------------------- */}
        <ActionRow bounty={bounty} />

        {/* Eligibility banner -------------------------------------- */}
        {bounty.eligibility.requirements.length > 0 && (
          <EligibilityBanner
            eligibility={bounty.eligibility}
            className="mt-3"
          />
        )}

        {/* Progress + time left ------------------------------------ */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
              <div
                className="h-full rounded-full bg-accent-primary"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span
              className="font-mono text-caption text-text-tertiary tabular-nums"
              data-numeric
            >
              {isLottery ? (
                <>
                  {verified + inProgress}{" "}
                  <span className="text-text-quaternary">
                    joined · {total} winners
                  </span>
                </>
              ) : (
                <>
                  {verified}/{total}
                  {inProgress > 0 && (
                    <span className="ml-1.5 text-text-quaternary">
                      · {inProgress} hunting
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-caption text-text-tertiary">
            <Clock className="size-3" strokeWidth={2} />
            {formatTimeRemaining(bounty.endsAt)}
          </span>
        </div>

        {/* Footer -------------------------------------------------- */}
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div
              className="flex items-baseline gap-1.5 font-mono text-[20px] tabular-nums text-accent-text"
              data-numeric
            >
              <span>{formatTokenAmount(bounty.rewardPerHunter)}</span>
              <span className="text-small text-text-secondary">
                {tokenSymbol}
              </span>
            </div>
            <p
              className="font-mono text-caption text-text-tertiary tabular-nums"
              data-numeric
            >
              pool · {formatTokenAmount(bounty.totalPool)} {tokenSymbol}
              {bounty.totalPoolUsd && (
                <> · {formatTokenPrice(bounty.totalPoolUsd)}</>
              )}
            </p>
          </div>
          <CtaButton bounty={bounty} eligible={eligible} />
        </div>
      </Link>
    </motion.div>
  );
}

/* =========================================================================
   Sub-components
   ========================================================================= */

/** Which chain the bounty settles on — logo only, shown on every card so
 *  the feed makes the network obvious at a glance. */
function ChainBadge({ chain }: { chain: string }) {
  const label = chainLabel(chain);
  const logo = CHAIN_LOGOS[chain] ?? CHAIN_LOGOS.solana;
  return (
    <span
      className="grid size-6 place-items-center rounded-full bg-bg-elevated"
      title={`Settles on ${label}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt={label}
        className="size-4 rounded-full object-contain"
      />
    </span>
  );
}

function BountyTokenAvatar({
  symbol,
  category,
  logoUrl,
  isAdminVerified,
  bountyId,
}: {
  symbol: string;
  category?: string | null;
  logoUrl: string | null;
  isAdminVerified: boolean;
  bountyId: string;
}) {
  // layoutId shared with the detail page hero — framer-motion morphs
  // the avatar between the two on navigation when both are mounted.
  return (
    <motion.div layoutId={`bounty-avatar-${bountyId}`}>
      <SafeTokenAvatar
        logoUrl={logoUrl}
        symbol={symbol}
        category={category}
        size={36}
        isAdminVerified={isAdminVerified}
      />
    </motion.div>
  );
}

function StatusPill({
  eligible,
  bounty,
}: {
  eligible: boolean;
  bounty: BountyFeedItem;
}) {
  if (bounty.claimedByCurrentUser) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-bg-elevated px-2.5 py-1 text-caption uppercase text-text-secondary">
        <Check className="size-3" strokeWidth={2.25} />
        Hunting
      </span>
    );
  }
  return eligible ? (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-success-soft px-2.5 py-1 text-caption uppercase text-success">
      <span className="size-1.5 rounded-full bg-success" />
      Live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-bg-elevated px-2.5 py-1 text-caption uppercase text-text-tertiary">
      Not eligible
    </span>
  );
}

function ActionRow({ bounty }: { bounty: BountyFeedItem }) {
  const items: {
    icon: LucideIcon;
    label: string;
    enabled: boolean;
  }[] = [
    {
      icon: MessageCircle,
      label: replyLabel(bounty),
      enabled: bounty.requiresReply,
    },
    { icon: Repeat2, label: "RT", enabled: bounty.requiresRetweet },
    {
      icon: UserPlus,
      label: bounty.followTargetHandle
        ? `Follow @${bounty.followTargetHandle}`
        : "Follow",
      enabled: bounty.requiresFollow,
    },
    { icon: Quote, label: "Quote", enabled: bounty.requiresQuote },
  ];
  const present = items.filter((i) => i.enabled);
  if (present.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {present.map((i) => (
        <span
          key={i.label}
          className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-accent-soft px-2.5 py-1 text-caption font-medium text-accent-text"
        >
          <i.icon className="size-3" strokeWidth={2} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function replyLabel(bounty: BountyFeedItem): string {
  const required = bounty.replyKeywordsRequired?.length ?? 0;
  const pool = bounty.replyKeywordsPool?.length ?? 0;
  if (required > 0) return `Reply · ${required} keyword${required > 1 ? "s" : ""}`;
  if (pool > 0) return `Reply · pool of ${pool}`;
  return "Reply";
}

function CtaButton({
  bounty,
  eligible,
}: {
  bounty: BountyFeedItem;
  eligible: boolean;
}) {
  if (bounty.claimedByCurrentUser) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-button)] border border-border-default px-3 text-small text-text-secondary">
        <Users className="size-3.5" strokeWidth={2} />
        Hunting in progress
      </span>
    );
  }
  if (!eligible) {
    return (
      <span className="inline-flex h-9 items-center rounded-[var(--radius-button)] border border-border-default px-3 text-small text-text-tertiary">
        Not eligible
      </span>
    );
  }
  return (
    <span className="press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-button)] bg-accent-primary px-3 text-small font-medium text-[#0E0E10] transition-colors hover:bg-accent-hover">
      Hunt now
      <ArrowRight className="size-3.5" strokeWidth={2.25} />
    </span>
  );
}

function inferCategory(bounty: BountyFeedItem): string | null {
  // Map bounty.category → token category for the avatar palette fallback.
  if (bounty.category === "memecoin_launch") return "memecoin";
  if (bounty.category === "brand_marketing") return "stablecoin";
  return null;
}
