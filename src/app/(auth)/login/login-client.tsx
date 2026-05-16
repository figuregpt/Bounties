"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Loader } from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   Login screen — X-only entry point.

   Auth flow (post-NextAuth):
   • Click button → `signIn('twitter', { callbackUrl })` redirects to
     Twitter's OAuth consent. Twitter redirects back to
     /api/auth/callback/twitter, NextAuth's `signIn` callback upserts
     our `users` row (twitterapi.io enrichment + smart followers).
   • Session lands; this page sees `status === 'authenticated'` and
     redirects to /discover (or /onboarding for brand-new users — we
     decide via a session flag baked in the future; for now everyone
     goes to /discover).
   ────────────────────────────────────────────────────────────────────────── */

const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;
const SOFT_SPRING = { type: "spring", stiffness: 300, damping: 22 } as const;

export function LoginClient() {
  // useSearchParams forces a CSR bailout; a Suspense boundary lets
  // Next.js shell-render the surrounding chrome while the params hook
  // hydrates client-side.
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [signingIn, setSigningIn] = useState(false);
  const callbackUrl = params?.get("callbackUrl") ?? "/discover";
  const errorParam = params?.get("error");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  const isWorking = signingIn || status === "loading";

  return (
    <div className="grid min-h-dvh place-items-center bg-bg-base px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="w-full max-w-[420px] rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-12 shadow-2xl"
      >
        {/* Logo ----------------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING, delay: 0.05 }}
          className="size-16"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bountieslogo.svg"
            alt="bounties.fm"
            width={64}
            height={64}
            className="size-16"
          />
        </motion.div>

        {/* Headline ------------------------------------------------------ */}
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.1 }}
          className="mt-7 text-[40px] font-medium leading-[1.05] tracking-[-0.01em]"
        >
          Hunt bounties, earn tokens
        </motion.h1>

        {/* Subhead ------------------------------------------------------- */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.2 }}
          className="mt-3 text-[15px] leading-relaxed text-text-secondary"
        >
          Complete Twitter actions on viral posts. Get paid in seconds.
        </motion.p>

        {/* Primary CTA --------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SOFT_SPRING, delay: 0.3 }}
          className="mt-8"
        >
          <button
            type="button"
            onClick={() => {
              setSigningIn(true);
              void signIn("twitter", { callbackUrl });
            }}
            disabled={isWorking}
            className="press flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[var(--radius-button)] bg-accent-primary px-4 font-medium text-[#100F16] transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isWorking ? (
              <>
                <Loader className="size-4 animate-spin" strokeWidth={2.25} />
                <span>Redirecting…</span>
              </>
            ) : (
              <>
                <XLogo className="size-4" />
                <span>Continue with X</span>
              </>
            )}
          </button>

          {errorParam && (
            <p className="mt-2 text-small text-danger">
              {errorMessage(errorParam)}
            </p>
          )}
        </motion.div>

        {/* Disclosures --------------------------------------------------- */}
        <ul className="mt-4 space-y-1 text-[11px] leading-snug text-text-tertiary">
          <li>· We never post on your behalf</li>
          <li>· We only read your public profile data</li>
        </ul>

        {/* Footer links -------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-10 flex items-center justify-center gap-4 border-t border-border-subtle pt-6 text-caption uppercase tracking-wider text-text-tertiary"
        >
          <FooterLink href="/legal/terms">Terms</FooterLink>
          <span className="text-text-quaternary">·</span>
          <FooterLink href="/legal/privacy">Privacy</FooterLink>
          <span className="text-text-quaternary">·</span>
          <FooterLink href="/docs">Docs</FooterLink>
        </motion.div>
      </motion.div>
    </div>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case "OAuthSignin":
    case "OAuthCallback":
      return "Twitter sign-in didn't complete. Please try again.";
    case "AccessDenied":
      return "Access denied. You must authorize the app on Twitter to continue.";
    case "Configuration":
      return "Auth is misconfigured on the server. Contact support.";
    default:
      return `Sign-in failed (${code}).`;
  }
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="transition-colors hover:text-text-secondary"
    >
      {children}
    </Link>
  );
}

function XLogo({ className }: { className?: string }) {
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
