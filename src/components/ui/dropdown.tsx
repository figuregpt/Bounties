"use client";

import * as React from "react";
import Link from "next/link";
import { DropdownMenu as Primitive } from "radix-ui";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   bounties.fm dropdown primitive.

   One styled wrapper around Radix's headless dropdown-menu, locked to
   the design system so every dropdown in the app — sort selector, user
   menu, share menu, future filter pickers — renders identically.

   The Radix bits we *keep* (no re-exports needed elsewhere):
     • keyboard navigation (arrow keys, enter, type-ahead)
     • focus management (returns to trigger on close)
     • click-outside + escape to close
     • single-open invariant across the app

   The bits we *add*:
     • visual spec: surface color, radius, shadow, padding rhythm
     • animation: scale + fade + slide from top via data-state attributes
     • DropdownItem variants (default / active / danger / disabled)
     • DropdownHeader for free-form rich content (used by UserMenu)
     • two ready-made triggers (DropdownTriggerButton, DropdownTriggerAvatar)
   ────────────────────────────────────────────────────────────────────────── */

/* =========================================================================
   Root + trigger + portal
   ========================================================================= */

export function DropdownMenu(
  props: React.ComponentProps<typeof Primitive.Root>,
) {
  return <Primitive.Root {...props} />;
}

export const DropdownTrigger = React.forwardRef<
  React.ElementRef<typeof Primitive.Trigger>,
  React.ComponentProps<typeof Primitive.Trigger>
>(function DropdownTrigger(props, ref) {
  // `asChild` is the default — callers pass their own button/link and we
  // forward props without nesting a second <button>.
  return <Primitive.Trigger asChild ref={ref} {...props} />;
});

/* =========================================================================
   Content (the floating panel)
   ========================================================================= */

type DropdownContentProps = React.ComponentProps<typeof Primitive.Content>;

export const DropdownContent = React.forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  DropdownContentProps
>(function DropdownContent(
  { className, sideOffset = 6, align = "end", ...props },
  ref,
) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          // Surface
          "z-50 min-w-[180px] overflow-hidden rounded-[12px] border bg-bg-surface p-[5px] text-text-primary shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]",
          "border-[rgba(255,255,255,0.06)]",
          // Open animation — 200ms spring-ish via tw-animate-css
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=open]:duration-200",
          // Direction-aware slide (Radix sets data-side)
          "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
          // Close animation — snappier
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[state=closed]:duration-150",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
});

/* =========================================================================
   Item
   ========================================================================= */

type DropdownItemVariant = "default" | "active" | "danger" | "disabled";

type DropdownItemProps = Omit<
  React.ComponentProps<typeof Primitive.Item>,
  "asChild"
> & {
  variant?: DropdownItemVariant;
  /** Quick path for active state without passing `variant="active"` everywhere. */
  active?: boolean;
  icon?: LucideIcon;
  /** Renders a check on the right (auto-on for variant="active"/active prop). */
  showCheckOnActive?: boolean;
  /** Right-aligned slot (kbd shortcuts, badges, etc). Defaults to the check
   *  when the row is active. */
  trailing?: React.ReactNode;
  asChild?: boolean;
};

export const DropdownItem = React.forwardRef<
  React.ElementRef<typeof Primitive.Item>,
  DropdownItemProps
>(function DropdownItem(
  {
    className,
    children,
    variant = "default",
    active,
    icon: Icon,
    showCheckOnActive = true,
    trailing,
    asChild,
    disabled,
    ...props
  },
  ref,
) {
  const isActive = active || variant === "active";
  const effectiveVariant: DropdownItemVariant = disabled
    ? "disabled"
    : isActive
      ? "active"
      : variant;

  const palette = paletteFor(effectiveVariant);

  return (
    <Primitive.Item
      ref={ref}
      asChild={asChild}
      disabled={disabled}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-[11px] rounded-[8px] px-[11px] py-[9px] text-small outline-none transition-colors",
        palette.base,
        palette.hover,
        palette.focus,
        effectiveVariant === "disabled" && "cursor-not-allowed opacity-40",
        className,
      )}
      {...props}
    >
      {asChild ? (
        (children as React.ReactNode)
      ) : (
        <>
          {Icon && (
            <Icon
              className={cn("size-4 shrink-0", palette.icon)}
              strokeWidth={2}
            />
          )}
          <span className="flex-1 truncate">{children}</span>
          {trailing ??
            (isActive && showCheckOnActive ? (
              <Check className="size-3.5 shrink-0 text-accent-text" strokeWidth={2.5} />
            ) : null)}
        </>
      )}
    </Primitive.Item>
  );
});

function paletteFor(variant: DropdownItemVariant) {
  switch (variant) {
    case "active":
      return {
        base: "bg-[rgba(171,159,242,0.08)] text-accent-text",
        hover: "hover:bg-[rgba(171,159,242,0.12)]",
        focus: "focus:bg-[rgba(171,159,242,0.12)]",
        icon: "text-accent-text",
      };
    case "danger":
      return {
        base: "text-danger",
        hover: "hover:bg-[rgba(226,75,74,0.06)]",
        focus: "focus:bg-[rgba(226,75,74,0.06)]",
        icon: "text-danger",
      };
    case "disabled":
      return {
        base: "text-text-tertiary",
        hover: "",
        focus: "",
        icon: "text-text-tertiary",
      };
    default:
      return {
        base: "text-text-primary",
        hover: "hover:bg-[rgba(255,255,255,0.04)]",
        focus: "focus:bg-[rgba(255,255,255,0.04)]",
        icon: "text-text-secondary",
      };
  }
}

/* =========================================================================
   Header / Divider / Label
   ========================================================================= */

export function DropdownHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-[5px] border-b border-[rgba(255,255,255,0.04)] px-[11px] pb-[9px] pt-[11px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownDivider({ className }: { className?: string }) {
  return (
    <Primitive.Separator
      className={cn(
        "my-[5px] h-px bg-[rgba(255,255,255,0.04)]",
        className,
      )}
    />
  );
}

export function DropdownLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Primitive.Label
      className={cn(
        "px-[11px] pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.06em] text-text-tertiary",
        className,
      )}
    >
      {children}
    </Primitive.Label>
  );
}

/* =========================================================================
   Convenience trigger #1 — button with label + value + chevron
   ========================================================================= */

type TriggerButtonProps = React.ComponentProps<"button"> & {
  /** Small gray text shown before the value, e.g. "Sort". */
  label?: string;
  icon?: LucideIcon;
};

/**
 * Used with `<DropdownTrigger asChild>` — Radix forwards `data-state` to
 * the underlying button. We mark the button as `group/trigger` so the
 * chevron and border can react to that state without callers passing
 * the open flag manually.
 */
export const DropdownTriggerButton = React.forwardRef<
  HTMLButtonElement,
  TriggerButtonProps
>(function DropdownTriggerButton(
  { className, label, icon: Icon, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "group/trigger press inline-flex h-9 items-center gap-2 rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-bg-surface px-3.5 text-small text-text-primary transition-colors",
        "hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A1A20]",
        "data-[state=open]:border-accent-soft",
        className,
      )}
      {...props}
    >
      {Icon && (
        <Icon className="size-3.5 text-text-tertiary" strokeWidth={2} />
      )}
      {label && <span className="text-text-tertiary">{label}</span>}
      <span className="font-medium">{children}</span>
      <ChevronDown
        className="size-3 text-text-tertiary transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
        strokeWidth={2.25}
      />
    </button>
  );
});

/* =========================================================================
   Convenience trigger #2 — avatar with hover ring
   ========================================================================= */

export const DropdownTriggerAvatar = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    src?: string | null;
    alt?: string;
    fallback?: string;
    size?: number;
  }
>(function DropdownTriggerAvatar(
  { className, src, alt = "", fallback, size = 32, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      style={{ width: size, height: size }}
      className={cn(
        "press relative inline-grid place-items-center overflow-hidden rounded-full bg-accent-soft text-accent-text outline-none transition-shadow",
        "hover:shadow-[0_0_0_2px_rgba(171,159,242,0.3)] focus-visible:shadow-[0_0_0_2px_rgba(171,159,242,0.5)]",
        className,
      )}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-small font-medium uppercase">
          {fallback ?? "?"}
        </span>
      )}
    </button>
  );
});

/* =========================================================================
   Wallet address pill — used inside DropdownHeader for the profile menu.
   Lives here so every "wallet in a menu" looks the same.
   ========================================================================= */

export function WalletPill({
  address,
  className,
}: {
  address: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const truncated = `${address.slice(0, 4)}…${address.slice(-4)}`;

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard denied */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "press inline-flex items-center gap-1.5 rounded-[7px] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-text-secondary transition-colors hover:bg-[rgba(255,255,255,0.06)]",
        className,
      )}
      data-numeric
    >
      <span>{truncated}</span>
      {copied ? (
        <Check className="size-3 text-success" strokeWidth={2.5} />
      ) : (
        <CopyGlyph />
      )}
    </button>
  );
}

function CopyGlyph() {
  // Tiny inline copy icon — matches lucide's `Copy` but locked to 12px so
  // the pill stays compact regardless of the lucide bundle's stroke width.
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="opacity-70"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/* =========================================================================
   Item-as-link helper. Wraps Next's <Link> so callers can write:
       <DropdownLinkItem href="/settings" icon={Settings}>Settings</DropdownLinkItem>
   without the Radix `asChild` boilerplate.
   ========================================================================= */

export function DropdownLinkItem({
  href,
  external,
  ...rest
}: Omit<DropdownItemProps, "asChild"> & {
  href: string;
  external?: boolean;
}) {
  if (external) {
    return (
      <DropdownItem asChild {...rest}>
        <a href={href} target="_blank" rel="noreferrer" className="contents">
          <LinkInner {...rest} />
        </a>
      </DropdownItem>
    );
  }
  return (
    <DropdownItem asChild {...rest}>
      <Link href={href} className="contents">
        <LinkInner {...rest} />
      </Link>
    </DropdownItem>
  );
}

function LinkInner({
  icon: Icon,
  active,
  variant,
  trailing,
  children,
  showCheckOnActive = true,
}: DropdownItemProps) {
  const isActive = active || variant === "active";
  const palette = paletteFor(
    isActive ? "active" : variant === "danger" ? "danger" : "default",
  );
  return (
    <>
      {Icon && (
        <Icon
          className={cn("size-4 shrink-0", palette.icon)}
          strokeWidth={2}
        />
      )}
      <span className="flex-1 truncate">{children}</span>
      {trailing ??
        (isActive && showCheckOnActive ? (
          <Check className="size-3.5 shrink-0 text-accent-text" strokeWidth={2.5} />
        ) : null)}
    </>
  );
}
