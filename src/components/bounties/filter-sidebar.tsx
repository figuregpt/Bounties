"use client";

import { useState } from "react";
import { Filter, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/format";
import type { BountyStatus } from "@/types/database";
import {
  DEFAULT_FILTERS,
  type DiscoverFilters,
} from "./filter-types";

/* ──────────────────────────────────────────────────────────────────────────
   FilterSidebar — desktop only. Auto-applies on change; the parent owns
   filter state and re-fetches via useInfiniteBounties.

   No third-party UI primitives — we render styled native inputs so the
   bundle stays thin.
   ────────────────────────────────────────────────────────────────────────── */

type Props = {
  filters: DiscoverFilters;
  onChange: (next: DiscoverFilters) => void;
};

const STATUS_OPTIONS: { label: string; value: BountyStatus }[] = [
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

/** Canonical chip set. Symbols match `bounties.rewardTokenSymbol`; the
 *  paste-box below adds full mint addresses for arbitrary tokens. */
const TOKEN_CHIPS: { label: string; symbol: string }[] = [
  { label: "USDC", symbol: "USDC" },
  { label: "SOL", symbol: "SOL" },
];

/** Solana base58 pubkeys are 32-44 chars in their canonical encoding.
 *  Mint addresses are at the upper end of that range (always 32-byte). */
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function FilterSidebar({ filters, onChange }: Props) {
  const isDefault = isDefaultFilters(filters);

  return (
    <aside className="w-full space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-h3 font-medium">
          <Filter className="size-4 text-text-tertiary" strokeWidth={2} />
          Filters
        </h2>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="inline-flex items-center gap-1 text-caption uppercase tracking-wider text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <RotateCcw className="size-3" strokeWidth={2.25} />
            Reset
          </button>
        )}
      </header>

      <Group label="Status">
        {STATUS_OPTIONS.map((o) => (
          <CheckRow
            key={o.value}
            label={o.label}
            checked={filters.statuses.includes(o.value)}
            onChange={(v) =>
              onChange({
                ...filters,
                statuses: v
                  ? [...filters.statuses, o.value]
                  : filters.statuses.filter((s) => s !== o.value),
              })
            }
          />
        ))}
      </Group>

      <Group label="Network">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: undefined, label: "All", dot: null },
              { value: "solana", label: "Solana", dot: "#14F195" },
              { value: "monad", label: "Monad", dot: "#836EF9" },
            ] as const
          ).map((o) => {
            const active = filters.chain === o.value;
            return (
              <button
                key={o.label}
                type="button"
                onClick={() => onChange({ ...filters, chain: o.value })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-1.5 text-small transition-colors",
                  active
                    ? "border-accent-primary bg-accent-soft text-accent-text"
                    : "border-border-default text-text-tertiary hover:text-text-secondary",
                )}
              >
                {o.dot && (
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: o.dot }}
                  />
                )}
                {o.label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group label="Reward token">
        <TokenFilter
          selected={filters.rewardTokens}
          onChange={(rewardTokens) =>
            onChange({ ...filters, rewardTokens })
          }
        />
      </Group>

      <Group label="Min per hunter">
        <div className="space-y-2">
          <p
            className="font-mono text-small text-text-primary tabular-nums"
            data-numeric
          >
            {filters.minRewardPerHunterUsd > 0
              ? formatUsd(filters.minRewardPerHunterUsd)
              : "Any"}
          </p>
          <input
            type="range"
            min={0}
            max={500}
            step={5}
            value={filters.minRewardPerHunterUsd}
            onChange={(e) =>
              onChange({
                ...filters,
                minRewardPerHunterUsd: Number(e.target.value),
              })
            }
            className="w-full accent-accent-primary"
          />
          <div className="flex justify-between text-caption text-text-tertiary">
            <span>$0</span>
            <span>$500+</span>
          </div>
        </div>
      </Group>


      <Group label="Show ineligible">
        <SwitchRow
          checked={filters.showIneligible}
          onChange={(v) =>
            onChange({ ...filters, showIneligible: v })
          }
          hint="Show bounties you don't qualify for"
        />
      </Group>

      <Group label="Show filled">
        <SwitchRow
          checked={filters.showFilled}
          onChange={(v) => onChange({ ...filters, showFilled: v })}
          hint="Include bounties whose slots are already full"
        />
      </Group>
    </aside>
  );
}

/* =========================================================================
   Primitives
   ========================================================================= */

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-button)] px-1 py-1 hover:bg-bg-elevated">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent-primary"
      />
      <span className="text-small text-text-secondary">{label}</span>
    </label>
  );
}

function SwitchRow({
  checked,
  onChange,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-button)] px-1 py-1.5">
      <span className="space-y-0.5">
        <span className="block text-small text-text-secondary">
          {checked ? "On" : "Off"}
        </span>
        {hint && (
          <span className="block text-caption text-text-tertiary">{hint}</span>
        )}
      </span>
      <Switch checked={checked} onChange={onChange} aria-label="Toggle filter" />
    </div>
  );
}

function isDefaultFilters(f: DiscoverFilters): boolean {
  return (
    f.statuses.length === 1 &&
    f.statuses[0] === "active" &&
    f.rewardTokens.length === 0 &&
    f.minRewardPerHunterUsd === 0 &&
    f.showIneligible === DEFAULT_FILTERS.showIneligible &&
    f.showFilled === DEFAULT_FILTERS.showFilled &&
    f.sortBy === "newest"
  );
}

/**
 * Reward-token picker. Two canonical chips (USDC, SOL) + a paste box
 * for arbitrary mint addresses. Selected mints render as chips below
 * the input with an X to remove. The server matches by symbol OR
 * mint, so canonical chips and pasted mints share one list.
 */
function TokenFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggleSymbol = (sym: string) => {
    onChange(
      selected.includes(sym)
        ? selected.filter((s) => s !== sym)
        : [...selected, sym],
    );
  };
  const tryAddMint = () => {
    const v = draft.trim();
    if (!v) return;
    if (!MINT_PATTERN.test(v)) {
      setError("That doesn't look like a Solana mint address.");
      return;
    }
    if (selected.includes(v)) {
      setError("Already added.");
      return;
    }
    onChange([...selected, v]);
    setDraft("");
    setError(null);
  };

  // Custom-mint chips = anything in selected that isn't one of the
  // canonical symbols. Renders below the input so users see what they
  // pasted and can pop them off.
  const canonicalSet = new Set(TOKEN_CHIPS.map((t) => t.symbol));
  const customMints = selected.filter((s) => !canonicalSet.has(s));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {TOKEN_CHIPS.map((t) => {
          const active = selected.includes(t.symbol);
          return (
            <button
              key={t.symbol}
              type="button"
              onClick={() => toggleSymbol(t.symbol)}
              className={cn(
                "press rounded-[var(--radius-pill)] px-3 py-1 text-caption font-medium transition-colors",
                active
                  ? "bg-accent-soft text-accent-text"
                  : "bg-bg-elevated text-text-secondary hover:text-text-primary",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              tryAddMint();
            }
          }}
          onBlur={() => {
            if (draft.trim()) tryAddMint();
          }}
          placeholder="Paste mint address or symbol"
          className="h-9 text-small"
        />
        {error && <p className="text-caption text-warning">{error}</p>}
      </div>

      {customMints.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {customMints.map((mint) => (
            <li
              key={mint}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-accent-soft px-2.5 py-1 text-caption text-accent-text"
            >
              <span className="font-mono tabular-nums" data-numeric>
                {mint.slice(0, 4)}…{mint.slice(-4)}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange(selected.filter((s) => s !== mint))
                }
                aria-label={`Remove ${mint}`}
                className="press grid size-4 place-items-center rounded-full text-accent-text/70 hover:text-accent-text"
              >
                <X className="size-3" strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
