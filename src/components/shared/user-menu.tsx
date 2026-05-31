"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Power, Settings, User as UserIcon, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownContent,
  DropdownDivider,
  DropdownHeader,
  DropdownItem,
  DropdownLinkItem,
  DropdownMenu,
  DropdownTrigger,
  DropdownTriggerAvatar,
  WalletPill,
} from "@/components/ui/dropdown";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { useEvmWallet } from "@/hooks/useEvmWallet";
import { formatHandle } from "@/lib/format";

/* ──────────────────────────────────────────────────────────────────────────
   UserMenu — Connect button (logged out) or avatar dropdown (logged in).

   Post-Privy: NextAuth handles session, wallet-adapter handles wallet.
   The dropdown shows the saved DB wallet address (the one rewards go to)
   AND a quick "Connect" affordance when none is saved yet.
   ────────────────────────────────────────────────────────────────────────── */

export type ConnectedUser = {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Persisted wallet from the DB. Null on accounts that haven't
   *  connected a wallet yet (most new sign-ups). */
  walletAddress: string | null;
};

export function UserMenu({ user }: { user?: ConnectedUser | null }) {
  const router = useRouter();
  // Both wallet stacks — a user can connect a Solana wallet (for Solana
  // bounties) and a Monad wallet (for Monad bounties) independently.
  const sol = useWalletConnection();
  const evm = useEvmWallet();

  if (!user) {
    return (
      <Button
        size="lg"
        onClick={() => router.push("/login")}
        className="press rounded-[var(--radius-button)] bg-accent-primary px-6 font-medium text-[#100F16] hover:bg-accent-hover dark:bg-accent-primary dark:text-[#100F16] dark:hover:bg-accent-hover"
      >
        Sign in
      </Button>
    );
  }

  const fallback = (user.displayName ?? user.handle)
    .replace(/^@/, "")
    .charAt(0)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownTrigger>
        <DropdownTriggerAvatar
          src={user.avatarUrl}
          alt={`@${user.handle}`}
          fallback={fallback}
          aria-label="Open account menu"
        />
      </DropdownTrigger>
      <DropdownContent className="w-64">
        <DropdownHeader>
          <div className="flex items-center gap-3">
            <DropdownTriggerAvatar
              src={user.avatarUrl}
              alt=""
              fallback={fallback}
              size={32}
              className="pointer-events-none"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-small text-text-primary">
                {user.displayName ?? formatHandle(user.handle)}
              </p>
              <p className="truncate text-caption text-text-tertiary">
                {formatHandle(user.handle)}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <WalletStatus
              label="Solana"
              dot="#14F195"
              connectedAddress={sol.address}
              isConnected={sol.isConnected}
              onConnect={sol.openConnectModal}
              onDisconnect={() => {
                void sol.disconnect();
              }}
            />
            <WalletStatus
              label="Monad"
              dot="#836EF9"
              connectedAddress={evm.address}
              isConnected={evm.isConnected}
              onConnect={evm.openConnectModal}
              onDisconnect={() => evm.disconnect()}
            />
          </div>
        </DropdownHeader>

        <DropdownLinkItem
          href={`/profile/${user.handle}`}
          icon={UserIcon}
        >
          View profile
        </DropdownLinkItem>
        <DropdownLinkItem href="/settings" icon={Settings}>
          Settings
        </DropdownLinkItem>

        <DropdownDivider />

        <DropdownItem
          variant="danger"
          icon={LogOut}
          onSelect={() => {
            void signOut({ callbackUrl: "/login" });
          }}
        >
          Sign out
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

/**
 * Live wallet status. Reflects the *currently connected* wallet via
 * wallet-adapter (the address that will sign txs), not the saved DB
 * column — that one is stale once Privy is gone. When disconnected we
 * surface a prominent CTA instead of a misleading "saved address".
 */
function WalletStatus({
  label,
  dot,
  connectedAddress,
  isConnected,
  onConnect,
  onDisconnect,
}: {
  label: string;
  dot: string;
  connectedAddress: string | null;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (isConnected && connectedAddress) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: dot }}
          title={label}
        />
        <WalletPill address={connectedAddress} />
        <button
          type="button"
          title={`Disconnect ${label} wallet`}
          aria-label={`Disconnect ${label} wallet`}
          onClick={(e) => {
            e.preventDefault();
            onDisconnect();
          }}
          className="press grid size-7 place-items-center rounded-[7px] border border-border-default bg-bg-elevated text-text-tertiary transition-colors hover:border-danger/40 hover:text-danger"
        >
          <Power className="size-3" strokeWidth={2.25} />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onConnect();
      }}
      className="press inline-flex items-center gap-1.5 rounded-[7px] border border-dashed border-accent-primary bg-accent-soft px-2.5 py-1.5 text-[11px] font-medium text-accent-text transition-colors hover:bg-accent-soft/80"
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: dot }}
      />
      <Wallet className="size-3" strokeWidth={2.25} />
      <span>Connect {label} wallet</span>
    </button>
  );
}
