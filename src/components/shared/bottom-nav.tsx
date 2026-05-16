"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Plus, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Mobile-only bottom nav. Fixed to the viewport bottom; the (app)
   layout adds matching padding to <main> so content doesn't sit
   underneath. `pb-safe` (custom CSS in globals) tucks under the iOS
   home-bar inset.
   ────────────────────────────────────────────────────────────────────────── */

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/discover", label: "Home", icon: Compass },
  { href: "/create", label: "Create", icon: Plus },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-bg-surface/95 backdrop-blur-lg md:hidden">
      <ul className="flex h-16 items-stretch px-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/discover"
              ? pathname === "/discover" || pathname === "/"
              : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "press flex h-full flex-col items-center justify-center gap-1 py-2",
                  active ? "text-accent-text" : "text-text-tertiary",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-[12px] transition-colors",
                    active ? "bg-accent-soft" : "bg-transparent",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                </span>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    active ? "font-semibold" : "font-medium",
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
