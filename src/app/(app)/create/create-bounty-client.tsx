"use client";

import { useCallback, useMemo, useState } from "react";
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
  MIN_REWARD_PER_HUNTER_USD,
  MIN_TOTAL_POOL_USD,
  type CreateBountyInput,
  type DurationHours,
} from "@/lib/validation/bounty";
import {
  buildEscrowTransaction,
  solToLamports,
  toRawAmount,
  type EscrowMode,
} from "@/lib/solana/escrow";

/* ──────────────────────────────────────────────────────────────────────────
   Create-bounty client form.

   State management is plain `useState` — react-hook-form is overkill for
   this shape and the live preview already re-renders on every change.
   Validation runs client-side just before submit by leaning on the
   server's zod schema (mirrored in `defaultCreateBountyValues`).

   Submit flow:
     1. POST /api/bounties → draft created, slug returned
     2. (devnet/mainnet only) build + sign + send escrow tx via Privy
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
};

export function CreateBountyClient({ user, escrowMode, treasuryAddress }: Props) {
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
  // Phase 8.5: no default token — creator must pick or paste a mint
  // before the launch button enables. The TokenPicker handles its own
  // loading + error states; we just store the resolved row here.
  const [token, setToken] = useState<TokenOption | null>(null);
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

  const onTokenChange = (next: TokenOption | null) => {
    setToken(next);
    if (!next) {
      patch({
        rewardTokenMint: "",
        rewardTokenSymbol: "",
        rewardTokenDecimals: 0,
        rewardPerHunterUsd: null,
      });
      return;
    }
    patch({
      rewardTokenMint: next.mint,
      rewardTokenSymbol: next.symbol,
      rewardTokenDecimals: next.decimals,
      rewardPerHunterUsd: form.rewardPerHunter * next.priceUsd,
    });
  };

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

    // 1. Create draft
    let slug: string;
    try {
      const res = await fetch("/api/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
      slug = body.bounty.slug;
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
        const totalPool = form.rewardPerHunter * form.maxHunters;
        if (!token) {
          throw new Error("No reward token selected");
        }
        // Bake the creation fee into the escrow ask so the modal's
        // "You pay now" total is what we actually charge. Backend
        // re-derives the same total when verifying the signature.
        // Devnet tokens often have $0 priceUsd (no DexScreener data);
        // dividing would yield Infinity — so we skip the fee on
        // unpriced tokens. The launch route mirrors the same rule.
        const creationFeeInToken =
          token.priceUsd > 0
            ? BOUNTY_CREATION_FEE_USD / token.priceUsd
            : 0;
        const escrowAmount = totalPool + creationFeeInToken;
        const tx = await buildEscrowTransaction({
          connection,
          from: fromPubkey,
          treasuryAddress,
          transfer:
            token.symbol === "SOL"
              ? { kind: "sol", lamports: solToLamports(escrowAmount) }
              : {
                  kind: "spl",
                  mint: token.mint,
                  decimals: token.decimals,
                  rawAmount: toRawAmount(escrowAmount, token.decimals),
                },
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
  const totalPoolUsd =
    form.rewardPerHunterUsd != null
      ? form.rewardPerHunterUsd * form.maxHunters
      : null;

  return (
    <div className="space-y-6">
      {/* Header -------------------------------------------------------- */}
      <header className="space-y-1">
        <h1 className="text-display">Create bounty</h1>
        <p className="text-body text-text-secondary">
          Reward hunters for engaging with your tweet, signed in as{" "}
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
                    requiredPlaceholder="Add keywords… e.g. $BNTY, alpha"
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
            helper="Only Fixed slots ships in v1. Other models are queued."
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
            helper="Choose what hunters earn and how many slots."
            complete={
              form.rewardPerHunter > 0 && form.maxHunters > 0
            }
            errors={sectionErrors[6]}
          >
            <RewardSection
              token={token}
              rewardPerHunter={form.rewardPerHunter}
              maxHunters={form.maxHunters}
              mode={rewardMode}
              onTokenChange={onTokenChange}
              onPerHunterChange={onPerHunterChange}
              onMaxHuntersChange={(n) => patch({ maxHunters: n })}
              onModeChange={setRewardMode}
            />
          </FormSection>

          <FormSection
            step={7}
            sectionId="bounty-section-7"
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
            tokenSymbol={token?.symbol ?? ""}
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
            rewardSymbol={token?.symbol ?? "—"}
            rewardTokenCategory={token?.category ?? "other"}
            rewardTokenLogoUrl={token?.logoUrl ?? null}
            rewardTokenIsAdminVerified={token?.isAdminVerified}
            rewardPerHunter={form.rewardPerHunter}
            rewardPerHunterUsd={form.rewardPerHunterUsd}
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
        rewardSymbol={token?.symbol ?? "—"}
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
            {formatUsd(BOUNTY_CREATION_FEE_USD)}
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
            {tokenSymbol} + {formatUsd(BOUNTY_CREATION_FEE_USD)}
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
    return { ok: false, error: "Pick a reward token" };
  }
  if (!(form.rewardPerHunter > 0)) {
    return { ok: false, error: "Reward must be greater than 0" };
  }
  if (!(form.maxHunters > 0)) {
    return { ok: false, error: "Number of slots must be at least 1" };
  }
  const usdPerHunter = form.rewardPerHunter * token.priceUsd;
  const usdTotalPool = usdPerHunter * form.maxHunters;
  if (usdPerHunter < MIN_REWARD_PER_HUNTER_USD) {
    return {
      ok: false,
      error: `Per-hunter reward must be at least $${MIN_REWARD_PER_HUNTER_USD} USD (currently ≈ $${usdPerHunter.toFixed(2)})`,
    };
  }
  if (usdTotalPool < MIN_TOTAL_POOL_USD) {
    return {
      ok: false,
      error: `Total reward pool must be at least $${MIN_TOTAL_POOL_USD} USD (currently ≈ $${usdTotalPool.toFixed(2)})`,
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
 * Privy's `signAndSendTransaction` wraps the underlying Solana RPC
 * `simulateTransaction` and throws a generic "Transaction simulation
 * failed" — the real cause (insufficient balance, ATA missing, decimal
 * mismatch, …) is parked on the error object as `cause`, `details`, or
 * an unstructured property. Walk the common shapes and return whatever
 * useful string we find.
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
      "Your wallet has no SOL on this cluster — fund it with devnet SOL " +
      "(`solana airdrop 2 <wallet> --url devnet` or faucet.solana.com), " +
      "then retry."
    );
  }
  if (/insufficient funds|insufficient lamports/i.test(allText)) {
    return "Insufficient balance — top up the reward token or SOL for fees.";
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
