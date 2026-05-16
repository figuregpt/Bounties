"use client";

import Link from "next/link";
import { UserMenu, type ConnectedUser } from "./user-menu";

/* ──────────────────────────────────────────────────────────────────────────
   Mobile-only header. Desktop uses <Sidebar /> instead.

   Shows: logo · $BNTY balance pill · user menu (Connect → Avatar dropdown).
   ────────────────────────────────────────────────────────────────────────── */

export function Header({ user }: { user?: ConnectedUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-base/80 backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/discover" className="press flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bountieslogo.svg"
            alt="bounties.fm"
            width={28}
            height={28}
            className="size-7"
          />
          <span className="text-h3 font-medium tracking-tight">bounties</span>
        </Link>

        <div className="flex items-center gap-3">
          <BalanceChip balance={0} />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}

function BalanceChip({ balance }: { balance: number }) {
  if (balance <= 0) return null;
  return (
    <div className="rounded-[var(--radius-pill)] bg-accent-soft px-2.5 py-1 font-mono text-small tabular-nums text-accent-text">
      {balance.toLocaleString()} $BNTY
    </div>
  );
}
