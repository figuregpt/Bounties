"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatTokenPrice, formatCompact } from "@/lib/format";
import {
  TokenPicker,
  type SelectedToken,
} from "@/components/bounties/create/token-picker";

/**
 * Optional gate: hunters need to hold at least N of a token in their
 * connected wallet before they can pull a slot. Pasting a CA enriches
 * via DexScreener (same path the reward token picker uses) so the
 * creator sees logo, market metadata, and a live USD preview of the
 * threshold they're setting.
 *
 * Parent owns the persisted shape — pass `value`, react to `onChange`.
 * The TokenPicker's rich SelectedToken lives only in this component's
 * local state; we hand the parent the compact `{ mint, symbol,
 * decimals, minAmount }` shape that lands in EligibilityFilters.
 */

export type HolderRequirementValue = {
  mint: string;
  symbol: string;
  decimals: number;
  minAmount: number;
} | null;

type Props = {
  value: HolderRequirementValue;
  onChange: (next: HolderRequirementValue) => void;
};

export function HolderRequirementSection({ value, onChange }: Props) {
  // Cache the rich SelectedToken locally so we can render logo + price.
  // Parent only persists the compact subset, so we don't lose visuals
  // when the section re-mounts mid-form.
  const [enriched, setEnriched] = useState<SelectedToken | null>(null);

  function handleTokenChange(next: SelectedToken | null): void {
    setEnriched(next);
    if (!next) {
      onChange(null);
      return;
    }
    onChange({
      mint: next.mint,
      symbol: next.symbol,
      decimals: next.decimals,
      minAmount: value?.minAmount ?? 1,
    });
  }

  // If the parent already has a persisted value but local enriched is
  // null (page just mounted), don't fight it — we'll re-enrich on
  // first edit. Until then we render a minimal summary card.
  const showPicker = !enriched;
  const min = value?.minAmount ?? 0;
  const usd = enriched && min > 0 ? min * enriched.priceUsd : null;

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-border-subtle bg-bg-base px-4 py-3 text-caption text-text-tertiary">
        Skip this section if any hunter can claim. Set a token + minimum
        balance to gate the bounty on wallet holdings.
      </div>

      {showPicker ? (
        <TokenPicker selected={null} onChange={handleTokenChange} />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="flex items-center gap-3">
            <img
              src={enriched.logoUrl}
              alt={enriched.symbol}
              width={36}
              height={36}
              className="size-9 rounded-full"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">
                  {enriched.symbol}
                </span>
                <span className="truncate text-caption text-text-tertiary">
                  {enriched.name}
                </span>
              </div>
              <div className="font-mono text-caption text-text-tertiary tabular-nums">
                {formatTokenPrice(enriched.priceUsd)} · MCap{" "}
                {enriched.marketCapUsd
                  ? formatCompact(enriched.marketCapUsd)
                  : "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleTokenChange(null)}
              className="press text-caption text-text-tertiary hover:text-text-primary"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {value && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <NumberCell
            label="Minimum balance"
            value={value.minAmount}
            suffix={value.symbol}
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
