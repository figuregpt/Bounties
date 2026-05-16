"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Eye,
  Flame,
  Hourglass,
  PartyPopper,
  Send,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   /how-it-works — public explainer.

   Two parallel narratives: creators run bounties, hunters earn rewards.
   Tabs let visitors jump straight to the side that matches them. Each
   step pairs short copy with an inline SVG mockup that reuses the site's
   design tokens so it feels native, not stock.
   ────────────────────────────────────────────────────────────────────────── */

type Role = "hunter" | "creator";

export function HowItWorksClient() {
  const [role, setRole] = useState<Role>("hunter");

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-12">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <header className="space-y-3 text-center">
        <p className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-accent-soft px-3 py-1 text-caption font-medium uppercase tracking-wider text-accent-text">
          <Sparkles className="size-3" strokeWidth={2.5} />
          How it works
        </p>
        <h1 className="text-display tracking-tight">
          Token rewards for Twitter engagement
        </h1>
        <p className="mx-auto max-w-xl text-body text-text-secondary">
          Creators escrow rewards on their tweets. Hunters complete the
          required actions — replies, retweets, follows — and earn payouts on
          Solana. Everything settles on-chain.
        </p>
      </header>

      {/* ─── Role switcher ────────────────────────────────────────────── */}
      <div className="flex justify-center">
        <div className="inline-flex gap-1 rounded-[var(--radius-pill)] bg-bg-elevated p-1">
          <RoleTab active={role === "hunter"} onClick={() => setRole("hunter")}>
            For hunters
          </RoleTab>
          <RoleTab
            active={role === "creator"}
            onClick={() => setRole("creator")}
          >
            For creators
          </RoleTab>
        </div>
      </div>

      {/* ─── Steps ────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={role}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="space-y-4"
        >
          {(role === "hunter" ? HUNTER_STEPS : CREATOR_STEPS).map((s, i) => (
            <StepCard key={i} index={i + 1} {...s} />
          ))}
        </motion.div>
      </AnimatePresence>

      {/* ─── CTA footer ───────────────────────────────────────────────── */}
      <div className="rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-6 text-center">
        <h2 className="text-h2 font-medium">
          {role === "hunter" ? "Ready to hunt?" : "Want to launch a bounty?"}
        </h2>
        <p className="mt-2 text-body text-text-secondary">
          {role === "hunter"
            ? "Pick a bounty on Discover and complete the action on Twitter."
            : "Paste a tweet URL, set rules + reward, and you're live in 60 seconds."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Link
            href={role === "hunter" ? "/discover" : "/create"}
            className="press inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-button)] bg-accent-primary px-5 text-small font-medium text-[#100F16] transition-colors hover:bg-accent-hover"
          >
            {role === "hunter" ? "Open Discover" : "Create a bounty"}
            <ArrowRight className="size-3.5" strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Step content
   ========================================================================= */

type Step = {
  title: string;
  body: string;
  icon: LucideIcon;
  illustration: () => React.ReactElement;
};

const HUNTER_STEPS: Step[] = [
  {
    title: "Browse Discover",
    body: "Open Discover, filter by token, reward size, or time left. Each card shows the reward per hunter, slot count, and the tweet you'll engage with.",
    icon: Eye,
    illustration: BountyCardMock,
  },
  {
    title: "Open the bounty, hit 'Hunt now'",
    body: "Reserving a slot locks in your payout if you complete the action. Slots are capped — the bounty fills first-come-first-served as hunters verify.",
    icon: Flame,
    illustration: BountyDetailMock,
  },
  {
    title: "Complete the action on Twitter",
    body: "Reply, retweet, or follow — whatever the bounty asks. Replies usually need specific keywords; the rules panel lists them. Reply bounties only work on root tweets, not on someone else's reply.",
    icon: Send,
    illustration: TweetReplyMock,
  },
  {
    title: "Tap Verify",
    body: "We pull your reply from Twitter, check the rules, and lock in your slot. If we can't find it yet (Twitter cache lag), give it 30 seconds and retry.",
    icon: CheckCircle2,
    illustration: VerifyResultMock,
  },
  {
    title: "Claim your reward",
    body: "After the bounty ends, your slot moves to your profile's Claim tab. Tap claim — the reward lands in your connected Solana wallet within seconds.",
    icon: Coins,
    illustration: ClaimCenterMock,
  },
];

const CREATOR_STEPS: Step[] = [
  {
    title: "Paste a tweet URL",
    body: "It has to be a root tweet you own (or one whose engagement you're paying to amplify). Replies and quote-tweets aren't supported as bounty targets.",
    icon: Send,
    illustration: TweetCardMock,
  },
  {
    title: "Pick the actions hunters must do",
    body: "Combine any of reply, retweet, follow. For replies, set required keywords (must include), forbidden keywords, minimum length. The form previews the rules in real time.",
    icon: Sparkles,
    illustration: RulesMock,
  },
  {
    title: "Set the reward + slots",
    body: "Choose your token (USDC, SOL, or any SPL mint), reward per hunter, and how many slots. Total pool = reward × slots. A $1 flat creation fee covers verification + infra.",
    icon: Coins,
    illustration: RewardMock,
  },
  {
    title: "Sign the escrow tx",
    body: "Phantom or Solflare prompts to send the full pool + creation fee to the platform treasury. The bounty goes live as soon as the tx confirms.",
    icon: Wallet,
    illustration: WalletPromptMock,
  },
  {
    title: "Watch hunters fill the slots",
    body: "Real-time activity feed shows verifications as they happen. When the bounty ends, unclaimed rewards refund to your wallet automatically via the completion cron.",
    icon: Hourglass,
    illustration: ActivityFeedMock,
  },
  {
    title: "Done — campaign closed",
    body: "Final verification re-checks every claim against Twitter (detects deletions) before payouts settle. You see the analytics on the bounty page; hunters see the reward in their Claim tab.",
    icon: PartyPopper,
    illustration: CompletedMock,
  },
];

/* =========================================================================
   Components
   ========================================================================= */

function RoleTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press relative rounded-[var(--radius-pill)] px-5 py-2 text-small font-medium transition-colors",
        active ? "text-accent-text" : "text-text-secondary hover:text-text-primary",
      )}
    >
      {active && (
        <motion.span
          layoutId="how-tab-pill"
          className="absolute inset-0 -z-10 rounded-[var(--radius-pill)] bg-accent-soft"
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
        />
      )}
      {children}
    </button>
  );
}

function StepCard({
  index,
  title,
  body,
  icon: Icon,
  illustration: Illustration,
}: Step & { index: number }) {
  return (
    <article className="grid gap-4 rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-5 sm:grid-cols-[1fr_240px] sm:gap-6 sm:p-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-accent-soft font-mono text-small text-accent-text">
            {index}
          </span>
          <Icon className="size-4 text-text-tertiary" strokeWidth={2.25} />
        </div>
        <h3 className="text-h3 font-medium">{title}</h3>
        <p className="text-small leading-relaxed text-text-secondary">{body}</p>
      </div>
      <div className="rounded-[12px] bg-bg-base p-3 sm:p-4">
        <Illustration />
      </div>
    </article>
  );
}

/* =========================================================================
   SVG mockups — site UI
   ========================================================================= */

function BountyCardMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#1A1A22" />
      <rect x="10" y="10" width="200" height="44" rx="8" fill="#23232E" />
      <circle cx="22" cy="32" r="9" fill="#A89BFF" opacity="0.4" />
      <rect x="36" y="22" width="80" height="6" rx="3" fill="#E8E8EE" opacity="0.7" />
      <rect x="36" y="34" width="120" height="5" rx="2.5" fill="#7A7A8C" opacity="0.6" />
      <rect x="10" y="64" width="200" height="64" rx="8" fill="#1F1F28" />
      <rect x="20" y="74" width="60" height="6" rx="3" fill="#A89BFF" />
      <rect x="20" y="86" width="100" height="5" rx="2.5" fill="#7A7A8C" opacity="0.6" />
      <rect x="20" y="100" width="50" height="14" rx="7" fill="#3C3458" />
      <rect x="28" y="104" width="34" height="6" rx="3" fill="#C8BFFF" />
      <rect x="148" y="100" width="56" height="14" rx="7" fill="#A89BFF" />
      <rect x="158" y="104" width="36" height="6" rx="3" fill="#1A1A22" />
    </svg>
  );
}

function BountyDetailMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#1A1A22" />
      <rect x="10" y="10" width="200" height="40" rx="8" fill="#23232E" />
      <rect x="20" y="18" width="60" height="6" rx="3" fill="#E8E8EE" opacity="0.7" />
      <rect x="20" y="30" width="140" height="5" rx="2.5" fill="#7A7A8C" opacity="0.6" />
      <rect x="10" y="58" width="200" height="36" rx="8" fill="#1F1F28" />
      <rect x="20" y="68" width="50" height="6" rx="3" fill="#7A7A8C" opacity="0.6" />
      <rect x="20" y="80" width="90" height="6" rx="3" fill="#E8E8EE" opacity="0.7" />
      <rect x="10" y="102" width="200" height="26" rx="8" fill="#A89BFF" />
      <rect x="76" y="112" width="68" height="6" rx="3" fill="#1A1A22" />
      <polygon points="158,115 162,112 162,118" fill="#1A1A22" />
    </svg>
  );
}

function TweetReplyMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#000" />
      <circle cx="22" cy="22" r="9" fill="#1D9BF0" opacity="0.6" />
      <rect x="36" y="14" width="60" height="6" rx="3" fill="#fff" opacity="0.9" />
      <rect x="36" y="24" width="40" height="5" rx="2.5" fill="#71767B" />
      <rect x="36" y="40" width="170" height="5" rx="2.5" fill="#E7E9EA" opacity="0.85" />
      <rect x="36" y="50" width="140" height="5" rx="2.5" fill="#E7E9EA" opacity="0.85" />
      <line x1="22" y1="32" x2="22" y2="78" stroke="#2F3336" strokeWidth="2" />
      <circle cx="22" cy="86" r="9" fill="#A89BFF" />
      <rect x="36" y="78" width="60" height="6" rx="3" fill="#fff" opacity="0.9" />
      <rect x="36" y="88" width="40" height="5" rx="2.5" fill="#71767B" />
      <rect x="36" y="104" width="160" height="5" rx="2.5" fill="#E7E9EA" opacity="0.9" />
      <rect x="36" y="114" width="110" height="5" rx="2.5" fill="#E7E9EA" opacity="0.9" />
    </svg>
  );
}

function VerifyResultMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#1A1A22" />
      <circle cx="110" cy="48" r="22" fill="#2BB36A" opacity="0.2" />
      <circle cx="110" cy="48" r="14" fill="#2BB36A" />
      <path
        d="M104 48 L109 53 L117 43"
        stroke="#0E0E10"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="50" y="84" width="120" height="6" rx="3" fill="#E8E8EE" />
      <rect x="40" y="100" width="140" height="5" rx="2.5" fill="#7A7A8C" opacity="0.6" />
      <rect x="62" y="116" width="96" height="14" rx="7" fill="#3C3458" />
      <rect x="76" y="120" width="68" height="6" rx="3" fill="#C8BFFF" />
    </svg>
  );
}

function ClaimCenterMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#1A1A22" />
      <rect x="10" y="10" width="200" height="62" rx="10" fill="#A89BFF" />
      <rect x="22" y="22" width="80" height="6" rx="3" fill="#1A1A22" />
      <rect x="22" y="34" width="60" height="14" rx="3" fill="#1A1A22" />
      <rect x="22" y="56" width="50" height="5" rx="2.5" fill="#1A1A22" opacity="0.7" />
      <rect x="138" y="46" width="60" height="18" rx="9" fill="#1A1A22" />
      <rect x="152" y="52" width="34" height="6" rx="3" fill="#A89BFF" />
      <rect x="10" y="82" width="95" height="48" rx="8" fill="#1F1F28" />
      <rect x="20" y="92" width="60" height="6" rx="3" fill="#E8E8EE" opacity="0.6" />
      <rect x="20" y="104" width="40" height="14" rx="3" fill="#E8E8EE" />
      <rect x="115" y="82" width="95" height="48" rx="8" fill="#1F1F28" />
      <rect x="125" y="92" width="60" height="6" rx="3" fill="#E8E8EE" opacity="0.6" />
      <rect x="125" y="104" width="40" height="14" rx="3" fill="#E8E8EE" />
    </svg>
  );
}

function TweetCardMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#000" />
      <circle cx="26" cy="26" r="12" fill="#1D9BF0" opacity="0.6" />
      <rect x="44" y="16" width="70" height="6" rx="3" fill="#fff" opacity="0.9" />
      <rect x="44" y="28" width="50" height="5" rx="2.5" fill="#71767B" />
      <rect x="16" y="50" width="188" height="5" rx="2.5" fill="#E7E9EA" opacity="0.9" />
      <rect x="16" y="62" width="160" height="5" rx="2.5" fill="#E7E9EA" opacity="0.9" />
      <rect x="16" y="74" width="120" height="5" rx="2.5" fill="#E7E9EA" opacity="0.9" />
      <rect x="16" y="96" width="50" height="5" rx="2.5" fill="#71767B" />
      <rect x="80" y="96" width="50" height="5" rx="2.5" fill="#71767B" />
      <rect x="144" y="96" width="50" height="5" rx="2.5" fill="#71767B" />
      <rect x="16" y="116" width="188" height="14" rx="7" fill="#1D9BF0" opacity="0.85" />
      <rect x="92" y="121" width="36" height="4" rx="2" fill="#000" />
    </svg>
  );
}

function RulesMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#1A1A22" />
      <rect x="10" y="12" width="120" height="6" rx="3" fill="#E8E8EE" />
      <rect x="10" y="32" width="60" height="14" rx="7" fill="#3C3458" />
      <rect x="20" y="36" width="40" height="6" rx="3" fill="#C8BFFF" />
      <rect x="78" y="32" width="60" height="14" rx="7" fill="#23232E" />
      <rect x="88" y="36" width="40" height="6" rx="3" fill="#7A7A8C" />
      <rect x="10" y="58" width="80" height="5" rx="2.5" fill="#7A7A8C" />
      <rect x="10" y="72" width="44" height="14" rx="7" fill="#2BB36A" opacity="0.2" />
      <rect x="20" y="76" width="24" height="6" rx="3" fill="#2BB36A" />
      <rect x="62" y="72" width="44" height="14" rx="7" fill="#2BB36A" opacity="0.2" />
      <rect x="72" y="76" width="24" height="6" rx="3" fill="#2BB36A" />
      <rect x="10" y="96" width="80" height="5" rx="2.5" fill="#7A7A8C" />
      <rect x="10" y="110" width="44" height="14" rx="7" fill="#E25C5C" opacity="0.2" />
      <rect x="20" y="114" width="24" height="6" rx="3" fill="#E25C5C" />
      <rect x="62" y="110" width="34" height="14" rx="7" fill="#E25C5C" opacity="0.2" />
      <rect x="72" y="114" width="14" height="6" rx="3" fill="#E25C5C" />
    </svg>
  );
}

function RewardMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#1A1A22" />
      <rect x="10" y="12" width="200" height="36" rx="8" fill="#23232E" />
      <rect x="20" y="22" width="80" height="6" rx="3" fill="#7A7A8C" />
      <rect x="20" y="34" width="56" height="8" rx="3" fill="#E8E8EE" />
      <text x="180" y="36" fontFamily="monospace" fontSize="11" fill="#2BB36A" fontWeight="600">USDC</text>
      <rect x="10" y="58" width="200" height="36" rx="8" fill="#23232E" />
      <rect x="20" y="68" width="60" height="6" rx="3" fill="#7A7A8C" />
      <rect x="20" y="80" width="44" height="8" rx="3" fill="#E8E8EE" />
      <text x="170" y="82" fontFamily="monospace" fontSize="11" fill="#A89BFF" fontWeight="600">slots</text>
      <rect x="10" y="104" width="200" height="22" rx="8" fill="#3C3458" />
      <rect x="20" y="111" width="60" height="6" rx="3" fill="#C8BFFF" />
      <text x="150" y="119" fontFamily="monospace" fontSize="11" fill="#A89BFF" fontWeight="600">≈ $50.00</text>
    </svg>
  );
}

function WalletPromptMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#0E0E10" />
      <rect x="20" y="20" width="180" height="100" rx="12" fill="#1A1A22" />
      <rect x="32" y="32" width="14" height="14" rx="3" fill="#AB9FF2" />
      <rect x="50" y="35" width="60" height="6" rx="3" fill="#E8E8EE" />
      <rect x="32" y="56" width="156" height="5" rx="2.5" fill="#7A7A8C" />
      <rect x="32" y="68" width="120" height="5" rx="2.5" fill="#7A7A8C" />
      <rect x="32" y="88" width="64" height="20" rx="8" fill="#23232E" />
      <rect x="48" y="94" width="32" height="6" rx="3" fill="#E8E8EE" opacity="0.6" />
      <rect x="104" y="88" width="84" height="20" rx="8" fill="#AB9FF2" />
      <rect x="124" y="94" width="44" height="6" rx="3" fill="#0E0E10" />
    </svg>
  );
}

function ActivityFeedMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#1A1A22" />
      <rect x="10" y="10" width="200" height="22" rx="8" fill="#23232E" />
      <circle cx="22" cy="21" r="3" fill="#2BB36A">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <rect x="32" y="18" width="80" height="6" rx="3" fill="#E8E8EE" opacity="0.8" />
      {[42, 64, 86, 108].map((y, i) => (
        <g key={i}>
          <rect x="10" y={y} width="200" height="20" rx="6" fill="#1F1F28" />
          <circle cx="22" cy={y + 10} r="6" fill="#A89BFF" opacity="0.5" />
          <rect x="34" y={y + 6} width="70" height="5" rx="2.5" fill="#E8E8EE" opacity="0.7" />
          <rect x="34" y={y + 14} width="50" height="3" rx="1.5" fill="#7A7A8C" />
          <rect x="166" y={y + 6} width="36" height="10" rx="5" fill="#2BB36A" opacity="0.2" />
          <rect x="174" y={y + 9} width="20" height="4" rx="2" fill="#2BB36A" />
        </g>
      ))}
    </svg>
  );
}

function CompletedMock() {
  return (
    <svg viewBox="0 0 220 140" className="w-full">
      <rect x="0" y="0" width="220" height="140" rx="10" fill="#1A1A22" />
      <circle cx="110" cy="42" r="18" fill="#A89BFF" opacity="0.2" />
      <circle cx="110" cy="42" r="11" fill="#A89BFF" />
      <text
        x="110"
        y="47"
        fontFamily="sans-serif"
        fontSize="14"
        fontWeight="700"
        fill="#1A1A22"
        textAnchor="middle"
      >
        ✓
      </text>
      <rect x="42" y="74" width="136" height="7" rx="3.5" fill="#E8E8EE" />
      <rect x="36" y="90" width="148" height="5" rx="2.5" fill="#7A7A8C" />
      <rect x="36" y="108" width="68" height="18" rx="8" fill="#23232E" />
      <rect x="48" y="113" width="44" height="6" rx="3" fill="#E8E8EE" opacity="0.6" />
      <rect x="114" y="108" width="68" height="18" rx="8" fill="#3C3458" />
      <rect x="124" y="113" width="48" height="6" rx="3" fill="#C8BFFF" />
    </svg>
  );
}
