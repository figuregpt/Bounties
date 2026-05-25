"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  ExternalLink,
  Eye,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCompact,
  formatHandle,
  formatRelativeTime,
  formatTimeRemaining,
  formatTimeRemainingFrom,
  formatTokenAmount,
  formatTokenPrice,
  formatUsd,
} from "@/lib/format";
import { ActionChecklist } from "@/components/bounties/action-checklist";
import { CTAButton } from "@/components/bounties/cta-button";
import { EligibilityBanner } from "@/components/bounties/eligibility-banner";
import { HunterList } from "@/components/bounties/hunter-list";
import { HuntOverlay } from "@/components/bounties/hunt-overlay";
import { ReplyRulesDisplay } from "@/components/bounties/reply-rules-display";
import { ReplyTester } from "@/components/bounties/reply-tester";
import { ShareMenu } from "@/components/bounties/share-menu";
import { SafeTokenAvatar } from "@/components/bounties/token-avatar";
import { TweetEmbed } from "@/components/bounties/tweet-embed";
import { useHunt } from "@/hooks/useHunt";
import { useClaimRealtime } from "@/hooks/useClaimRealtime";
import { useHolderCheck } from "@/hooks/useHolderCheck";
import { useNow } from "@/hooks/useNow";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import type {
  EligibilityRequirement,
  EligibilityResult,
} from "@/lib/bounties/eligibility";
import type {
  BountyUIState,
  CtaConfig,
} from "@/lib/bounties/state";
import type {
  Bounty,
  Claim,
} from "@/types/database";
import type { HunterRow } from "@/lib/db/queries/claims";
import type { TokenInfo } from "@/lib/db/queries/tokens";

const ENTRY_SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;

type Props = {
  bounty: Bounty & {
    creator: {
      id: string;
      handle: string;
      displayName: string | null;
      avatarUrl: string | null;
      isCreatorVerified: boolean;
      bio: string | null;
    };
    /** Phase 8.5+: computed in the bounty query. Shadows the row column
     *  of the same name. */
    currentHuntersCount: number;
    inProgressCount: number;
    /** Lottery-only: historical joined count including not-picked
     *  losers, so a 152-entrant completed lottery doesn't read as
     *  "8 joined" after the random draw demotes losers to `failed`. */
    lotteryJoinedCount: number;
  };
  claim: Claim | null;
  eligibility: EligibilityResult;
  uiState: BountyUIState;
  hunters: HunterRow[];
  userId: string | null;
  tokenInfo: TokenInfo | null;
};

export function BountyDetailClient({
  bounty,
  claim,
  eligibility,
  uiState,
  hunters,
  userId,
  tokenInfo,
}: Props) {
  const router = useRouter();
  const {
    address: connectedWallet,
    isConnected,
    openConnectModal,
  } = useWalletConnection();
  const [huntersOpen, setHuntersOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [huntOpen, setHuntOpen] = useState(false);
  const [claimingReward, setClaimingReward] = useState(false);

  const hunt = useHunt({
    bountyId: bounty.id,
    userId,
    initialClaim: claim,
  });

  // Wallet holdings gate. The server emits a deferred `holder_token`
  // row in eligibility; this hook upgrades it to met/unmet/needs_wallet
  // once we know which wallet the hunter has connected.
  const holderReq = bounty.eligibilityFilters?.holderRequirement ?? null;
  const holderCheck = useHolderCheck({
    requirement: holderReq,
    wallet: connectedWallet,
  });
  const effectiveEligibility = useMemo(
    () => buildEffectiveEligibility(eligibility, holderReq, holderCheck),
    [eligibility, holderReq, holderCheck],
  );

  // Subscribe to the bounty's broadcast channel so any slot / counter
  // change (this hunter failing, somebody else verifying, the cron
  // finalizing the bounty) repaints the page without a full reload.
  // The fetch is a router.refresh — Next re-renders this page server
  // component, getActiveBounties + getTokenInfo re-run, fresh data flows.
  useClaimRealtime(
    `bounty-${bounty.id}`,
    useCallback(() => {
      router.refresh();
    }, [router]),
  );

  const bountyUrl =
    typeof window === "undefined" ? "" : window.location.href;

  const handleClaimReward = async () => {
    const effectiveClaim = hunt.claim ?? claim;
    if (!effectiveClaim) return;
    // Reward lands in whatever wallet the hunter has connected RIGHT
    // NOW — the server takes `walletAddress` from the request body,
    // no sticky DB binding needed.
    if (!isConnected || !connectedWallet) {
      setActionMessage(
        "Connect a wallet (Phantom or Solflare) — that's where your reward will land.",
      );
      openConnectModal();
      return;
    }
    setClaimingReward(true);
    setActionMessage("Sending reward to your wallet…");
    try {
      const res = await fetch(
        `/api/claims/${effectiveClaim.id}/claim-reward`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: connectedWallet }),
        },
      );
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        tx?: { signature: string; mock: boolean };
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const sig = body.tx?.signature;
      setActionMessage(
        body.tx?.mock
          ? `Reward sent (mock tx ${sig?.slice(0, 12)}…). Real on-chain tx lands once ENABLE_REAL_TX=true.`
          : `Reward sent — tx ${sig?.slice(0, 12)}…`,
      );
      router.refresh();
    } catch (err) {
      setActionMessage(
        err instanceof Error
          ? `Claim failed: ${err.message}`
          : String(err),
      );
    } finally {
      setClaimingReward(false);
    }
  };

  const handlePrimary = async (cta: CtaConfig) => {
    // Anon visitor — bounce to /login carrying the current URL as
    // callbackUrl so they land back on the bounty after sign-in.
    if (!userId && cta.action !== "view_tweet") {
      const callbackUrl =
        typeof window === "undefined" ? `/bounties/${bounty.slug}` : window.location.pathname;
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    switch (cta.action) {
      case "start_hunt":
      case "complete_actions":
      case "retry_claim":
        setActionMessage(null);
        setHuntOpen(true);
        break;

      case "claim_reward":
        await handleClaimReward();
        break;

      case "view_tweet":
        window.open(bounty.tweetUrl, "_blank", "noreferrer");
        break;

      case "view_analytics":
        // Bounty detail page already IS the analytics view for the
        // creator — slot fill, hunters list, metadata. Open the
        // hunters section and scroll it into view so they land on
        // the data, not on the now-redundant CTA pair.
        setHuntersOpen(true);
        requestAnimationFrame(() => {
          document
            .querySelector("[data-hunters-section]")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        break;

      default:
        setActionMessage(`'${cta.action}' wiring lands in a later phase.`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={ENTRY_SPRING}
      className="space-y-6"
    >
      {/* ─── Back + share ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/discover"
          className="press inline-flex items-center gap-1.5 text-small text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2.25} />
          Back to discover
        </Link>
        <ShareMenu
          bountyUrl={bountyUrl}
          creatorHandle={bounty.creator.handle}
          rewardAmount={bounty.rewardPerHunter}
          rewardSymbol={bounty.rewardTokenSymbol}
        />
      </div>

      {/* ─── Two-column grid ─────────────────────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-8">
          <Hero bounty={bounty} tokenInfo={tokenInfo} />

          {/* Eligibility lives right under the hero so hunters see the
              gate (followers, account age, wallet holdings) before they
              scroll through the tweet — surprising them with "you need
              to hold X token" inside the Hunt overlay was bad UX. */}
          <Section
            title="Who can hunt this?"
            caption={
              effectiveEligibility.requirements.length === 0
                ? "No filters — anyone with an X account can hunt this bounty."
                : undefined
            }
          >
            {effectiveEligibility.requirements.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-dashed border-border-default px-4 py-3 text-small text-text-tertiary">
                Open to everyone.
              </p>
            ) : (
              <div className="space-y-3">
                <EligibilityBanner
                  eligibility={effectiveEligibility}
                  variant="detail"
                />
                {holderReq && (
                  <HolderActionRow
                    requirement={holderReq}
                    state={holderCheck}
                    isConnected={isConnected}
                    openConnectModal={openConnectModal}
                  />
                )}
              </div>
            )}
          </Section>

          <Section
            title="The tweet"
            caption={
              <Link
                href={bounty.tweetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent-text hover:text-accent-hover"
              >
                View on Twitter
                <ExternalLink className="size-3" strokeWidth={2} />
              </Link>
            }
          >
            <TweetEmbed tweet={bounty.tweetCachedData} variant="full" />
          </Section>

          <Section
            title="What you need to do"
            caption="Complete every step on X. We re-verify automatically."
          >
            <ActionChecklist
              actionConfig={bounty.actionConfig}
              claim={claim}
              hideReplyInline
            />
          </Section>

          {bounty.requiresReply && (
            <Section
              title="Reply requirements"
              caption="We check each rule with the same logic that runs on the server."
            >
              <div className="space-y-4">
                <ReplyRulesDisplay rules={bounty.actionConfig.reply.rules} />
                <ReplyTester rules={bounty.actionConfig.reply.rules} />
              </div>
            </Section>
          )}

          <HunterSection
            count={hunters.length}
            open={huntersOpen}
            onToggle={() => setHuntersOpen((v) => !v)}
            hunters={hunters}
            tokenLogoUrl={tokenInfo?.logoUrl ?? null}
          />

          <MetadataSection bounty={bounty} />
        </main>

        {/* ─── Sticky action panel ──────────────────────────────────── */}
        <ActionPanel
          bounty={bounty}
          claim={hunt.claim ?? claim}
          uiState={uiState}
          eligibility={effectiveEligibility}
          actionMessage={actionMessage}
          onPrimary={handlePrimary}
          claimingReward={claimingReward}
        />
      </div>

      <HuntOverlay
        open={huntOpen}
        onOpenChange={(next) => {
          setHuntOpen(next);
          if (!next) router.refresh();
        }}
        bounty={bounty}
        hunt={hunt}
        connectedWallet={connectedWallet}
      />
    </motion.div>
  );
}

/* =========================================================================
   Hero — token avatar + title + creator line
   ========================================================================= */

function Hero({
  bounty,
  tokenInfo,
}: {
  bounty: Props["bounty"];
  tokenInfo: TokenInfo | null;
}) {
  return (
    <header className="space-y-4">
      <div className="flex items-start gap-4">
        <motion.div layoutId={`bounty-avatar-${bounty.id}`}>
          <SafeTokenAvatar
            logoUrl={tokenInfo?.logoUrl}
            symbol={bounty.rewardTokenSymbol}
            size={64}
            isAdminVerified={tokenInfo?.isAdminVerified}
          />
        </motion.div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[32px] font-medium leading-tight tracking-tight text-text-primary">
            {bounty.rewardTokenSymbol} bounty
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-small text-text-secondary">
            <span>
              by{" "}
              <Link
                href={`/profile/${bounty.creator.handle}`}
                className="text-text-primary hover:text-accent-text"
              >
                {bounty.creator.displayName ??
                  formatHandle(bounty.creator.handle)}
              </Link>
              {bounty.creator.isCreatorVerified && (
                <span className="ml-1 text-accent-text">· verified creator</span>
              )}
            </span>
            <span className="text-text-quaternary">·</span>
            <span>{formatRelativeTime(bounty.createdAt)}</span>
            {tokenInfo?.dexScreenerUrl && (
              <>
                <span className="text-text-quaternary">·</span>
                <a
                  href={tokenInfo.dexScreenerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-text-tertiary hover:text-accent-text"
                >
                  DexScreener
                  <ExternalLink className="size-3" strokeWidth={2} />
                </a>
              </>
            )}
          </p>
          {tokenInfo?.priceUsd != null && (
            <p className="mt-0.5 text-caption text-text-tertiary">
              1 {bounty.rewardTokenSymbol} ≈ {formatTokenPrice(tokenInfo.priceUsd)}
            </p>
          )}
        </div>
        <div className="hidden flex-col items-end gap-1.5 sm:flex">
          <StatusPill bounty={bounty} />
          <span className="inline-flex items-center gap-1 text-caption text-text-tertiary">
            <Clock className="size-3" strokeWidth={2} />
            {formatTimeRemaining(bounty.endsAt)}
          </span>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ bounty }: { bounty: Bounty }) {
  if (bounty.status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-success-soft px-2.5 py-1 text-caption uppercase text-success">
        <span className="size-1.5 rounded-full bg-success" />
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-bg-elevated px-2.5 py-1 text-caption uppercase text-text-secondary">
      {bounty.status}
    </span>
  );
}

/* =========================================================================
   Hunter section
   ========================================================================= */

function HunterSection({
  count,
  open,
  onToggle,
  hunters,
  tokenLogoUrl,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  hunters: HunterRow[];
  tokenLogoUrl: string | null;
}) {
  return (
    <section className="space-y-4" data-hunters-section>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-h2">Recent hunters · {count}</h2>
          <p className="text-small text-text-secondary">
            People who&rsquo;ve claimed against this bounty.
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-text-tertiary transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <HunterList
          hunters={hunters}
          emptyHint="Be the first hunter on this bounty."
          tokenLogoUrl={tokenLogoUrl}
        />
      )}
    </section>
  );
}

/* =========================================================================
   Metadata grid (footer)
   ========================================================================= */

function MetadataSection({ bounty }: { bounty: Props["bounty"] }) {
  const [copied, setCopied] = useState(false);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(bounty.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard denied */
    }
  };

  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-border-subtle bg-bg-surface p-4">
      <h3 className="text-caption uppercase tracking-wider text-text-tertiary">
        Bounty metadata
      </h3>
      <dl className="grid gap-x-6 gap-y-2 text-small md:grid-cols-2">
        <Meta label="Distribution model" value={bounty.distributionModel} />
        <Meta
          label="Created"
          value={
            bounty.createdAt instanceof Date
              ? bounty.createdAt.toLocaleDateString()
              : new Date(bounty.createdAt).toLocaleDateString()
          }
        />
        <Meta
          label="Total payout"
          value={`${formatTokenAmount(bounty.totalPool)} ${bounty.rewardTokenSymbol}`}
        />
        <Meta
          label="Platform fee"
          value={`${(bounty.platformFeeBps / 100).toFixed(1)}%`}
        />
        <Meta
          label="Bounty slug"
          value={
            <button
              type="button"
              onClick={copyId}
              className="press inline-flex items-center gap-1 font-mono text-small text-text-primary hover:text-accent-text"
              data-numeric
            >
              {bounty.slug}
              <span className="text-caption text-text-tertiary">
                {copied ? "· copied" : "· copy id"}
              </span>
            </button>
          }
        />
        <Meta
          label="Views"
          value={
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5 text-text-tertiary" strokeWidth={2} />
              {formatCompact(bounty.viewCount)}
            </span>
          }
        />
      </dl>
    </section>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </dt>
      <dd className="truncate text-small text-text-primary">{value}</dd>
    </div>
  );
}

/* =========================================================================
   Action panel (right column, sticky)
   ========================================================================= */

function ActionPanel({
  bounty,
  claim,
  uiState,
  eligibility,
  actionMessage,
  onPrimary,
  claimingReward,
}: {
  bounty: Props["bounty"];
  claim: Claim | null;
  uiState: BountyUIState;
  eligibility: EligibilityResult;
  actionMessage: string | null;
  onPrimary: (cta: CtaConfig) => void;
  claimingReward: boolean;
}) {
  // Phase 8.5+: `currentHuntersCount` is now the live verified+ count
  // (computed in the bounty queries). `inProgressCount` is the
  // mid-flow tally. Progress bar follows verified-or-better only — we
  // don't want hunters who just clicked "Hunt now" to visually fill
  // the bar.
  const verified = bounty.currentHuntersCount;
  const inProgress = bounty.inProgressCount;
  // Lottery bounties accept any number of participants; the progress
  // bar / "X of Y claimed" framing is misleading there — maxHunters
  // is the number of WINNERS drawn at endsAt, not a slot cap.
  const isLottery = bounty.distributionModel === "pool_lottery";
  const progress = useMemo(() => {
    if (isLottery || bounty.maxHunters === 0) return 0;
    return Math.min(100, Math.round((verified / bounty.maxHunters) * 100));
  }, [isLottery, verified, bounty.maxHunters]);

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="space-y-4 rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-6">
        <div>
          <p className="text-caption uppercase tracking-wider text-text-tertiary">
            {uiState.title}
          </p>
          <p className="mt-1 text-small text-text-secondary">
            {uiState.message}
          </p>
        </div>

        <RewardBlock bounty={bounty} dimmed={!uiState.canHunt && !uiState.canClaim && uiState.kind !== "claimed"} />

        <div className="space-y-1.5">
          {/* Progress bar only makes sense for capped distributions —
              lottery bounties accept unlimited participants and just
              draw N winners at endsAt, so the bar would always look
              empty or be capped artificially. */}
          {!isLottery && (
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated">
              <div
                className="h-full rounded-full bg-accent-primary"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <p
            className="flex items-center justify-between text-caption text-text-tertiary tabular-nums"
            data-numeric
          >
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" strokeWidth={2} />
              {isLottery ? (
                <>
                  {bounty.lotteryJoinedCount} joined ·{" "}
                  {bounty.maxHunters} winners
                </>
              ) : (
                <>
                  {verified} of {bounty.maxHunters} claimed
                </>
              )}
              {inProgress > 0 && (
                <span className="ml-1 text-text-quaternary">
                  · {inProgress} hunting
                </span>
              )}
            </span>
            <span>~2 min to complete</span>
          </p>
        </div>

        {!uiState.canHunt && eligibility.requirements.length > 0 && (
          <EligibilityBanner eligibility={eligibility} variant="detail" />
        )}

        {claim && uiState.kind !== "not_started" && (
          <ClaimChecklistInline bounty={bounty} claim={claim} />
        )}

        <div className="space-y-2">
          {uiState.primaryCta && (
            <PrimaryClaimCta
              cta={uiState.primaryCta}
              claimingReward={claimingReward}
              onPrimary={onPrimary}
            />
          )}
          {uiState.secondaryCta && (
            <CTAButton
              config={uiState.secondaryCta}
              fullWidth
              onClick={() => onPrimary(uiState.secondaryCta!)}
            />
          )}
          {!uiState.primaryCta && !uiState.secondaryCta && (
            <p className="text-caption text-text-tertiary">
              Nothing to do — this bounty is closed.
            </p>
          )}
        </div>

        {uiState.kind === "awaiting_final" && claim?.finalCheckScheduledAt && (
          <FinalCheckCountdown target={claim.finalCheckScheduledAt} />
        )}

        {uiState.kind === "not_started" && (
          <p className="text-caption text-text-tertiary">
            Claim window opens 24h after we verify your actions.
          </p>
        )}

        {actionMessage && (
          <div className="rounded-[10px] border border-border-subtle bg-bg-elevated px-3 py-2 text-caption text-text-secondary">
            {actionMessage}
          </div>
        )}
      </div>
    </aside>
  );
}

function RewardBlock({
  bounty,
  dimmed,
}: {
  bounty: Bounty;
  dimmed: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] bg-bg-base p-4",
        dimmed && "opacity-60",
      )}
    >
      <p className="text-caption uppercase tracking-wider text-text-tertiary">
        You earn
      </p>
      <p
        className="mt-1 flex items-baseline gap-2 font-mono text-[28px] font-medium leading-none text-accent-text tabular-nums"
        data-numeric
      >
        <span>{formatTokenAmount(bounty.rewardPerHunter)}</span>
        <span className="text-body text-text-secondary">
          {bounty.rewardTokenSymbol}
        </span>
      </p>
      {bounty.rewardPerHunterUsd && (
        <p className="mt-1 font-mono text-caption text-text-tertiary tabular-nums" data-numeric>
          ≈ {formatTokenPrice(bounty.rewardPerHunterUsd)} · pool{" "}
          {formatTokenPrice(bounty.totalPoolUsd ?? 0)}
        </p>
      )}
    </div>
  );
}

function ClaimChecklistInline({
  bounty,
  claim,
}: {
  bounty: Props["bounty"];
  claim: Claim;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border-subtle bg-bg-base p-3">
      <p className="mb-2 text-caption uppercase tracking-wider text-text-tertiary">
        Your actions
      </p>
      <ActionChecklist
        actionConfig={bounty.actionConfig}
        claim={claim}
        hideReplyInline
      />
    </div>
  );
}

/* =========================================================================
   Section helper
   ========================================================================= */

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-h2">{title}</h2>
          {typeof caption === "string" && (
            <p className="mt-1 text-small text-text-secondary">{caption}</p>
          )}
        </div>
        {typeof caption !== "string" && caption}
      </div>
      {children}
    </section>
  );
}

/* =========================================================================
   FinalCheckCountdown — live timer to bounty.endsAt, which is when the
   cron picks up the bounty and runs the final verification pass. Ticks
   once a minute (sufficient for any bounty duration).
   ========================================================================= */

/**
 * Wraps the primary CTA so that a `claim_reward` action surfaces a
 * dedicated "Connect wallet" affordance when the hunter hasn't
 * connected. The wallet adapter sits next to the wallet-adapter
 * provider mounted at root, so reading state here is free.
 */
function PrimaryClaimCta({
  cta,
  claimingReward,
  onPrimary,
}: {
  cta: CtaConfig;
  claimingReward: boolean;
  onPrimary: (cta: CtaConfig) => void;
}) {
  const { isConnected, openConnectModal } = useWalletConnection();
  const needsWallet = cta.action === "claim_reward" && !isConnected;

  if (needsWallet) {
    return (
      <button
        type="button"
        onClick={openConnectModal}
        className="press inline-flex h-14 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border border-accent-primary bg-accent-soft px-6 font-medium text-accent-text hover:bg-accent-soft/80"
      >
        <Wallet className="size-4" strokeWidth={2.25} />
        Connect wallet to claim
      </button>
    );
  }
  return (
    <CTAButton
      config={cta}
      fullWidth
      size="lg"
      disabled={claimingReward && cta.action === "claim_reward"}
      onClick={() => onPrimary(cta)}
    />
  );
}

/* =========================================================================
   Holder-check eligibility helpers
   ========================================================================= */

type HolderReq = NonNullable<
  Props["bounty"]["eligibilityFilters"]["holderRequirement"]
>;
type HolderState = ReturnType<typeof useHolderCheck>;

const holderNumFmt = new Intl.NumberFormat("en-US");

function buildEffectiveEligibility(
  base: EligibilityResult,
  requirement: HolderReq | null,
  check: HolderState,
): EligibilityResult {
  if (!requirement) return base;

  const requiredLabel = `Hold ${holderNumFmt.format(requirement.minAmount)}+ ${requirement.symbol}`;

  let row: EligibilityRequirement;
  switch (check.status) {
    case "needs_wallet":
      row = {
        key: "holder_token",
        label: "Wallet holdings",
        requiredLabel,
        actualLabel: "connect wallet to check",
        met: false,
        deferred: true,
      };
      break;
    case "checking":
      row = {
        key: "holder_token",
        label: "Wallet holdings",
        requiredLabel,
        actualLabel: "checking…",
        met: false,
        deferred: true,
      };
      break;
    case "met":
      row = {
        key: "holder_token",
        label: "Wallet holdings",
        requiredLabel,
        actualLabel: "balance OK",
        met: true,
      };
      break;
    case "unmet":
      row = {
        key: "holder_token",
        label: "Wallet holdings",
        requiredLabel,
        actualLabel: `wallet doesn't hold enough ${requirement.symbol}`,
        met: false,
      };
      break;
    case "error":
      row = {
        key: "holder_token",
        label: "Wallet holdings",
        requiredLabel,
        actualLabel: "couldn't check — we'll retry on hunt",
        met: true,
        deferred: true,
      };
      break;
    case "no_requirement":
    default:
      return base;
  }

  // Replace the server-emitted deferred placeholder, or append if the
  // server build is older than the client (defensive).
  const requirements = base.requirements.some((r) => r.key === "holder_token")
    ? base.requirements.map((r) => (r.key === "holder_token" ? row : r))
    : [...base.requirements, row];

  const unmet = requirements.filter((r) => !r.met);
  const eligible = unmet.length === 0;
  const summary = eligible
    ? ""
    : check.status === "needs_wallet"
      ? "Connect a wallet to verify eligibility"
      : check.status === "unmet"
        ? `You need ${holderNumFmt.format(requirement.minAmount)}+ ${requirement.symbol} in your wallet`
        : base.summary || "Missing requirements";

  return { eligible, requirements, summary };
}

function HolderActionRow({
  requirement,
  state,
  isConnected,
  openConnectModal,
}: {
  requirement: HolderReq;
  state: HolderState;
  isConnected: boolean;
  openConnectModal: () => void;
}) {
  if (state.status === "no_requirement") return null;
  if (state.status === "met") return null;

  if (state.status === "needs_wallet" || !isConnected) {
    return (
      <button
        type="button"
        onClick={openConnectModal}
        className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-accent-primary/30 bg-accent-soft px-4 text-small font-medium text-accent-text hover:bg-accent-soft/80"
      >
        <Wallet className="size-4" strokeWidth={2.25} />
        Connect wallet to verify holdings
      </button>
    );
  }

  if (state.status === "checking") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[10px] border border-border-subtle bg-bg-elevated px-4 py-2.5 text-caption text-text-tertiary">
        <span className="inline-block size-3 animate-pulse rounded-full bg-text-tertiary" />
        Checking your {requirement.symbol} balance…
      </div>
    );
  }

  if (state.status === "unmet") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-warning/30 bg-warning-soft px-4 py-2.5 text-small">
        <span className="text-warning">
          Your wallet doesn&rsquo;t hold {requirement.minAmount}{" "}
          {requirement.symbol}+. Top up or switch wallets.
        </span>
        <button
          type="button"
          onClick={openConnectModal}
          className="press inline-flex items-center gap-1.5 text-caption font-medium text-text-primary underline-offset-4 hover:underline"
        >
          <Wallet className="size-3.5" strokeWidth={2.25} />
          Switch wallet
        </button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p className="rounded-[10px] border border-border-subtle bg-bg-elevated px-4 py-2.5 text-caption text-text-tertiary">
        Couldn&rsquo;t check your {requirement.symbol} balance right now —
        we&rsquo;ll retry when you click Hunt.
      </p>
    );
  }

  return null;
}

function FinalCheckCountdown({ target }: { target: Date | string }) {
  const now = useNow(60_000);
  const remaining = formatTimeRemainingFrom(target, now);
  const isReady = remaining === "Ready";
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-border-subtle bg-bg-elevated px-3 py-2 text-caption">
      <span className="text-text-tertiary">
        {isReady ? "Final check running" : "Final check when bounty ends"}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          isReady ? "text-accent-text" : "text-text-primary",
        )}
        data-numeric
      >
        {remaining}
      </span>
    </div>
  );
}
