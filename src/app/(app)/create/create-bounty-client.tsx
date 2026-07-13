"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Wallet } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { FormSection } from "@/components/ui/form-section";
import {
  sectionForPath,
  type ValidationIssue,
} from "@/lib/validation/field-labels";
import {
  TweetUrlInput,
  type TweetResolveResult,
} from "@/components/bounties/create/tweet-url-input";
import { ActionToggles } from "@/components/bounties/create/action-toggles";
import { TextActionRulesBuilder } from "@/components/bounties/text-action-rules-builder";
import { TextActionTester } from "@/components/bounties/text-action-tester";
import {
  RewardSection,
  type RewardMode,
  type TokenOption,
} from "@/components/bounties/create/reward-section";
import { EligibilityFiltersBuilder } from "@/components/bounties/create/eligibility-filters-builder";
import { HolderRequirementSection } from "@/components/bounties/create/holder-requirement-section";
import { DistributionPicker } from "@/components/bounties/create/distribution-picker";
import { DurationPicker } from "@/components/bounties/create/duration-picker";
import { LivePreviewCard } from "@/components/bounties/create/live-preview-card";
import {
  ConfirmLaunchModal,
  type ConfirmLaunchState,
} from "@/components/bounties/create/confirm-launch-modal";
import { formatUsd } from "@/lib/format";
import {
  BOUNTY_CREATION_FEE_USD,
  defaultCreateBountyValues,
  MIN_REWARD_PER_HUNTER_ANSEM,
  type CreateBountyInput,
  type DurationHours,
} from "@/lib/validation/bounty";
import { ANSEM_MINT } from "@/lib/tokens/ansem";
import {
  buildEscrowTransaction,
  toRawAmount,
  type EscrowMode,
} from "@/lib/solana/escrow";

/* ──────────────────────────────────────────────────────────────────────────
   Create-bounty client form — Solana + $ANSEM only.

   The reward token is fixed: on mount we enrich the ANSEM mint (live
   price + logo from our cache/DexScreener) and every amount in the form
   is denominated in ANSEM. The $1 creation fee is converted to ANSEM
   from the same price.

   Submit flow:
     1. POST /api/bounties → draft created, slug returned
     2. (devnet/mainnet only) build + sign + send SPL escrow tx
     3. POST /api/bounties/{slug}/launch with the tx signature →
        bounty activated, redirect to /bounties/{slug}
   ────────────────────────────────────────────────────────────────────────── */

type Props = {
  user: {
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
    /** Saved wallet from a prior session — may be null on a brand-new
     *  account that hasn't connected yet. The launch flow auto-saves
     *  whatever the user connects via the wallet-adapter modal. */
    walletAddress: string | null;
    twitterHandle: string;
  };
  escrowMode: EscrowMode;
  /** Treasury wallet that receives escrow transfers. Resolved on the
   *  server (env reads aren't reachable from the client bundle) and
   *  passed down. `null` only in `mock` mode where the env isn't
   *  required. */
  treasuryAddress: string | null;
  /** Revenue wallet for platform fees. When non-null, the launch tx
   *  becomes two transfers (pool → treasury, creation fee → revenue).
   *  Null means fees stay in the treasury (legacy mode). */
  revenueAddress: string | null;
};

export function CreateBountyClient({
  user,
  escrowMode,
  treasuryAddress,
  revenueAddress,
}: Props) {
  const router = useRouter();
  const {
    address: connectedWallet,
    isConnected,
    walletName,
    connection,
    sendTransaction,
    openConnectModal,
  } = useWalletConnection();
  const [form, setForm] = useState<CreateBountyInput>(() =>
    defaultCreateBountyValues(),
  );
  // The fixed ANSEM token, enriched on mount for live price/logo. The
  // launch button stays disabled until it resolves — the fee conversion
  // and USD previews need a price.
  const [token, setToken] = useState<TokenOption | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tweetResolved, setTweetResolved] =
    useState<TweetResolveResult | null>(null);
  const [rewardMode, setRewardMode] = useState<RewardMode>("per_hunter");

  const [modalOpen, setModalOpen] = useState(false);
  const [launchState, setLaunchState] =
    useState<ConfirmLaunchState>("idle");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchIssues, setLaunchIssues] = useState<ValidationIssue[] | null>(
    null,
  );

  /* ---- Patch helpers --------------------------------------------- */
  const patch = useCallback(
    (next: Partial<CreateBountyInput>) =>
      setForm((prev) => ({ ...prev, ...next })),
    [],
  );

  const loadAnsem = useCallback(async () => {
    setTokenLoading(true);
    setTokenError(null);
    try {
      const res = await fetch("/api/tokens/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress: ANSEM_MINT }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        token?: TokenOption;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.token) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setToken(body.token);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : String(err));
    } finally {
      setTokenLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial state already renders the loading card; defer the fetch a
    // tick so no setState fires synchronously inside the effect body.
    const id = window.setTimeout(() => void loadAnsem(), 0);
    return () => window.clearTimeout(id);
  }, [loadAnsem]);

  const onPerHunterChange = (next: number) => {
    patch({
      rewardPerHunter: next,
      rewardPerHunterUsd: token ? next * token.priceUsd : null,
    });
  };

  /* ---- Validation --------------------------------------------------- */
  const validation = useMemo(
    () => validateForm({ form, tweetResolved, token }),
    [form, tweetResolved, token],
  );
  const sectionErrors = useMemo(
    () => groupIssuesBySection(launchIssues ?? []),
    [launchIssues],
  );

  /* ---- Launch flow -------------------------------------------------- */
  const handleLaunch = async () => {
    if (!validation.ok) return;
    setLaunchState("preparing");
    setLaunchError(null);
    setLaunchIssues(null);

    // 1. Create draft. The response carries the server-canonical pool +
    //    fee snapshot — the escrow tx below MUST use these numbers, not
    //    local float math, or on-chain verification can mismatch by a
    //    raw unit (fractional lottery division) or drift with the
    //    ANSEM price between page-mount and launch.
    let slug: string;
    let escrowPool: number;
    let escrowFee: number;
    try {
      const res = await fetch("/api/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await res.json()) as
        | {
            ok: true;
            bounty: {
              slug: string;
              totalPool: string;
              creationFeeAmount: string | null;
            };
          }
        | {
            ok: false;
            error: string;
            errorCode?: string;
            issues?: ValidationIssue[];
          };
      if (!res.ok || !body.ok) {
        if ("issues" in body && body.issues && body.issues.length > 0) {
          setLaunchIssues(body.issues);
          scrollToFirstError(body.issues);
        }
        throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      }
      slug = body.bounty.slug;
      escrowPool = Number(body.bounty.totalPool);
      escrowFee =
        body.bounty.creationFeeAmount != null
          ? Number(body.bounty.creationFeeAmount)
          : 0;
      if (!Number.isFinite(escrowPool) || escrowPool <= 0) {
        throw new Error("Server returned an invalid escrow amount");
      }
      if (!Number.isFinite(escrowFee) || escrowFee < 0) {
        escrowFee = 0;
      }
    } catch (err) {
      setLaunchState("error");
      setLaunchError(err instanceof Error ? err.message : String(err));
      return;
    }

    // 2. Escrow transfer (mock mode skips this entirely)
    let txSignature: string | undefined;
    if (escrowMode !== "mock") {
      setLaunchState("awaiting_signature");
      try {
        if (!treasuryAddress) {
          throw new Error(
            "Treasury address not configured on the server. Set TREASURY_WALLET_PUBLIC_KEY in .env.local and restart.",
          );
        }
        if (!isConnected || !connectedWallet) {
          // The launch button shouldn't have been clickable in this
          // state (we render a Connect-wallet button instead), but
          // belt-and-braces: open the picker and bail without surfacing
          // a console error.
          openConnectModal();
          setLaunchState("idle");
          setLaunchError(
            "Connect a wallet (Phantom or Solflare) to pay for the escrow, then click Launch again.",
          );
          return;
        }
        // Treasury-as-personal-wallet guard. If someone imports the
        // treasury keypair into their wallet (e.g. for funding tests),
        // Phantom can end up signing the escrow tx AS the treasury —
        // which violates our "sender ATA owner = user wallet" invariant
        // and surfaces as a confusing `sender_mismatch` later. Catch
        // it up-front with a friendly message.
        if (connectedWallet === treasuryAddress) {
          setLaunchState("error");
          setLaunchError(
            "Your wallet is the same address as the treasury. Switch Phantom to your personal account (or remove the treasury keypair from Phantom) and try again.",
          );
          return;
        }
        // Persist whichever wallet the user just connected so reward
        // payouts route to the right address. No-op when unchanged.
        if (connectedWallet !== user.walletAddress) {
          try {
            await fetch("/api/users/connect-wallet", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                walletAddress: connectedWallet,
                provider: walletName,
              }),
            });
          } catch (err) {
            console.warn(
              "[launch] connect-wallet save failed (continuing):",
              err,
            );
          }
        }
        const fromPubkey = new PublicKey(connectedWallet);
        if (!token) {
          throw new Error("ANSEM price not loaded yet — try again");
        }
        // Escrow amounts come from the draft response (server-canonical
        // snapshot) — see step 1. When the platform has a separate
        // revenue wallet, the pool and the fee are physically separated
        // — pool to treasury, creation fee to revenue. Otherwise we fold
        // them into a single combined transfer to treasury (legacy mode).
        const splitFee = revenueAddress != null && escrowFee > 0;
        const treasuryAmount = splitFee ? escrowPool : escrowPool + escrowFee;
        const tx = await buildEscrowTransaction({
          connection,
          from: fromPubkey,
          treasuryAddress,
          transfer: {
            kind: "spl",
            mint: token.mint,
            decimals: token.decimals,
            rawAmount: toRawAmount(treasuryAmount, token.decimals),
          },
          fee:
            splitFee && revenueAddress
              ? {
                  revenueAddress,
                  transfer: {
                    kind: "spl",
                    mint: token.mint,
                    decimals: token.decimals,
                    rawAmount: toRawAmount(escrowFee, token.decimals),
                  },
                }
              : undefined,
        });
        // wallet-adapter signs + submits + returns the base58 sig.
        // `connection` is the same RPC endpoint configured in the
        // SolanaWalletProvider, so confirmation hits Helius too.
        const signature = await sendTransaction(tx, connection);
        setLaunchState("awaiting_confirmation");
        const latest = await connection.getLatestBlockhash("confirmed");
        const conf = await connection.confirmTransaction(
          {
            signature,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          },
          "confirmed",
        );
        if (conf.value.err) {
          throw new Error(
            `On-chain confirmation failed: ${JSON.stringify(conf.value.err)}`,
          );
        }
        txSignature = signature;
      } catch (err) {
        // wallet-adapter throws `WalletSendTransactionError` etc. —
        // dump everything for debugging, surface the simulation logs
        // when present.
        console.error("[launch] wallet sendTransaction threw:", err);
        const detail = extractSimulationDetail(err);
        if (detail) {
          console.error("[launch] simulation detail:", detail);
        }
        setLaunchState("error");
        setLaunchError(
          [
            err instanceof Error ? err.message : String(err),
            detail,
          ]
            .filter(Boolean)
            .join(" — "),
        );
        return;
      }
    } else {
      setLaunchState("awaiting_confirmation");
    }

    // 3. Activate
    try {
      const res = await fetch(`/api/bounties/${slug}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationHours: form.durationHours,
          escrowTxSignature: txSignature,
        }),
      });
      const body = (await res.json()) as
        | { ok: true; bounty: { slug: string } }
        | {
            ok: false;
            error: string;
            errorCode?: string;
            issues?: ValidationIssue[];
          };
      if (!res.ok || !body.ok) {
        if ("issues" in body && body.issues && body.issues.length > 0) {
          setLaunchIssues(body.issues);
          scrollToFirstError(body.issues);
        }
        throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      }
      setLaunchState("live");
      setTimeout(() => router.push(`/bounties/${body.bounty.slug}`), 700);
    } catch (err) {
      setLaunchState("error");
      setLaunchError(err instanceof Error ? err.message : String(err));
    }
  };

  /* ---- Render ------------------------------------------------------- */
  const totalPool = form.rewardPerHunter * form.maxHunters;
  // Prefer the LIVE price for display — form.rewardPerHunterUsd is a
  // snapshot from the last edit and can lag a retry-refreshed price.
  const totalPoolUsd = token
    ? form.rewardPerHunter * token.priceUsd * form.maxHunters
    : form.rewardPerHunterUsd != null
      ? form.rewardPerHunterUsd * form.maxHunters
      : null;

  return (
    <div className="space-y-6">
      {/* Header -------------------------------------------------------- */}
      <header className="space-y-1">
        <h1 className="text-display">Create bounty</h1>
        <p className="text-body text-text-secondary">
          Reward hunters in $ANSEM for engaging with your tweet, signed in as{" "}
          <span className="text-text-primary">@{user.handle}</span>.
        </p>
      </header>

      {/* Two-column layout -------------------------------------------- */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
          <FormSection
            step={1}
            sectionId="bounty-section-1"
            title="Tweet to promote"
            helper="Paste the tweet hunters should engage with."
            complete={!!tweetResolved}
            errors={sectionErrors[1]}
          >
            <TweetUrlInput
              value={form.tweetUrl}
              onChange={(next) => patch({ tweetUrl: next })}
              resolved={tweetResolved}
              onResolved={setTweetResolved}
            />
          </FormSection>

          <FormSection
            step={2}
            sectionId="bounty-section-2"
            title="Who can hunt"
            helper="Restrict the bounty to specific hunter profiles (optional)."
            errors={sectionErrors[2]}
          >
            <EligibilityFiltersBuilder
              value={form.eligibilityFilters}
              onChange={(next) => patch({ eligibilityFilters: next })}
            />
          </FormSection>

          <FormSection
            step={3}
            sectionId="bounty-section-3"
            title="What hunters need to do"
            helper="Pick at least one action. For best results we recommend Reply + Follow."
            complete={
              form.actionConfig.retweet ||
              form.actionConfig.reply.required ||
              form.actionConfig.follow.required ||
              form.actionConfig.quote.required
            }
            errors={sectionErrors[3]}
          >
            <ActionToggles
              value={form.actionConfig}
              onChange={(next) => patch({ actionConfig: next })}
              suggestedFollowHandle={
                tweetResolved?.authorHandle ?? null
              }
            />
          </FormSection>

          <AnimatePresence initial={false}>
            {form.actionConfig.reply.required && (
              <motion.div
                key="reply-rules"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{ overflow: "hidden" }}
              >
                <FormSection
                  step={4}
                  sectionId="bounty-section-4"
                  title="Reply requirements"
                  helper="Set what hunters must include in their reply (optional)."
                  errors={sectionErrors[4]}
                >
                  <TextActionRulesBuilder
                    value={form.actionConfig.reply.rules}
                    onChange={(next) =>
                      patch({
                        actionConfig: {
                          ...form.actionConfig,
                          reply: { ...form.actionConfig.reply, rules: next },
                        },
                      })
                    }
                  />
                  <div className="mt-5">
                    <TextActionTester
                      rules={form.actionConfig.reply.rules}
                      kind="reply"
                    />
                  </div>
                </FormSection>
              </motion.div>
            )}
            {form.actionConfig.quote.required && (
              <motion.div
                key="quote-rules"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{ overflow: "hidden" }}
              >
                <FormSection
                  step={form.actionConfig.reply.required ? "4b" : 4}
                  sectionId="bounty-section-4b"
                  title="Quote tweet requirements"
                  helper="Same rules engine as replies, applied to the quote-tweet text."
                  errors={sectionErrors[4]}
                >
                  <TextActionRulesBuilder
                    value={form.actionConfig.quote.rules}
                    onChange={(next) =>
                      patch({
                        actionConfig: {
                          ...form.actionConfig,
                          quote: { ...form.actionConfig.quote, rules: next },
                        },
                      })
                    }
                    requiredPlaceholder="Add keywords… e.g. $ANSEM, alpha"
                    forbiddenPlaceholder="e.g. spam, dump"
                  />
                  <div className="mt-5">
                    <TextActionTester
                      rules={form.actionConfig.quote.rules}
                      kind="quote"
                    />
                  </div>
                </FormSection>
              </motion.div>
            )}
          </AnimatePresence>

          <FormSection
            step={5}
            sectionId="bounty-section-5"
            title="How rewards are distributed"
            helper="Fixed slots and Random lottery are live. Other models are queued."
            complete={!!form.distributionModel}
            errors={sectionErrors[5]}
          >
            <DistributionPicker
              value={form.distributionModel}
              onChange={(next) => patch({ distributionModel: next })}
            />
          </FormSection>

          <FormSection
            step={6}
            sectionId="bounty-section-6"
            title="Reward"
            helper={
              form.distributionModel === "pool_lottery"
                ? "Set the total $ANSEM prize pool and how many random winners."
                : "Choose how much $ANSEM hunters earn and how many slots."
            }
            complete={
              form.rewardPerHunter >= MIN_REWARD_PER_HUNTER_ANSEM &&
              form.maxHunters > 0
            }
            errors={sectionErrors[6]}
          >
            <RewardSection
              token={token}
              tokenLoading={tokenLoading}
              tokenError={tokenError}
              onTokenRetry={() => void loadAnsem()}
              rewardPerHunter={form.rewardPerHunter}
              maxHunters={form.maxHunters}
              mode={rewardMode}
              isLottery={form.distributionModel === "pool_lottery"}
              onPerHunterChange={onPerHunterChange}
              onMaxHuntersChange={(n) => patch({ maxHunters: n })}
              onModeChange={setRewardMode}
            />
          </FormSection>

          <FormSection
            step={7}
            sectionId="bounty-section-7"
            title="Holder requirement"
            helper="Optional — only allow hunters who hold a minimum $ANSEM balance."
            complete
          >
            <HolderRequirementSection
              value={form.eligibilityFilters.holderRequirement ?? null}
              ansemToken={token}
              onChange={(next) =>
                patch({
                  eligibilityFilters: {
                    ...form.eligibilityFilters,
                    holderRequirement: next,
                  },
                })
              }
            />
          </FormSection>

          <FormSection
            step={8}
            sectionId="bounty-section-8"
            title="Campaign duration"
            helper="How long this bounty stays open."
            complete={!!form.durationHours}
            errors={sectionErrors[7]}
          >
            <DurationPicker
              value={form.durationHours as DurationHours}
              onChange={(next) => patch({ durationHours: next })}
            />
          </FormSection>

          <CostBreakdown
            totalPool={totalPool}
            totalPoolUsd={totalPoolUsd}
            tokenSymbol={token?.symbol ?? "ANSEM"}
          />

          <div className="flex flex-col items-stretch gap-3 border-t border-border-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-caption text-text-tertiary">
              {!validation.ok ? (
                <span className="text-warning">{validation.error}</span>
              ) : escrowMode !== "mock" && !isConnected ? (
                <span>Connect a wallet to escrow the reward pool.</span>
              ) : (
                <>Ready to launch · {escrowMode === "mock" ? "Mock escrow (no real funds)" : `${escrowMode} escrow`}</>
              )}
            </div>
            {escrowMode !== "mock" && !isConnected ? (
              <button
                type="button"
                onClick={openConnectModal}
                className="press inline-flex h-14 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-accent-primary bg-accent-soft px-8 font-medium text-accent-text hover:bg-accent-soft/80"
              >
                <Wallet className="size-4" strokeWidth={2.25} />
                Connect wallet
              </button>
            ) : (
              <button
                type="button"
                disabled={!validation.ok}
                onClick={() => {
                  setLaunchState("idle");
                  setLaunchError(null);
                  setLaunchIssues(null);
                  setModalOpen(true);
                }}
                className="press inline-flex h-14 items-center justify-center gap-2 rounded-[var(--radius-button)] bg-accent-primary px-8 font-medium text-[#0E0E10] hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="size-4" strokeWidth={2.25} />
                Launch bounty
              </button>
            )}
          </div>
        </main>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <LivePreviewCard
            tweet={tweetResolved?.cached ?? null}
            authorAvatarUrl={tweetResolved?.authorAvatarUrl ?? null}
            actions={form.actionConfig}
            rewardSymbol={token?.symbol ?? "ANSEM"}
            rewardTokenCategory={token?.category ?? "memecoin"}
            rewardTokenLogoUrl={token?.logoUrl ?? null}
            rewardTokenIsAdminVerified={token?.isAdminVerified}
            rewardPerHunter={form.rewardPerHunter}
            rewardPerHunterUsd={
              token ? form.rewardPerHunter * token.priceUsd : null
            }
            maxHunters={form.maxHunters}
            durationHours={form.durationHours}
          />
        </aside>
      </div>

      <ConfirmLaunchModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        state={launchState}
        error={launchError}
        issues={launchIssues}
        rewardSymbol={token?.symbol ?? "ANSEM"}
        totalPool={totalPool}
        totalPoolUsd={totalPoolUsd}
        creationFeeInToken={
          token && token.priceUsd > 0
            ? BOUNTY_CREATION_FEE_USD / token.priceUsd
            : null
        }
        maxHunters={form.maxHunters}
        durationHours={form.durationHours}
        onConfirm={handleLaunch}
        onRetry={handleLaunch}
      />
    </div>
  );
}

/* =========================================================================
   Cost breakdown card (above launch button)
   ========================================================================= */

function CostBreakdown({
  totalPool,
  totalPoolUsd,
  tokenSymbol,
}: {
  totalPool: number;
  totalPoolUsd: number | null;
  tokenSymbol: string;
}) {
  const dueNowUsd =
    totalPoolUsd != null
      ? totalPoolUsd + BOUNTY_CREATION_FEE_USD
      : null;
  return (
    <div className="space-y-2 rounded-[var(--radius-card)] border border-border-subtle bg-bg-surface p-5">
      <h3 className="text-caption uppercase tracking-wider text-text-tertiary">
        Review &amp; pay
      </h3>
      <div className="space-y-1 text-small">
        <Row label="Reward pool">
          <span className="font-mono tabular-nums text-text-primary" data-numeric>
            {totalPool.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
            {tokenSymbol}
            {totalPoolUsd != null && (
              <span className="ml-2 text-text-tertiary">
                · {formatUsd(totalPoolUsd)}
              </span>
            )}
          </span>
        </Row>
        <Row label="Bounty creation fee">
          <span
            className="font-mono tabular-nums text-text-primary"
            data-numeric
          >
            {formatUsd(BOUNTY_CREATION_FEE_USD)} in {tokenSymbol}
            <span className="ml-2 text-text-tertiary">
              · covers verification &amp; infra
            </span>
          </span>
        </Row>
        <Row label="Platform fee">
          <span className="text-text-primary">5% (from each claim)</span>
        </Row>
        <Row label="You pay now">
          <span className="font-mono tabular-nums text-text-primary" data-numeric>
            {totalPool.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
            {tokenSymbol} + {formatUsd(BOUNTY_CREATION_FEE_USD)} in {tokenSymbol}
            {dueNowUsd != null && (
              <span className="ml-2 text-text-tertiary">
                · ≈ {formatUsd(dueNowUsd)}
              </span>
            )}
          </span>
        </Row>
      </div>
      <p className="text-caption leading-relaxed text-text-tertiary">
        Funds are escrowed in our treasury until claims are verified.
        Unclaimed rewards return to your wallet when the campaign ends.
      </p>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-tertiary">{label}</span>
      {children}
    </div>
  );
}

/* =========================================================================
   Validation — strict enough to gate the Launch button.
   ========================================================================= */

function validateForm({
  form,
  tweetResolved,
  token,
}: {
  form: CreateBountyInput;
  tweetResolved: TweetResolveResult | null;
  token: TokenOption | null;
}): { ok: true } | { ok: false; error: string } {
  if (!tweetResolved) {
    return { ok: false, error: "Paste a tweet URL to continue" };
  }
  if (tweetResolved.isReply) {
    // Mirrors the server-side block in POST /api/bounties — Twitter's
    // replies endpoint only enumerates *direct* replies to the root,
    // so a bounty on a reply can never be successfully hunted.
    return {
      ok: false,
      error:
        "Bounties only work on main tweets for now — replies aren't supported. Pick the root post.",
    };
  }
  const a = form.actionConfig;
  if (
    !a.retweet &&
    !a.reply.required &&
    !a.quote.required &&
    !a.follow.required
  ) {
    return {
      ok: false,
      error: "Pick at least one action hunters need to complete",
    };
  }
  if (!token) {
    return { ok: false, error: "Waiting for the live $ANSEM price…" };
  }
  if (!(form.maxHunters > 0)) {
    return { ok: false, error: "Number of slots must be at least 1" };
  }
  if (form.rewardPerHunter < MIN_REWARD_PER_HUNTER_ANSEM) {
    return {
      ok: false,
      error: `Each winner must earn at least ${MIN_REWARD_PER_HUNTER_ANSEM} ANSEM`,
    };
  }
  return { ok: true };
}

/* =========================================================================
   Server-issue grouping + scroll helpers
   ========================================================================= */

function groupIssuesBySection(
  issues: ValidationIssue[],
): Record<number, string[]> {
  const map: Record<number, string[]> = {};
  for (const issue of issues) {
    const section = sectionForPath(issue.path);
    if (section == null) continue;
    (map[section] ??= []).push(issue.message);
  }
  return map;
}

function scrollToFirstError(issues: ValidationIssue[]): void {
  for (const issue of issues) {
    const section = sectionForPath(issue.path);
    if (section == null) continue;
    const el = document.getElementById(`bounty-section-${section}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
}

/**
 * Wallet adapters wrap the underlying Solana RPC `simulateTransaction`
 * and throw a generic "Transaction simulation failed" — the real cause
 * (insufficient balance, ATA missing, decimal mismatch, …) is parked on
 * the error object as `cause`, `details`, or an unstructured property.
 * Walk the common shapes and return whatever useful string we find.
 */
function extractSimulationDetail(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    cause?: unknown;
    details?: unknown;
    logs?: unknown;
    error?: unknown;
    simulationLogs?: unknown;
    code?: string | number;
    message?: unknown;
  };
  // Specific Solana error: "Attempt to debit an account but found no
  // record of a prior credit" — this means the signer's wallet has
  // zero lamports on the cluster, so the account doesn't exist on
  // chain yet. Surface a fix-it hint instead of the raw RPC line.
  const allText = [e.message, e.cause, e.error]
    .map((v) => (typeof v === "string" ? v : ""))
    .join(" ");
  if (/no record of a prior credit|account not found/i.test(allText)) {
    return (
      "Your wallet has no SOL — add some via an exchange (or any on-ramp) " +
      "and retry. We need a small amount to pay the on-chain fee."
    );
  }
  if (/insufficient funds|insufficient lamports/i.test(allText)) {
    return "Insufficient balance — top up ANSEM or SOL for fees.";
  }
  const logs =
    (Array.isArray(e.logs) && e.logs) ||
    (Array.isArray(e.simulationLogs) && e.simulationLogs) ||
    (e.cause && typeof e.cause === "object" && "logs" in e.cause
      ? (e.cause as { logs?: unknown }).logs
      : null);
  if (Array.isArray(logs) && logs.length > 0) {
    // Common Solana program log marker: "Program log: …" — pluck the
    // most specific line if present, otherwise show the last few.
    const interesting = logs.filter(
      (l) => typeof l === "string" && /failed|error|insufficient/i.test(l),
    );
    return (interesting.length > 0 ? interesting : logs.slice(-3)).join(" | ");
  }
  if (typeof e.error === "string") return e.error;
  if (typeof e.cause === "string") return e.cause;
  if (typeof e.code === "string" || typeof e.code === "number") {
    return `code=${e.code}`;
  }
  return null;
}
