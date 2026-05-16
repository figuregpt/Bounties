"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  LogOut,
  Plus,
  Settings,
  Trash2,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import {
  DropdownContent,
  DropdownDivider,
  DropdownHeader,
  DropdownItem,
  DropdownLabel,
  DropdownLinkItem,
  DropdownMenu,
  DropdownTrigger,
  DropdownTriggerAvatar,
  DropdownTriggerButton,
  WalletPill,
} from "@/components/ui/dropdown";

/* ──────────────────────────────────────────────────────────────────────────
   Dropdown showcase — every variant rendered as a real clickable
   dropdown. Click any trigger to inspect the open panel.
   ────────────────────────────────────────────────────────────────────────── */

export function DropdownShowcase() {
  const [sort, setSort] = useState<keyof typeof SORT_LABELS>("newest");

  return (
    <div className="space-y-10">
      <Group label="Triggers · click to open">
        <div className="flex flex-wrap items-center gap-3">
          {/* Sort */}
          <DropdownMenu>
            <DropdownTrigger>
              <DropdownTriggerButton label="Sort" icon={Clock}>
                {SORT_LABELS[sort]}
              </DropdownTriggerButton>
            </DropdownTrigger>
            <DropdownContent className="w-48">
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <DropdownItem
                  key={value}
                  icon={SORT_ICONS[value as keyof typeof SORT_ICONS]}
                  active={value === sort}
                  onSelect={() =>
                    setSort(value as keyof typeof SORT_LABELS)
                  }
                >
                  {label}
                </DropdownItem>
              ))}
            </DropdownContent>
          </DropdownMenu>

          {/* Filter — no label */}
          <DropdownMenu>
            <DropdownTrigger>
              <DropdownTriggerButton icon={Filter}>
                Filter
              </DropdownTriggerButton>
            </DropdownTrigger>
            <DropdownContent className="w-44">
              <DropdownItem>All bounties</DropdownItem>
              <DropdownItem active>Eligible only</DropdownItem>
              <DropdownItem>Ending soon</DropdownItem>
            </DropdownContent>
          </DropdownMenu>

          {/* Avatar + full profile menu */}
          <DropdownMenu>
            <DropdownTrigger>
              <DropdownTriggerAvatar fallback="Y" aria-label="Demo avatar" />
            </DropdownTrigger>
            <DropdownContent className="w-64">
              <DropdownHeader>
                <div className="flex items-center gap-3">
                  <DropdownTriggerAvatar
                    fallback="Y"
                    size={32}
                    className="pointer-events-none"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-small text-text-primary">yigo</p>
                    <p className="text-caption text-text-tertiary">
                      @0xyigo
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <WalletPill address="D72RkLxgnX5p5w3MmKyJxJfVnYUKuRJKKR9aXYxQ7vEU" />
                </div>
              </DropdownHeader>
              <DropdownLinkItem href="#profile" icon={UserIcon}>
                View profile
              </DropdownLinkItem>
              <DropdownLinkItem href="#settings" icon={Settings}>
                Settings
              </DropdownLinkItem>
              <DropdownLinkItem
                href="https://solscan.io"
                external
                icon={ExternalLink}
              >
                View on Solscan
              </DropdownLinkItem>
              <DropdownDivider />
              <DropdownItem variant="danger" icon={LogOut}>
                Sign out
              </DropdownItem>
            </DropdownContent>
          </DropdownMenu>
        </div>
      </Group>

      <Group label="Items · default / active / danger / disabled">
        <DropdownMenu>
          <DropdownTrigger>
            <DropdownTriggerButton icon={Wallet}>
              Token selector
            </DropdownTriggerButton>
          </DropdownTrigger>
          <DropdownContent className="w-56">
            <DropdownLabel>Whitelisted</DropdownLabel>
            <DropdownItem icon={Wallet}>USDC</DropdownItem>
            <DropdownItem icon={Wallet} active>
              BNTY
            </DropdownItem>
            <DropdownItem icon={Wallet}>SOL</DropdownItem>
            <DropdownItem icon={Plus} disabled>
              Add custom token
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem icon={Trash2} variant="danger">
              Reset filters
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </Group>

      <Group label="Header + label sections">
        <DropdownMenu>
          <DropdownTrigger>
            <DropdownTriggerButton icon={Bell}>
              Profile-style menu
            </DropdownTriggerButton>
          </DropdownTrigger>
          <DropdownContent className="w-64">
            <DropdownHeader>
              <div className="flex items-center gap-3">
                <DropdownTriggerAvatar
                  fallback="F"
                  size={32}
                  className="pointer-events-none"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-small text-text-primary">Figure</p>
                  <p className="text-caption text-text-tertiary">
                    @figuregpt
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <WalletPill address="jJoEGv42fx91V7UAwao1xAesxnPbrTaKa9SU9xHJCNk" />
              </div>
            </DropdownHeader>
            <DropdownLabel>Account</DropdownLabel>
            <DropdownItem icon={UserIcon}>View profile</DropdownItem>
            <DropdownItem icon={Settings}>Settings</DropdownItem>
            <DropdownItem icon={Bell}>Notifications</DropdownItem>
            <DropdownDivider />
            <DropdownItem icon={LogOut} variant="danger">
              Sign out
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </Group>

      <Group label="Selection · current value persists">
        <p className="text-caption text-text-tertiary">
          Selected sort: <code className="font-mono">{sort}</code>
        </p>
      </Group>
    </div>
  );
}

const SORT_LABELS = {
  newest: "Newest",
  hot: "Hot",
  ending_soon: "Ending soon",
  highest_reward: "Highest reward",
} as const;

const SORT_ICONS = {
  newest: Clock,
  hot: Flame,
  ending_soon: Clock,
  highest_reward: ArrowUpRight,
};

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-caption uppercase tracking-wider text-text-tertiary">
        {label}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
