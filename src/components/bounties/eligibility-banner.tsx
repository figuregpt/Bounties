import { Check, CircleAlert, Info, ShieldCheck, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EligibilityResult } from "@/lib/bounties/eligibility";

/**
 * Eligibility banner rendered on every bounty card and the detail view.
 *
 * Two density variants:
 *   • "card"   → inline single row in the feed card
 *   • "detail" → vertical checklist for the bounty detail screen
 *
 * When there are zero filters (`requirements.length === 0`) we skip the
 * banner entirely — there's nothing to verify, and showing a generic
 * "Open to everyone" pill would just add visual noise.
 */

type Props = {
  eligibility: EligibilityResult;
  variant?: "card" | "detail";
  className?: string;
};

export function EligibilityBanner({
  eligibility,
  variant = "card",
  className,
}: Props) {
  if (eligibility.requirements.length === 0) return null;
  return variant === "card" ? (
    <CardVariant eligibility={eligibility} className={className} />
  ) : (
    <DetailVariant eligibility={eligibility} className={className} />
  );
}

/* =========================================================================
   Card variant — inline single row
   ========================================================================= */

function CardVariant({
  eligibility,
  className,
}: {
  eligibility: EligibilityResult;
  className?: string;
}) {
  const { eligible, requirements, summary } = eligibility;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[10px] border px-3 py-2",
        eligible
          ? "border-success/15 bg-success-soft"
          : "border-warning/15 bg-warning-soft",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {eligible ? (
          <ShieldCheck
            className="size-3.5 text-success"
            strokeWidth={2.25}
          />
        ) : (
          <CircleAlert
            className="size-3.5 text-warning"
            strokeWidth={2.25}
          />
        )}
        <span
          className={cn(
            "text-caption font-medium uppercase tracking-wider",
            eligible ? "text-success" : "text-warning",
          )}
        >
          {eligible ? "Eligible" : summary}
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {requirements.map((r) => (
          <li
            key={r.key}
            className="inline-flex items-center gap-1 text-caption text-text-secondary"
          >
            {r.deferred ? (
              <Info className="size-3 text-text-tertiary" strokeWidth={2.5} />
            ) : r.met ? (
              <Check className="size-3 text-success" strokeWidth={2.5} />
            ) : (
              <X className="size-3 text-warning" strokeWidth={2.5} />
            )}
            <span>{r.requiredLabel}</span>
            {(r.deferred || !r.met) && (
              <span className="text-text-tertiary">· {r.actualLabel}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* =========================================================================
   Detail variant — full checklist
   ========================================================================= */

function DetailVariant({
  eligibility,
  className,
}: {
  eligibility: EligibilityResult;
  className?: string;
}) {
  const { eligible, requirements } = eligibility;
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border bg-bg-base",
        eligible
          ? "border-success/15"
          : "border-warning/15",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-3",
          eligible
            ? "border-success/15 text-success"
            : "border-warning/15 text-warning",
        )}
      >
        {eligible ? (
          <ShieldCheck className="size-4" strokeWidth={2.25} />
        ) : (
          <CircleAlert className="size-4" strokeWidth={2.25} />
        )}
        <span className="text-small font-medium">
          {eligible
            ? "You're eligible for this bounty"
            : eligibility.summary}
        </span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {requirements.map((r) => (
          <li
            key={r.key}
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-small"
          >
            <div className="flex items-center gap-2">
              {r.deferred ? (
                r.key === "holder_token" ? (
                  <Wallet
                    className="size-3.5 text-text-tertiary"
                    strokeWidth={2.25}
                  />
                ) : (
                  <Info
                    className="size-3.5 text-text-tertiary"
                    strokeWidth={2.25}
                  />
                )
              ) : r.met ? (
                <Check className="size-3.5 text-success" strokeWidth={2.5} />
              ) : (
                <X className="size-3.5 text-warning" strokeWidth={2.5} />
              )}
              <span className="text-text-primary">{r.label}</span>
              <span className="text-text-tertiary">· {r.requiredLabel}</span>
            </div>
            <span
              className={cn(
                "text-caption",
                r.deferred
                  ? "text-text-tertiary"
                  : r.met
                  ? "text-text-tertiary"
                  : "text-warning",
              )}
            >
              {r.actualLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
