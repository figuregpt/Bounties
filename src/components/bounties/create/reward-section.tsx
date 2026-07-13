"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatTokenPrice } from "@/lib/format";
import {
  AnsemTokenCard,
  type SelectedToken,
} from "@/components/bounties/create/ansem-token-card";
import { MIN_REWARD_PER_HUNTER_ANSEM } from "@/lib/validation/bounty";

/**
 * Reward section: fixed $ANSEM token card + amount calculator with the
 * min-1-ANSEM-per-winner indicator.
 *
 * Parent owns all values; the section is a pure controlled component.
 */

export type TokenOption = SelectedToken;

export type RewardMode = "per_hunter" | "total_pool";

type Props = {
  token: TokenOption | null;
  tokenLoading: boolean;
  tokenError: string | null;
  onTokenRetry: () => void;
  rewardPerHunter: number;
  maxHunters: number;
  mode: RewardMode;
  /** True for `pool_lottery` distribution: switches the UI to ask
   *  for "Total prize pool" and "Number of winners" directly, since
   *  per-hunter × slots framing confuses the lottery flow. */
  isLottery?: boolean;
  onPerHunterChange: (next: number) => void;
  onMaxHuntersChange: (next: number) => void;
  onModeChange: (next: RewardMode) => void;
};

export function RewardSection({
  token,
  tokenLoading,
  tokenError,
  onTokenRetry,
  rewardPerHunter,
  maxHunters,
  mode,
  isLottery = false,
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
  const symbol = token?.symbol ?? "ANSEM";
  // One token-denominated floor: every winner earns at least 1 ANSEM.
  const perHunterPasses = rewardPerHunter >= MIN_REWARD_PER_HUNTER_ANSEM;

  return (
    <div className="space-y-5">
      {/* Fixed reward token ---------------------------------------------- */}
      <div>
        <h3 className="mb-2 text-small font-medium text-text-primary">Token</h3>
        <AnsemTokenCard
          token={token}
          loading={tokenLoading}
          error={tokenError}
          onRetry={onTokenRetry}
        />
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
        <FloorIndicator
          passes={perHunterPasses}
          passLabel={`${isLottery ? "Each winner" : "Per hunter"} · ${rewardPerHunter.toLocaleString(undefined, { maximumFractionDigits: 6 })} ANSEM (min ${MIN_REWARD_PER_HUNTER_ANSEM} ANSEM)`}
          failLabel={`${isLottery ? "Each winner" : "Per hunter"} must be at least ${MIN_REWARD_PER_HUNTER_ANSEM} ANSEM — currently ${rewardPerHunter.toLocaleString(undefined, { maximumFractionDigits: 6 })} ANSEM${isLottery ? ". Raise the prize pool or lower winner count." : ""}`}
        />
        <p className="text-caption text-text-tertiary">
          {isLottery
            ? `Every winner must earn at least ${MIN_REWARD_PER_HUNTER_ANSEM} ANSEM — a 1000 ANSEM pool pays at most 1000 winners. Platform fee · 5% comes from each winning claim, not from the pool you escrow now.`
            : `Every hunter must earn at least ${MIN_REWARD_PER_HUNTER_ANSEM} ANSEM. Platform fee · 5% comes from each claim, not from the pool you escrow now.`}
        </p>
      </div>
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
