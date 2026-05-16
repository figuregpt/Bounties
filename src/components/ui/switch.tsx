"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Boolean switch driven by `data-state` so transitions resolve in pure
 * CSS — no React-conditional className swap, which caused the handle to
 * occasionally stick mid-position with the old `peer-checked` /
 * `cn(translate-x-[18px], translate-x-0.5)` approach.
 *
 * The handle has exactly two positions:
 *   • off → translate-x-0.5
 *   • on  → translate-x-[18px]
 *
 * Both are written as Tailwind data-state selectors on the handle, so
 * the CSS transition interpolates cleanly between them.
 */
type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Accessible label spoken by screen readers. */
  "aria-label"?: string;
  className?: string;
};

export const Switch = React.forwardRef<HTMLButtonElement, Props>(
  function Switch(
    { checked, onChange, disabled, id, "aria-label": ariaLabel, className },
    ref,
  ) {
    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        data-state={checked ? "checked" : "unchecked"}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-[rgba(255,255,255,0.06)] transition-colors",
          "data-[state=checked]:bg-accent-primary",
          "data-[state=unchecked]:bg-bg-elevated",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span
          data-state={checked ? "checked" : "unchecked"}
          aria-hidden
          className={cn(
            "pointer-events-none inline-block size-4 rounded-full bg-white transition-transform duration-150",
            "data-[state=unchecked]:translate-x-0.5",
            "data-[state=checked]:translate-x-[18px]",
          )}
        />
      </button>
    );
  },
);
