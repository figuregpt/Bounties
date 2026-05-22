"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { estimateAudience } from "@/lib/bounties/audience-estimator";
import type { CreateBountyInput } from "@/lib/validation/bounty";

/**
 * Eligibility filter builder.
 *
 * Phase 6 refinement: no master "Restrict hunters?" toggle. Every input
 * is always visible; empty / 0 / off values mean "no restriction". Each
 * filter has a status hint below it that translates the current value
 * into plain English so the absence of a master toggle is still
 * unambiguous.
 *
 * Phase 6.3: smart followers is now a GLOBAL list (curated by admin via
 * `data/smart-accounts.txt`), so bounty creators only pick a minimum
 * count — they don't supply their own handles anymore. `enabled` is
 * derived inside the zod schema from `minimum > 0`.
 */
type EligibilityFilters = CreateBountyInput["eligibilityFilters"];
type SmartFollowers = NonNullable<EligibilityFilters["smartFollowers"]>;

type Props = {
  value: EligibilityFilters;
  onChange: (next: EligibilityFilters) => void;
  /** Size of the curated smart-accounts list. Surfaced in the helper
   *  text so creators understand what `minimum` filters against. The
   *  parent fetches this (or hardcodes for v1 — Phase 11 wires it to
   *  a real `SELECT COUNT(*) FROM smart_accounts` query). */
  smartAccountListSize?: number;
};

export function EligibilityFiltersBuilder({
  value,
  onChange,
  smartAccountListSize = 150,
}: Props) {
  const set = <K extends keyof EligibilityFilters>(
    key: K,
    v: EligibilityFilters[K],
  ) => onChange({ ...value, [key]: v });

  const smart: SmartFollowers = value.smartFollowers ?? { minimum: 0 };
  const smartActive = smart.minimum > 0;

  const estimate = useMemo(() => estimateAudience(value), [value]);

  return (
    <div className="space-y-4">
      <Row
        label="Min followers"
        status={
          (value.minFollowers ?? 0) > 0
            ? `${value.minFollowers!.toLocaleString()}+ followers required`
            : "Open to all follower counts"
        }
        hint="Higher threshold = better reach, smaller hunter pool."
      >
        <Input
          type="number"
          min={0}
          max={10_000_000}
          value={value.minFollowers ?? ""}
          placeholder="0"
          onChange={(e) =>
            set(
              "minFollowers",
              e.target.value === ""
                ? null
                : Math.max(0, Number(e.target.value)),
            )
          }
          className="w-40 tabular-nums"
        />
      </Row>

      <Row
        label="Require X verified"
        status={
          value.requireVerified
            ? "Verified accounts only"
            : "Open to verified and unverified"
        }
      >
        <Switch
          checked={value.requireVerified}
          onChange={(next) => set("requireVerified", next)}
          aria-label="Require X verified"
        />
      </Row>

      <Row
        label="Min account age"
        status={
          (value.minAccountAgeMonths ?? 0) > 0
            ? `Accounts ${value.minAccountAgeMonths}+ months old`
            : "Any account age"
        }
        hint="Filters out accounts created for spam."
      >
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={240}
            value={value.minAccountAgeMonths ?? ""}
            placeholder="0"
            onChange={(e) =>
              set(
                "minAccountAgeMonths",
                e.target.value === ""
                  ? null
                  : Math.max(0, Number(e.target.value)),
              )
            }
            className="w-24 tabular-nums"
          />
          <span className="text-caption text-text-tertiary">months</span>
        </div>
      </Row>

      <Row
        label="Min completed bounties"
        status={
          (value.minPreviousBounties ?? 0) > 0
            ? `${value.minPreviousBounties}+ completed bounties required`
            : "Any track record"
        }
      >
        <Input
          type="number"
          min={0}
          max={10_000}
          value={value.minPreviousBounties ?? ""}
          placeholder="0"
          onChange={(e) =>
            set(
              "minPreviousBounties",
              e.target.value === ""
                ? null
                : Math.max(0, Number(e.target.value)),
            )
          }
          className="w-24 tabular-nums"
        />
      </Row>

      <SmartFollowersBlock
        value={smart}
        active={smartActive}
        listSize={smartAccountListSize}
        onChange={(next) => set("smartFollowers", next)}
      />

      <div className="flex items-center gap-3 rounded-[10px] bg-bg-elevated px-4 py-3">
        <Users className="size-4 text-accent-text" strokeWidth={2} />
        <p className="text-small text-text-primary">{estimate.copy}</p>
      </div>
    </div>
  );
}

/* =========================================================================
   Filter row
   ========================================================================= */

function Row({
  label,
  status,
  hint,
  children,
}: {
  label: string;
  status: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-[10px] border border-border-subtle bg-bg-base px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-small text-text-primary">{label}</p>
        <p className="text-caption text-text-tertiary">{status}</p>
        {hint && (
          <p className="mt-1 text-caption text-text-quaternary">{hint}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* =========================================================================
   Smart followers — global curated list, single minimum input
   ========================================================================= */

function SmartFollowersBlock({
  value: _value,
  active: _active,
  listSize: _listSize,
  onChange: _onChange,
}: {
  value: SmartFollowers;
  active: boolean;
  listSize: number;
  onChange: (next: SmartFollowers) => void;
}) {
  return (
    <div className="rounded-[10px] border border-border-subtle bg-bg-base p-4 opacity-60">
      <div className="flex items-center gap-2">
        <p className="text-small text-text-primary">Smart followers</p>
        <span className="rounded-[var(--radius-pill)] bg-bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          Soon
        </span>
      </div>
      <p className="mt-1 text-caption text-text-tertiary">
        Gate bounties on hunters followed by N accounts from a curated
        influencer list. Coming in a later phase.
      </p>
    </div>
  );
}

