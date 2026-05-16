import { AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Section wrapper for the create-bounty form. Each top-level section in
 * /create uses this: numbered title + helper text + a card body.
 *
 * `complete` shows a small green tick in the header — handy for the
 * step-by-step progressive form so the user knows what's been filled.
 *
 * `errors` renders a small list above the children when validation
 * fails — used after a 400 from POST /api/bounties so the user sees
 * exactly which field tripped the schema.
 */
export function FormSection({
  step,
  title,
  helper,
  complete,
  collapsed,
  errors,
  sectionId,
  children,
  className,
}: {
  step?: number | string;
  title: string;
  helper?: string;
  complete?: boolean;
  /** Hides the body — used for sections that are conditionally revealed. */
  collapsed?: boolean;
  errors?: string[];
  /** DOM id for scrolling to the section from the launch failure path. */
  sectionId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const hasErrors = !!errors && errors.length > 0;
  return (
    <section
      id={sectionId}
      className={cn(
        "rounded-[var(--radius-card)] border bg-bg-surface p-5 transition-opacity",
        hasErrors
          ? "border-danger/40"
          : "border-border-default",
        collapsed && "opacity-40 pointer-events-none",
        className,
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-h3 font-medium">
            {step != null && (
              <span className="font-mono text-caption uppercase tracking-wider text-text-tertiary">
                {typeof step === "number" ? `0${step}` : step}
              </span>
            )}
            {title}
          </h2>
          {helper && (
            <p className="mt-1 text-small text-text-secondary">{helper}</p>
          )}
        </div>
        {complete && !hasErrors && (
          <span className="grid size-6 place-items-center rounded-full bg-success-soft text-success">
            <Check className="size-3.5" strokeWidth={2.5} />
          </span>
        )}
        {hasErrors && (
          <span className="grid size-6 place-items-center rounded-full bg-danger/15 text-danger">
            <AlertCircle className="size-3.5" strokeWidth={2.5} />
          </span>
        )}
      </header>
      {hasErrors && (
        <ul className="mb-4 space-y-1 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] leading-snug text-danger">
          {errors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}
      {!collapsed && children}
    </section>
  );
}
