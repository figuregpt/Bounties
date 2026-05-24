"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * Dismissible card on /discover that nudges hunters to join Discord
 * for new-bounty pings. Dismissal is sticky per-browser via
 * localStorage so we don't nag returning users every visit. We mount
 * hidden and only flip visible after reading localStorage to avoid a
 * flash-of-card-then-hide for users who already dismissed.
 */

const STORAGE_KEY = "bountiesfm:discord_cta_dismissed_v1";
const DISCORD_INVITE = "https://discord.gg/C8w6qC8TsS";

export function DiscordCtaCard() {
  // null = haven't checked yet, true = show, false = dismissed
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY);
      setVisible(dismissed !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode etc — fine, just hide for this session */
    }
    setVisible(false);
  };

  if (visible !== true) return null;

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative overflow-hidden rounded-[var(--radius-card)] border border-[#5865F2]/25 bg-gradient-to-r from-[#5865F2]/15 via-[#5865F2]/8 to-transparent px-4 py-3.5 sm:px-5"
      >
        <div className="flex items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[#5865F2]/20 text-[#5865F2]">
            <DiscordLogo />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-small font-medium text-text-primary">
              Get pinged when a new bounty drops
            </p>
            <p className="mt-0.5 text-caption text-text-secondary">
              Join our Discord — we post every live bounty the moment it
              goes up.
            </p>
          </div>

          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer"
            className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[#5865F2] px-4 text-small font-medium text-white transition-colors hover:bg-[#4752c4]"
          >
            <DiscordLogo className="size-4" />
            Join Discord
          </a>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss Discord invitation"
            className="press grid size-7 shrink-0 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <X className="size-3.5" strokeWidth={2.25} />
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

function DiscordLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className ?? "size-5"}
    >
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.956 2.42-2.157 2.42Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42Z" />
    </svg>
  );
}
