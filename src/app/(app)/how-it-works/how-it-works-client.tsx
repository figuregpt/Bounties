"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Gift,
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   /how-it-works — public explainer.

   Two parallel narratives: creators run bounties, hunters earn rewards.
   Tabs let visitors jump straight to the side that matches them. Each
   step pairs short copy with an inline mockup that reuses the site's
   design tokens so it feels native, not stock.
   ────────────────────────────────────────────────────────────────────────── */

type Role = "hunter" | "creator";

export function HowItWorksClient() {
  const [role, setRole] = useState<Role>("hunter");

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-12">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <header className="space-y-3 text-center">
        <h1 className="text-display tracking-tight">
          Raid tweets, earn tokens
        </h1>
        <p className="mx-auto max-w-lg text-body text-text-secondary">
          Solana-backed bounties for every reply, retweet, and follow.
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
  illustration: () => React.ReactElement;
};

const HUNTER_STEPS: Step[] = [
  {
    title: "Browse Discover",
    body: "Open Discover, filter by token, reward size, or time left. Each card shows the reward per hunter, slot count, and the tweet you'll engage with.",
    illustration: BountyCardMock,
  },
  {
    title: "Open the bounty, hit 'Hunt now'",
    body: "Reserving a slot locks in your payout if you complete the action. Slots are capped — the bounty fills first-come-first-served as hunters verify.",
    illustration: BountyDetailMock,
  },
  {
    title: "Complete the action on Twitter",
    body: "Reply, retweet, or follow — whatever the bounty asks. Replies usually need specific keywords; the rules panel lists them. Reply bounties only work on root tweets, not on someone else's reply.",
    illustration: TweetReplyMock,
  },
  {
    title: "Tap Verify",
    body: "We pull your reply from Twitter, check the rules, and lock in your slot. If we can't find it yet (Twitter cache lag), give it 30 seconds and retry.",
    illustration: VerifyResultMock,
  },
  {
    title: "Claim your reward",
    body: "After the bounty ends, your slot moves to your profile's Claim tab. Tap claim — the reward lands in your connected Solana wallet within seconds.",
    illustration: ClaimCenterMock,
  },
];

const CREATOR_STEPS: Step[] = [
  {
    title: "Paste a tweet URL",
    body: "It has to be a root tweet you own (or one whose engagement you're paying to amplify). Replies and quote-tweets aren't supported as bounty targets.",
    illustration: TweetCardMock,
  },
  {
    title: "Pick the actions hunters must do",
    body: "Combine any of reply, retweet, follow. For replies, set required keywords (must include), forbidden keywords, minimum length. The form previews the rules in real time.",
    illustration: RulesMock,
  },
  {
    title: "Set the reward + slots",
    body: "Choose your token (USDC, SOL, or any SPL mint), reward per hunter, and how many slots. Total pool = reward × slots. A $1 flat creation fee covers verification + infra.",
    illustration: RewardMock,
  },
  {
    title: "Sign the escrow tx",
    body: "Phantom or Solflare prompts to send the full pool + creation fee to the platform treasury. The bounty goes live as soon as the tx confirms.",
    illustration: WalletPromptMock,
  },
  {
    title: "Watch hunters fill the slots",
    body: "Real-time activity feed shows verifications as they happen — every reply, retweet, and follow lands here within seconds of confirmation on Twitter.",
    illustration: ActivityFeedMock,
  },
  {
    title: "Unclaimed slots refund to your wallet",
    body: "When the campaign ends, the completion cron audits every verified claim against Twitter (catching deleted replies) and pays out only the valid ones. Whatever's left — empty slots, withdrawn actions — gets sent back to your wallet on-chain. You only pay for the engagement you actually got.",
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
  illustration: Illustration,
}: Step & { index: number }) {
  return (
    <article className="grid gap-4 rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-5 sm:grid-cols-[1fr_280px] sm:gap-6 sm:p-6">
      <div className="space-y-2">
        <span className="inline-grid size-7 place-items-center rounded-full bg-accent-soft font-mono text-small text-accent-text">
          {index}
        </span>
        <h3 className="text-h3 font-medium">{title}</h3>
        <p className="text-small leading-relaxed text-text-secondary">{body}</p>
      </div>
      <div className="overflow-hidden rounded-[12px] bg-bg-base p-3">
        <Illustration />
      </div>
    </article>
  );
}

/* =========================================================================
   Mockups — designed to closely mirror the real product UI
   ========================================================================= */

function MockAvatar({
  letter,
  size = 24,
  tint = "accent",
}: {
  letter: string;
  size?: number;
  tint?: "accent" | "blue" | "neutral";
}) {
  const bg =
    tint === "accent"
      ? "bg-accent-soft text-accent-text"
      : tint === "blue"
        ? "bg-[#1D9BF0]/20 text-[#1D9BF0]"
        : "bg-bg-elevated text-text-secondary";
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold",
        bg,
      )}
    >
      {letter}
    </span>
  );
}

/* ─────────────────────────── Hunter mockups ────────────────────────────── */

function BountyCardMock() {
  return (
    <div className="rounded-[12px] border border-border-default bg-bg-surface p-3">
      <div className="flex items-start gap-2">
        <MockAvatar letter="F" size={26} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[11px] font-medium text-text-primary">
            <span>@figuregpt</span>
            <span className="grid size-2.5 place-items-center rounded-full bg-accent-primary text-[7px] text-[#100F16]">
              ✓
            </span>
          </div>
          <div className="text-[10px] text-text-tertiary">·  2h ago</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-token-stable-bg/20 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-token-stable-text">
          5 USDC
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-[11px] leading-snug text-text-secondary">
        Reply with your favorite Solana memecoin and a 🚀 emoji…
      </p>
      <div className="mt-2.5 flex items-center gap-2 text-[10px] text-text-tertiary">
        <span className="font-mono tabular-nums">3 / 20 slots</span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-elevated">
          <div className="h-full w-[15%] rounded-full bg-accent-primary" />
        </div>
        <span>23h left</span>
      </div>
      <button
        type="button"
        className="mt-2.5 flex h-7 w-full items-center justify-center gap-1 rounded-[var(--radius-button)] bg-accent-primary text-[10px] font-medium text-[#100F16]"
      >
        Hunt now <ArrowRight className="size-2.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function BountyDetailMock() {
  return (
    <div className="space-y-2">
      <div className="rounded-[10px] border border-border-default bg-bg-surface px-2.5 py-2">
        <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
          <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-1.5 py-0.5 font-medium text-success">
            <span className="size-1 rounded-full bg-success" /> active
          </span>
          <span>·  23h left</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] text-text-primary">
          Reply with your favorite Solana memecoin and a 🚀
        </p>
      </div>
      <div className="rounded-[10px] border border-accent-primary/40 bg-accent-soft px-3 py-2.5">
        <div className="text-[9px] uppercase tracking-wider text-accent-text/80">
          Ready to hunt
        </div>
        <div className="mt-0.5 text-[11px] text-accent-text">
          Complete the actions and claim 5 USDC.
        </div>
      </div>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--radius-button)] bg-accent-primary text-[11px] font-medium text-[#100F16]"
      >
        Hunt now <ArrowRight className="size-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function TweetReplyMock() {
  return (
    <div className="rounded-[12px] bg-black p-3 font-sans text-white">
      {/* Original tweet */}
      <div className="flex gap-2">
        <div className="flex flex-col items-center">
          <MockAvatar letter="F" tint="blue" size={28} />
          <div className="mt-1 w-px flex-1 bg-[#2F3336]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="font-semibold">figure</span>
            <span className="text-[#71767B]">@figuregpt · 2h</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug">
            Reply with your favorite Solana memecoin 🚀
          </p>
        </div>
      </div>
      {/* Reply */}
      <div className="mt-2 flex gap-2">
        <MockAvatar letter="B" size={28} tint="accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="font-semibold">bounties.fm</span>
            <span className="text-[#71767B]">@bountiesfm · now</span>
          </div>
          <div className="text-[10px] text-[#71767B]">
            Replying to <span className="text-[#1D9BF0]">@figuregpt</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug">lets go 🚀</p>
        </div>
      </div>
    </div>
  );
}

function VerifyResultMock() {
  return (
    <div className="space-y-2 rounded-[12px] border border-success/40 bg-success/10 p-3 text-center">
      <div className="mx-auto grid size-9 place-items-center rounded-full bg-success/20">
        <CheckCircle2 className="size-5 text-success" strokeWidth={2.5} />
      </div>
      <div>
        <div className="text-[11px] font-medium text-text-primary">
          Reply verified
        </div>
        <div className="mt-0.5 text-[10px] text-text-tertiary">
          Slot 4 of 20 · 5 USDC reserved
        </div>
      </div>
      <div className="inline-flex h-6 w-full items-center justify-center rounded-[var(--radius-button)] bg-bg-elevated text-[10px] font-medium text-text-secondary">
        Waiting for bounty to end
      </div>
    </div>
  );
}

function ClaimCenterMock() {
  return (
    <div className="space-y-2">
      <div className="rounded-[12px] bg-accent-primary p-3 text-[#100F16]">
        <div className="text-[9px] font-medium uppercase tracking-wider opacity-80">
          Pending rewards
        </div>
        <div className="mt-1 flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-bold leading-none">$10</div>
            <div className="mt-1 text-[9px] opacity-75">across 2 bounties</div>
          </div>
          <Gift className="size-7 opacity-60" strokeWidth={1.75} />
        </div>
        <button
          type="button"
          className="mt-2.5 flex h-7 w-full items-center justify-center gap-1 rounded-[var(--radius-pill)] bg-[#100F16] text-[10px] font-medium text-accent-primary"
        >
          Claim all
        </button>
      </div>
      <div className="rounded-[10px] border border-border-default bg-bg-surface px-2.5 py-2">
        <div className="flex items-center gap-2">
          <MockAvatar letter="$" size={20} />
          <div className="min-w-0 flex-1 text-[10px]">
            <div className="font-medium text-text-primary">@figuregpt</div>
            <div className="text-text-tertiary">Verified · 5 USDC</div>
          </div>
          <span className="rounded-[var(--radius-pill)] bg-accent-primary px-2 py-0.5 text-[9px] font-medium text-[#100F16]">
            Claim
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Creator mockups ───────────────────────────── */

function TweetCardMock() {
  return (
    <div className="rounded-[12px] bg-black p-3 font-sans text-white">
      <div className="flex items-start gap-2">
        <MockAvatar letter="B" tint="blue" size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="font-semibold">bounties.fm</span>
            <span className="grid size-3 place-items-center rounded-full bg-[#1D9BF0] text-[7px] font-bold text-white">
              ✓
            </span>
            <span className="text-[#71767B]">@bountiesfm · 5m</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug">
            Reply with your favorite Solana memecoin and a 🚀 emoji
          </p>
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-[#71767B]">
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-2.5" /> 12
        </span>
        <span className="inline-flex items-center gap-1">
          <Repeat2 className="size-2.5" /> 5
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart className="size-2.5" /> 34
        </span>
        <span className="inline-flex items-center gap-1">
          <Share2 className="size-2.5" />
        </span>
      </div>
    </div>
  );
}

function RulesMock() {
  return (
    <div className="space-y-2.5 rounded-[10px] border border-border-default bg-bg-surface p-3">
      <div>
        <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-tertiary">
          <span className="grid size-3 place-items-center rounded-full bg-success/20 text-success">
            ✓
          </span>
          Must include all of
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Chip text="lets go" tone="accent" />
          <Chip text="🚀" tone="accent" />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-tertiary">
          <span className="grid size-3 place-items-center rounded-full bg-danger/20 text-danger">
            ✕
          </span>
          Cannot include
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Chip text="scam" tone="danger" />
          <Chip text="rug" tone="danger" />
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-[6px] bg-bg-elevated px-2 py-1.5 text-[9px] text-text-tertiary">
        <span className="text-text-secondary">Min length:</span>{" "}
        <span className="font-mono tabular-nums">10 chars</span>
      </div>
    </div>
  );
}

function Chip({
  text,
  tone,
}: {
  text: string;
  tone: "accent" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-medium",
        tone === "accent"
          ? "bg-accent-soft text-accent-text"
          : "bg-danger/20 text-danger",
      )}
    >
      {text}
    </span>
  );
}

function RewardMock() {
  return (
    <div className="space-y-2 rounded-[10px] border border-border-default bg-bg-surface p-3">
      <div className="flex items-center justify-between rounded-[8px] bg-bg-elevated px-2 py-1.5">
        <span className="text-[9px] uppercase tracking-wider text-text-tertiary">
          Token
        </span>
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-token-stable-bg/20 px-2 py-0.5 text-[10px] font-medium text-token-stable-text">
          <span className="grid size-3 place-items-center rounded-full bg-token-stable-text text-[7px] font-bold text-[#0E0E10]">
            $
          </span>
          USDC
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-[8px] bg-bg-elevated p-2">
          <div className="text-[8px] uppercase tracking-wider text-text-tertiary">
            Per hunter
          </div>
          <div className="mt-0.5 font-mono text-sm font-medium text-text-primary">
            5
          </div>
        </div>
        <div className="rounded-[8px] bg-bg-elevated p-2">
          <div className="text-[8px] uppercase tracking-wider text-text-tertiary">
            Slots
          </div>
          <div className="mt-0.5 font-mono text-sm font-medium text-text-primary">
            20
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-[8px] bg-accent-soft px-2 py-1.5">
        <span className="text-[10px] font-medium text-accent-text">
          Total pool
        </span>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-accent-text">
          100 USDC · ≈ $100
        </span>
      </div>
    </div>
  );
}

function WalletPromptMock() {
  return (
    <div className="rounded-[12px] border border-[#AB9FF2]/30 bg-[#181725] p-3 text-white">
      <div className="flex items-center gap-1.5">
        <span className="grid size-5 place-items-center rounded-md bg-[#AB9FF2]">
          <span className="text-[10px] font-bold text-[#0E0E10]">P</span>
        </span>
        <span className="text-[10px] font-semibold">Phantom</span>
      </div>
      <div className="mt-2 text-[11px] font-semibold">Approve transaction</div>
      <div className="mt-2 space-y-1 rounded-[6px] bg-black/40 p-2 text-[10px]">
        <div className="flex justify-between">
          <span className="text-[#9F9CA8]">Send</span>
          <span className="font-mono tabular-nums">100 USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#9F9CA8]">Creation fee</span>
          <span className="font-mono tabular-nums">1 USDC</span>
        </div>
        <div className="border-t border-white/10 pt-1 flex justify-between font-semibold">
          <span>Total</span>
          <span className="font-mono tabular-nums">101 USDC</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button className="h-7 rounded-[6px] bg-white/10 text-[10px] font-medium">
          Reject
        </button>
        <button className="h-7 rounded-[6px] bg-[#AB9FF2] text-[10px] font-medium text-[#0E0E10]">
          Confirm
        </button>
      </div>
    </div>
  );
}

function ActivityFeedMock() {
  const rows = [
    { handle: "@degen42", amount: "5 USDC", action: "verified" },
    { handle: "@solgirl", amount: "5 USDC", action: "verified" },
    { handle: "@mooner", amount: "5 USDC", action: "claimed" },
  ];
  return (
    <div className="rounded-[10px] border border-border-default bg-bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-2.5 py-1.5">
        <span className="relative grid size-1.5 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-success/50" />
          <span className="size-1 rounded-full bg-success" />
        </span>
        <span className="text-[10px] font-medium text-text-primary">
          Live activity
        </span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-1.5 px-2 py-1.5">
            <MockAvatar letter={r.handle.charAt(1).toUpperCase()} size={16} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] text-text-primary">
                <span className="font-medium">{r.handle}</span>{" "}
                <span className="text-text-tertiary">{r.action}</span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-token-stable-bg/20 px-1.5 py-0.5 font-mono text-[9px] font-medium tabular-nums text-token-stable-text">
              {r.amount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompletedMock() {
  return (
    <div className="space-y-2">
      <div className="rounded-[10px] border border-border-default bg-bg-surface px-2.5 py-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-text-tertiary">Slots filled</span>
          <span className="font-mono font-medium tabular-nums text-text-primary">
            18 / 20
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg-elevated">
          <div className="h-full w-[90%] rounded-full bg-success" />
        </div>
        <div className="mt-1 flex items-center justify-between text-[9px] text-text-tertiary">
          <span>90 USDC paid to hunters</span>
          <span>2 unfilled</span>
        </div>
      </div>
      <div className="rounded-[12px] border border-accent-primary/40 bg-accent-soft p-3">
        <div className="flex items-center justify-between text-[10px] font-medium text-accent-text">
          <span className="flex items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded-full bg-accent-primary text-[8px] text-[#100F16]">
              ↻
            </span>
            Refunded to creator
          </span>
          <span className="font-mono text-[12px] font-semibold tabular-nums">
            10 USDC
          </span>
        </div>
        <div className="mt-1 text-[9px] text-accent-text/80">
          Sent on-chain · tx confirmed
        </div>
      </div>
    </div>
  );
}
