"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatTokenPrice } from "@/lib/format";
import {
  TokenPicker,
  type SelectedToken,
} from "@/components/bounties/create/token-picker";
import {
  MIN_REWARD_PER_HUNTER_USD,
  MIN_TOTAL_POOL_USD,
} from "@/lib/validation/bounty";
import type { Chain } from "@/lib/chains/types";
import { SUPPORTED_CHAINS } from "@/lib/chains/types";
import { chainLabel } from "@/lib/chains/evm/config";
import { chainLogo } from "@/lib/chains/logos";

/**
 * Reward section: token picker (paste CA + quick picks) + amount
 * calculator. Two independent reward-floor indicators live here so
 * the creator sees pass/fail status for each before hitting submit.
 *
 * Parent owns all values; the section is a pure controlled component.
 */

export type TokenOption = SelectedToken;

export type RewardMode = "per_hunter" | "total_pool";

type Props = {
  token: TokenOption | null;
  rewardPerHunter: number;
  maxHunters: number;
  mode: RewardMode;
  /** Settlement chain. Switching it clears the selected token (addresses
   *  and prices don't carry across chains). */
  chain: Chain;
  /** Networks the creator may pick. An EVM chain is only listed once it's
   *  configured for real settlement on the server. Defaults to all
   *  supported chains when omitted. */
  availableChains?: Chain[];
  /** True for `pool_lottery` distribution: switches the UI to ask
   *  for "Total prize pool" and "Number of winners" directly, since
   *  per-hunter × slots framing confuses the lottery flow. */
  isLottery?: boolean;
  onTokenChange: (next: TokenOption | null) => void;
  onChainChange: (next: Chain) => void;
  onPerHunterChange: (next: number) => void;
  onMaxHuntersChange: (next: number) => void;
  onModeChange: (next: RewardMode) => void;
};

export function RewardSection({
  token,
  rewardPerHunter,
  maxHunters,
  mode,
  chain,
  availableChains,
  isLottery = false,
  onTokenChange,
  onChainChange,
  onPerHunterChange,
  onMaxHuntersChange,
  onModeChange,
}: Props) {
  const total = rewardPerHunter * maxHunters;
  const totalUsd = useMemo(
    () => (token ? total * token.priceUsd : null),
    [total, token],
  );
  const perHunterUsd = useMemo(
    () => (token ? rewardPerHunter * token.priceUsd : null),
    [rewardPerHunter, token],
  );
  const symbol = token?.symbol ?? "";
  // Two independent reward floors. The form is only valid when both
  // pass. We surface them as side-by-side indicators so the creator
  // sees exactly which knob to adjust.
  const perHunterPasses =
    perHunterUsd != null && perHunterUsd >= MIN_REWARD_PER_HUNTER_USD;
  const totalPoolPasses =
    totalUsd != null && totalUsd >= MIN_TOTAL_POOL_USD;

  return (
    <div className="space-y-5">
      {/* Network -------------------------------------------------------- */}
      <div>
        <h3 className="mb-2 text-small font-medium text-text-primary">
          Network
        </h3>
        <ChainToggle
          chain={chain}
          chains={availableChains ?? SUPPORTED_CHAINS}
          onChange={onChainChange}
        />
      </div>

      {/* Token picker --------------------------------------------------- */}
      <div>
        <h3 className="mb-2 text-small font-medium text-text-primary">Token</h3>
        <TokenPicker selected={token} onChange={onTokenChange} chain={chain} />
      </div>

      {/* Mode tabs (fixed_slot only — lottery has its own simplified UI) */}
      {!isLottery && (
        <div className="inline-flex rounded-[10px] border border-border-default bg-bg-elevated p-0.5">
          {(["per_hunter", "total_pool"] as RewardMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={cn(
                "press rounded-[8px] px-3 py-1 text-caption transition-colors",
                mode === m
                  ? "bg-bg-surface text-text-primary"
                  : "text-text-secondary",
              )}
            >
              {m === "per_hunter" ? "Per hunter" : "Total pool"}
            </button>
          ))}
        </div>
      )}

      {/* Amount calculator -------------------------------------------- */}
      {isLottery ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-end">
          <NumberCell
            label="Total prize pool"
            value={total}
            suffix={symbol}
            onChange={(v) => {
              if (maxHunters > 0) onPerHunterChange(v / maxHunters);
            }}
          />
          <Op>÷</Op>
          <NumberCell
            label="Winners"
            value={maxHunters}
            integer
            onChange={(v) =>
              onMaxHuntersChange(Math.max(1, Math.round(v)))
            }
          />
          <Op>=</Op>
          <NumberCell
            label="Each winner gets"
            value={rewardPerHunter}
            suffix={symbol}
            readOnly
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-end">
          <NumberCell
            label={mode === "per_hunter" ? "Per hunter" : "Total pool"}
            value={mode === "per_hunter" ? rewardPerHunter : total}
            suffix={symbol}
            onChange={(v) => {
              if (mode === "per_hunter") {
                onPerHunterChange(v);
              } else if (maxHunters > 0) {
                onPerHunterChange(v / maxHunters);
              }
            }}
          />
          <Op>{mode === "per_hunter" ? "×" : "÷"}</Op>
          <NumberCell
            label="Slots"
            value={maxHunters}
            integer
            onChange={(v) => onMaxHuntersChange(Math.max(1, Math.round(v)))}
          />
          <Op>=</Op>
          <NumberCell
            label={mode === "per_hunter" ? "Total pool" : "Per hunter"}
            value={mode === "per_hunter" ? total : rewardPerHunter}
            suffix={symbol}
            readOnly
          />
        </div>
      )}

      {/* USD breakdown + min-reward floor ----------------------------- */}
      <div className="space-y-2 rounded-[10px] border border-border-subtle bg-bg-base px-4 py-3 text-small">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-text-secondary">
            <Coins className="size-3.5" strokeWidth={2} />
            {isLottery ? "Each winner gets" : "Per hunter"}
          </span>
          <span
            className="font-mono tabular-nums text-text-primary"
            data-numeric
          >
            {perHunterUsd != null ? `≈ ${formatTokenPrice(perHunterUsd)}` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-tertiary">Total in USD</span>
          <span
            className="font-mono tabular-nums text-text-primary"
            data-numeric
          >
            {totalUsd != null ? formatTokenPrice(totalUsd) : "—"}
          </span>
        </div>
        {token && perHunterUsd != null && perHunterUsd > 0 && (
          <div className="flex flex-col gap-1.5">
            <FloorIndicator
              passes={perHunterPasses}
              passLabel={`${isLottery ? "Each winner" : "Per hunter"} ≈ ${formatTokenPrice(perHunterUsd)} (min $${MIN_REWARD_PER_HUNTER_USD})`}
              failLabel={`${isLottery ? "Each winner" : "Per hunter"} must be at least $${MIN_REWARD_PER_HUNTER_USD} — currently ≈ ${formatTokenPrice(perHunterUsd)}`}
            />
            <FloorIndicator
              passes={totalPoolPasses}
              passLabel={`Total pool ≈ ${formatTokenPrice(totalUsd)} (min $${MIN_TOTAL_POOL_USD})`}
              failLabel={`Total pool must be at least $${MIN_TOTAL_POOL_USD} — currently ≈ ${formatTokenPrice(totalUsd)}. ${isLottery ? "Raise the prize pool or lower winner count." : "Increase per-hunter amount or slots."}`}
            />
          </div>
        )}
        <p className="text-caption text-text-tertiary">
          {isLottery
            ? `Lottery bounties have two minimums: $${MIN_TOTAL_POOL_USD} total prize pool and $${MIN_REWARD_PER_HUNTER_USD} per winner. Platform fee · 5% comes from each winning claim, not from the pool you escrow now.`
            : `Bounties have two minimums: $${MIN_TOTAL_POOL_USD} total pool and $${MIN_REWARD_PER_HUNTER_USD} per hunter. Platform fee · 5% comes from each claim, not from the pool you escrow now.`}
        </p>
      </div>
    </div>
  );
}

/** Solana / Monad / Base segmented toggle. Picking a network clears the
 *  token. Chains + logos are derived from the registry, so a new chain
 *  shows up here automatically. */
function ChainToggle({
  chain,
  chains,
  onChange,
}: {
  chain: Chain;
  chains: readonly Chain[];
  onChange: (next: Chain) => void;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-button)] border border-border-default bg-bg-surface p-1">
      {chains.map((value) => {
        const active = chain === value;
        const logo = chainLogo(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-button)] px-3 py-1.5 text-small font-medium transition-colors",
              active
                ? "bg-bg-elevated text-text-primary"
                : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt=""
                className="size-4 rounded-full"
                aria-hidden
              />
            )}
            {chainLabel(value)}
          </button>
        );
      })}
    </div>
  );
}

function FloorIndicator({
  passes,
  passLabel,
  failLabel,
}: {
  passes: boolean;
  passLabel: string;
  failLabel: string;
}) {
  return (
    <p
      className={cn(
        "inline-flex items-start gap-1.5 text-caption",
        passes ? "text-success" : "text-warning",
      )}
    >
      {passes ? (
        <CheckCircle2
          className="mt-0.5 size-3 shrink-0"
          strokeWidth={2.25}
        />
      ) : (
        <AlertCircle
          className="mt-0.5 size-3 shrink-0"
          strokeWidth={2.25}
        />
      )}
      <span>{passes ? passLabel : failLabel}</span>
    </p>
  );
}

/* =========================================================================
   Cells
   ========================================================================= */

function NumberCell({
  label,
  value,
  suffix,
  integer,
  readOnly,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  integer?: boolean;
  readOnly?: boolean;
  onChange?: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <div className="mt-1 flex items-center gap-2 rounded-[10px] border border-border-default bg-bg-base px-3 focus-within:border-accent-primary">
        <Input
          type="number"
          step={integer ? 1 : "any"}
          min={0}
          value={Number.isFinite(value) ? value : 0}
          readOnly={readOnly}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className={cn(
            "border-0 bg-transparent p-0 px-0 text-body tabular-nums shadow-none focus-visible:ring-0",
            readOnly && "text-text-secondary",
          )}
          data-numeric
        />
        {suffix && (
          <span className="text-caption text-text-tertiary">{suffix}</span>
        )}
      </div>
    </label>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return (
    <span className="hidden self-end pb-2 text-text-tertiary sm:inline">
      {children}
    </span>
  );
}
