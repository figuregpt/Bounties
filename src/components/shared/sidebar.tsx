"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Compass, LogIn, Plus, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu, type ConnectedUser } from "./user-menu";

/* ──────────────────────────────────────────────────────────────────────────
   Left sidebar — bags.fm style.

   - 64px collapsed, 220px on hover (desktop only — hidden < md).
   - Fixed left, full viewport height, z-50 so it overlays main content
     during the expand animation (main content stays at margin-left: 64px).
   - Labels fade in 100ms after the width animation starts so we never see
     text mid-clip.
   ────────────────────────────────────────────────────────────────────────── */

const COLLAPSED = 72;
const EXPANDED = 220;
const WIDTH_SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;
const MARKER_SPRING = { type: "spring", stiffness: 500, damping: 35 } as const;

export function Sidebar({ user }: { user?: ConnectedUser | null }) {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname() ?? "/";

  return (
    <motion.aside
      onHoverStart={() => setExpanded(true)}
      onHoverEnd={() => setExpanded(false)}
      animate={{ width: expanded ? EXPANDED : COLLAPSED }}
      transition={WIDTH_SPRING}
      style={{ width: COLLAPSED }}
      className="fixed inset-y-0 left-0 z-50 hidden flex-col overflow-hidden border-r border-border-subtle bg-bg-surface py-5 md:flex"
    >
      {/* ─── Logo ──────────────────────────────────────────────────────── */}
      <Link
        href="/discover"
        title="bounties.fm"
        className="press mb-10 flex items-center gap-3 px-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bountieslogo.svg"
          alt="bounties.fm"
          width={44}
          height={44}
          className="size-11 shrink-0"
        />
        <SidebarLabel show={expanded} className="text-h3 font-medium tracking-tight">
          bounties
        </SidebarLabel>
      </Link>

      {/* ─── Middle: nav items (flex-1) ────────────────────────────────── */}
      <nav className="flex flex-1 flex-col gap-2 px-3">
        <NavItem href="/discover" label="Home" icon={Compass} expanded={expanded} pathname={pathname} />
        <CreateItem expanded={expanded} />
        <NavItem href="/profile"  label="Profile"  icon={User} expanded={expanded} pathname={pathname} />
      </nav>

      {/* ─── Bottom: account ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-3">
        {user ? (
          <div className="flex h-12 items-center gap-3 rounded-[var(--radius-button)] px-2">
            <UserMenu user={user} />
            <SidebarLabel show={expanded} className="text-text-secondary">
              {user.displayName ?? `@${user.handle}`}
            </SidebarLabel>
          </div>
        ) : (
          <Link
            href="/login"
            title="Sign in"
            className="press flex h-12 items-center gap-3 rounded-[var(--radius-button)] bg-accent-primary text-[#100F16] transition-colors hover:bg-accent-hover"
          >
            <span className="grid size-12 shrink-0 place-items-center">
              <LogIn className="size-[22px]" strokeWidth={2.5} />
            </span>
            <SidebarLabel show={expanded} className="font-medium">
              Sign in
            </SidebarLabel>
          </Link>
        )}
      </div>
    </motion.aside>
  );
}

/* ────────────────────────────── nav items ───────────────────────────── */

function NavItem({
  href,
  label,
  icon: Icon,
  expanded,
  pathname,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  expanded: boolean;
  pathname: string;
}) {
  // /discover is matched exactly so it doesn't light up on every sub-route.
  // Other nav items match on prefix so nested screens keep the parent active.
  const active =
    href === "/discover"
      ? pathname === "/discover"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "relative flex h-12 items-center gap-3 rounded-[var(--radius-button)] transition-colors press",
        active
          ? "bg-accent-soft text-accent-text"
          : "text-text-secondary hover:bg-accent-soft hover:text-accent-text",
      )}
    >
      {/* Lavender edge marker — shared layoutId so it glides between items. */}
      {active && (
        <motion.span
          layoutId="sidebar-active-marker"
          transition={MARKER_SPRING}
          className="absolute -left-3 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-[4px] bg-accent-primary"
          aria-hidden
        />
      )}
      <span className="grid size-12 shrink-0 place-items-center">
        <Icon className="size-[22px]" strokeWidth={2} />
      </span>
      <SidebarLabel show={expanded}>{label}</SidebarLabel>
    </Link>
  );
}

function CreateItem({ expanded }: { expanded: boolean }) {
  // The Create CTA is always filled lavender — mirrors bags.fm's Create button.
  // No active marker; the filled state is itself the affordance.
  return (
    <Link
      href="/create"
      title="Create"
      className="press flex h-12 items-center gap-3 rounded-[var(--radius-button)] bg-accent-primary text-[#100F16] transition-colors hover:bg-accent-hover"
    >
      <span className="grid size-12 shrink-0 place-items-center">
        <Plus className="size-[22px]" strokeWidth={2.5} />
      </span>
      <SidebarLabel show={expanded} className="font-medium">
        Create
      </SidebarLabel>
    </Link>
  );
}

/* ────────────────────────────── label ───────────────────────────────── */

function SidebarLabel({
  show,
  children,
  className,
}: {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.span
      initial={false}
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ duration: 0.15, delay: show ? 0.1 : 0 }}
      aria-hidden={!show}
      className={cn("whitespace-nowrap text-body", className)}
    >
      {children}
    </motion.span>
  );
}
