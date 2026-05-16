"use client";

import * as React from "react";
import { Dialog as Primitive } from "radix-ui";
import { X, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   bounties.fm modal primitive.

   Built on Radix's headless Dialog so we keep all the a11y plumbing
   (focus trap, escape to close, outside click, scroll lock) and just
   reskin it to match the login card's solid aesthetic — no backdrop
   blur, no oklch chrome.

   Composition mirrors the dropdown primitive: a single root + named
   slots that callers compose. There's also a `ModalDetailsPanel` shortcut
   for the common "label → value" summary block that confirmation
   dialogs use.
   ────────────────────────────────────────────────────────────────────────── */

/* =========================================================================
   Root + trigger
   ========================================================================= */

export function Modal(
  props: React.ComponentProps<typeof Primitive.Root>,
) {
  return <Primitive.Root {...props} />;
}

export const ModalTrigger = React.forwardRef<
  React.ElementRef<typeof Primitive.Trigger>,
  React.ComponentProps<typeof Primitive.Trigger>
>(function ModalTrigger(props, ref) {
  return <Primitive.Trigger asChild ref={ref} {...props} />;
});

/* =========================================================================
   Content — the solid card
   ========================================================================= */

type ContentProps = React.ComponentProps<typeof Primitive.Content> & {
  /** Disable the default close X in the header (useful when the modal
   *  is rendering a terminal state like "success" with a single CTA). */
  hideClose?: boolean;
};

export const ModalContent = React.forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  ContentProps
>(function ModalContent(
  { className, children, hideClose: _hideClose, ...props },
  ref,
) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay
        className={cn(
          // Solid dark backdrop, no blur — matches login card aesthetic.
          "fixed inset-0 z-50 bg-[rgba(14,14,16,0.85)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=open]:duration-200",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          "data-[state=closed]:duration-150",
        )}
      />
      <Primitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          // Surface
          "w-[calc(100%-32px)] max-w-[420px] rounded-[16px] border bg-bg-surface p-8 text-text-primary outline-none",
          "border-[rgba(255,255,255,0.06)] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]",
          // Open animation — spring-y zoom + slide
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2",
          "data-[state=open]:duration-200",
          // Close — snappier
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[state=closed]:duration-150",
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
});

/* =========================================================================
   Header — logo + title + close
   ========================================================================= */

export function ModalHeader({
  title,
  icon: Icon = Zap,
  hideClose,
  className,
}: {
  title: string;
  /** Logo glyph rendered inside the lavender square. Defaults to Zap. */
  icon?: LucideIcon;
  hideClose?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-3",
        className,
      )}
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-accent-soft text-accent-primary">
        <Icon className="size-3.5" strokeWidth={2.5} />
      </span>
      <Primitive.Title className="text-[20px] font-medium leading-tight text-text-primary">
        {title}
      </Primitive.Title>
      {!hideClose && (
        <Primitive.Close
          aria-label="Close"
          className="ml-auto grid size-7 place-items-center rounded-[8px] text-text-tertiary transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary"
        >
          <X className="size-4" strokeWidth={2} />
        </Primitive.Close>
      )}
    </div>
  );
}

/* =========================================================================
   Description — used right under the header
   ========================================================================= */

export function ModalDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Primitive.Description
      className={cn(
        "mt-4 text-small leading-relaxed text-text-secondary",
        className,
      )}
    >
      {children}
    </Primitive.Description>
  );
}

/* =========================================================================
   Body — free-form content slot
   ========================================================================= */

export function ModalBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("mt-5", className)}>{children}</div>;
}

/* =========================================================================
   Details panel — inset key/value list, the most-reused modal block
   ========================================================================= */

export type ModalDetailsRow = {
  label: React.ReactNode;
  value: React.ReactNode;
};

export function ModalDetailsPanel({
  rows,
  className,
}: {
  rows: ModalDetailsRow[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "my-5 rounded-[10px] border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.025)] px-4 py-1.5",
        className,
      )}
    >
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center justify-between gap-3 py-1.5 text-small",
            i < rows.length - 1 &&
              "border-b border-[rgba(255,255,255,0.04)]",
          )}
        >
          <span className="text-text-secondary">{row.label}</span>
          <span
            className="font-medium tabular-nums text-text-primary"
            data-numeric
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* =========================================================================
   Footer — button row
   ========================================================================= */

export function ModalFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-6 flex items-center gap-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* =========================================================================
   Standardized action buttons used in confirmation modals.
   Both styles intentionally avoid `motion` — the modal already animates
   on open; whileTap/hover scales here fight the spring on dismiss.
   ========================================================================= */

export const ModalCancelButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(function ModalCancelButton({ className, children, ...props }, ref) {
  return (
    <Primitive.Close asChild>
      <button
        ref={ref}
        type="button"
        className={cn(
          "press inline-flex h-11 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-transparent px-5 text-small text-text-secondary transition-colors",
          "hover:border-[rgba(255,255,255,0.14)] hover:text-text-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children ?? "Cancel"}
      </button>
    </Primitive.Close>
  );
});

type ConfirmTone = "primary" | "danger";

export const ModalConfirmButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    tone?: ConfirmTone;
    /** When true, swaps the leading icon for a spinner and disables the
     *  button while keeping the lavender background intact. */
    loading?: boolean;
    icon?: LucideIcon;
  }
>(function ModalConfirmButton(
  { className, children, tone = "primary", loading, icon: Icon, disabled, ...props },
  ref,
) {
  const palette = tone === "danger"
    ? "bg-danger text-[#0E0E10] hover:brightness-110"
    : "bg-accent-primary text-[#100F16] hover:bg-accent-hover";
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        "press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] px-5 text-small font-medium transition-colors",
        palette,
        // Loading state keeps the full lavender — never dim the action.
        loading && "cursor-progress",
        disabled && !loading && "cursor-not-allowed opacity-50",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner />
      ) : Icon ? (
        <Icon className="size-4" strokeWidth={2.25} />
      ) : null}
      <span>{children}</span>
    </button>
  );
});

/* =========================================================================
   Internals
   ========================================================================= */

function Spinner() {
  // Inline so we don't need lucide's Loader (already used elsewhere as
  // a strict icon — same visual, no extra import cost).
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
