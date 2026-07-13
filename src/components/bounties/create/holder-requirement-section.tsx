"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatTokenPrice } from "@/lib/format";
import { TokenAvatar } from "@/components/bounties/token-avatar";
import type { SelectedToken } from "@/components/bounties/create/ansem-token-card";
import {
  ANSEM_DECIMALS,
  ANSEM_LOGO_URL,
  ANSEM_MINT,
  ANSEM_NAME,
  ANSEM_SYMBOL,
} from "@/lib/tokens/ansem";

/**
 * Optional gate: hunters need to hold at least N $ANSEM in their
 * connected wallet before they can pull a slot. The token is fixed —
 * creators only toggle the gate and pick the minimum balance.
 *
 * Parent owns the persisted shape — pass `value`, react to `onChange`.
 * `ansemToken` is the enriched row the create page already fetched for
 * the reward card; we reuse its live price for the USD preview.
 */

export type HolderRequirementValue = {
  mint: typeof ANSEM_MINT;
  symbol: typeof ANSEM_SYMBOL;
  decimals: typeof ANSEM_DECIMALS;
  minAmount: number;
} | null;

type Props = {
  value: HolderRequirementValue;
  onChange: (next: HolderRequirementValue) => void;
  /** Enriched ANSEM row (live price) — null while loading. */
  ansemToken: SelectedToken | null;
};

const DEFAULT_MIN_AMOUNT = 1;

export function HolderRequirementSection({
  value,
  onChange,
  ansemToken,
}: Props) {
  const enabled = value != null;
  const min = value?.minAmount ?? 0;
  const priceUsd = ansemToken?.priceUsd ?? 0;
  const usd = enabled && min > 0 && priceUsd > 0 ? min * priceUsd : null;

  function setEnabled(next: boolean): void {
    onChange(
      next
        ? {
            mint: ANSEM_MINT,
            symbol: ANSEM_SYMBOL,
            decimals: ANSEM_DECIMALS,
            minAmount: value?.minAmount ?? DEFAULT_MIN_AMOUNT,
          }
        : null,
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-4">
        <div className="flex min-w-0 items-center gap-3">
          <TokenAvatar
            logoUrl={ansemToken?.logoUrl ?? ANSEM_LOGO_URL}
            symbol={ANSEM_SYMBOL}
            size={36}
            isAdminVerified={ansemToken?.isAdminVerified}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary">
                {ANSEM_SYMBOL}
              </span>
              <span className="truncate text-caption text-text-tertiary">
                {ANSEM_NAME}
              </span>
            </div>
            <p className="text-caption text-text-tertiary">
              Only allow hunters who hold a minimum $ANSEM balance.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onChange={setEnabled}
          aria-label="Require hunters to hold ANSEM"
        />
      </div>

      {value && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <NumberCell
            label="Minimum balance"
            value={value.minAmount}
            suffix={ANSEM_SYMBOL}
            onChange={(v) => {
              if (Number.isFinite(v) && v > 0) {
                onChange({ ...value, minAmount: v });
              }
            }}
          />
          <NumberCell
            label="≈ in USD"
            value={usd ?? 0}
            suffix="USD"
            readOnly
          />
        </div>
      )}

      {usd != null && (
        <p className="text-caption text-text-tertiary">
          Hunters need {min.toLocaleString("en-US")} {ANSEM_SYMBOL} (≈{" "}
          {formatTokenPrice(usd)}) in their connected wallet to pull a slot.
        </p>
      )}
    </div>
  );
}

function NumberCell({
  label,
  value,
  suffix,
  readOnly,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  readOnly?: boolean;
  onChange?: (next: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-[10px] border border-border-default bg-bg-base px-3 py-2">
        <Input
          type="number"
          min={0}
          step="any"
          readOnly={readOnly}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && onChange) onChange(n);
          }}
          className="!h-auto flex-1 border-0 bg-transparent !px-0 font-mono text-body tabular-nums focus:!ring-0"
        />
        {suffix && (
          <span className="shrink-0 text-caption text-text-tertiary">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
