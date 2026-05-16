"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Coins, Compass, Loader } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;
const SLIDE_DISTANCE = 60;

/* ──────────────────────────────────────────────────────────────────────────
   Onboarding — two screens (post-Privy).

   Screen 1: welcome with Twitter avatar (auto-advances after profile shows).
   Screen 2: how-it-works with the CTA into /discover.

   The old "wallet ready" screen is gone — wallets connect lazily on the
   first create / claim, not at sign-up.
   ────────────────────────────────────────────────────────────────────────── */

type Direction = 1 | -1;

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<Direction>(1);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // Auto-advance from screen 1 once the session has hydrated. The JWT
  // already carries name + image; no DB round-trip required.
  useEffect(() => {
    if (step !== 0) return;
    if (status === "authenticated") {
      const t = setTimeout(() => {
        setDirection(1);
        setStep(1);
      }, 1100);
      return () => clearTimeout(t);
    }
  }, [step, status]);

  const finish = () => router.replace("/discover");

  const variants = useMemo(
    () => ({
      enter: (dir: Direction) => ({
        x: dir * SLIDE_DISTANCE,
        opacity: 0,
      }),
      center: { x: 0, opacity: 1 },
      exit: (dir: Direction) => ({
        x: -dir * SLIDE_DISTANCE,
        opacity: 0,
      }),
    }),
    [],
  );

  return (
    <div className="grid min-h-dvh place-items-center bg-bg-base px-4">
      <div className="w-full max-w-[420px] space-y-6">
        <Progress step={step} />

        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-10">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={SPRING}
            >
              {step === 0 && (
                <ScreenWelcome
                  displayName={session?.user?.name ?? session?.user?.handle ?? null}
                  avatarUrl={session?.user?.image ?? null}
                  isSyncing={status === "loading"}
                />
              )}
              {step === 1 && <ScreenHowItWorks onStart={finish} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Progress dots ────────────────────────────── */

function Progress({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[0, 1].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === step ? "w-6 bg-accent-primary" : "w-1.5 bg-bg-elevated",
          )}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────── Screen 1: welcome ─────────────────────────── */

function ScreenWelcome({
  displayName,
  avatarUrl,
  isSyncing,
}: {
  displayName: string | null;
  avatarUrl: string | null;
  isSyncing: boolean;
}) {
  const initial = (displayName ?? "?").charAt(0).toUpperCase();
  return (
    <div className="space-y-5 text-center">
      <Avatar className="mx-auto size-24 border border-border-default">
        <AvatarImage src={avatarUrl ?? undefined} alt={displayName ?? ""} />
        <AvatarFallback className="bg-accent-soft text-h2 text-accent-text">
          {initial}
        </AvatarFallback>
      </Avatar>

      <div className="space-y-2">
        <h2 className="text-h2">
          Welcome{displayName ? `, ${displayName}` : ""}
        </h2>
        <p className={cn("text-body text-text-secondary", isSyncing && "shimmer")}>
          {isSyncing ? "Signing you in…" : "Your profile is ready."}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-caption uppercase text-text-tertiary">
        <Loader
          className={cn("size-3", isSyncing ? "animate-spin" : "opacity-0")}
          strokeWidth={2.25}
        />
        <span>{isSyncing ? "Connecting to X" : "Connected"}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── Screen 2: how it works ───────────────────── */

function ScreenHowItWorks({ onStart }: { onStart: () => void }) {
  const steps = [
    {
      icon: Compass,
      label: "Discover bounties",
      hint: "Browse live posts paying real tokens for engagement.",
    },
    {
      icon: XSmall,
      label: "Complete actions on Twitter",
      hint: "Like, retweet, reply or quote — exactly as the bounty asks.",
    },
    {
      icon: Coins,
      label: "Claim your rewards",
      hint: "Verification runs automatically. Connect your wallet at claim time.",
    },
  ];
  return (
    <div className="space-y-7">
      <div className="space-y-1 text-center">
        <h2 className="text-h2">How it works</h2>
        <p className="text-body text-text-secondary">
          Three steps. No friction.
        </p>
      </div>

      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border-subtle bg-bg-base p-4"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-small text-accent-text">
              {i + 1}
            </span>
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <s.icon className="size-4 text-accent-primary" />
                <span className="text-body font-medium">{s.label}</span>
              </div>
              <p className="text-small text-text-secondary">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onStart}
        className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-accent-primary px-4 font-medium text-[#100F16] transition-colors hover:bg-accent-hover"
      >
        Start hunting
        <ArrowRight className="size-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}

function XSmall({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}
