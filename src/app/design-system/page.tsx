"use client";

import { motion } from "framer-motion";
import { Check, Zap, Heart, Repeat2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DbStatusBadge } from "@/components/shared/db-status-badge";
import { DbHealthPanel } from "@/components/shared/db-health-panel";
import { BountyShowcase } from "@/components/shared/bounty-showcase";
import { BountyDetailShowcase } from "@/components/shared/bounty-detail-showcase";
import { DropdownShowcase } from "@/components/shared/dropdown-showcase";
import { CreateFormShowcase } from "@/components/shared/create-form-showcase";
import { ModalShowcase } from "@/components/shared/modal-showcase";

/* ──────────────────────────────────────────────────────────────────────────
   /design-system — visual reference for every token in the bounties.fm system.
   Iterate freely; nothing imports from this page.
   ────────────────────────────────────────────────────────────────────────── */

const surfaces = [
  { name: "bg-base", hex: "#0E0E10", className: "bg-bg-base" },
  { name: "bg-surface", hex: "#15151A", className: "bg-bg-surface" },
  { name: "bg-elevated", hex: "#1C1C22", className: "bg-bg-elevated" },
  { name: "bg-tweet", hex: "#0E0E10", className: "bg-bg-tweet" },
];

const text = [
  { name: "text-primary", hex: "#EDEDF0", className: "text-text-primary" },
  { name: "text-secondary", hex: "#9B9BA5", className: "text-text-secondary" },
  { name: "text-tertiary", hex: "#6B6B75", className: "text-text-tertiary" },
  { name: "text-quaternary", hex: "#45454D", className: "text-text-quaternary" },
];

const accent = [
  { name: "accent-primary", hex: "#AB9FF2", className: "bg-accent-primary" },
  { name: "accent-hover", hex: "#BFB5F5", className: "bg-accent-hover" },
  { name: "accent-soft", hex: "rgba(171,159,242,0.12)", className: "bg-accent-soft" },
  { name: "accent-text", hex: "#C7BFFA", className: "bg-accent-text" },
];

const status = [
  { name: "success", hex: "#97C459", className: "bg-success" },
  { name: "success-soft", hex: "10% mix", className: "bg-success-soft" },
  { name: "warning", hex: "#FAC775", className: "bg-warning" },
  { name: "warning-soft", hex: "10% mix", className: "bg-warning-soft" },
  { name: "danger", hex: "#F09595", className: "bg-danger" },
  { name: "danger-soft", hex: "10% mix", className: "bg-danger-soft" },
];

const tokenChips = [
  { name: "Platform", example: "$BNTY", bg: "bg-token-platform-bg", text: "text-token-platform-text" },
  { name: "Stable", example: "USDC", bg: "bg-token-stable-bg", text: "text-token-stable-text" },
  { name: "SOL eco", example: "SOL", bg: "bg-token-sol-bg", text: "text-token-sol-text" },
  { name: "Meme", example: "BONK", bg: "bg-token-meme-bg", text: "text-token-meme-text" },
];

export default function DesignSystemPage() {
  return (
    <div className="min-h-dvh bg-bg-base">
      <div className="mx-auto max-w-screen-xl space-y-16 px-6 py-12">
        {/* Header */}
        <header className="space-y-4">
          <div className="space-y-2">
            <p className="text-caption uppercase text-text-tertiary">
              bounties.fm · design system
            </p>
            <h1 className="text-display">Components & tokens</h1>
            <p className="max-w-2xl text-body text-text-secondary">
              Live reference for every surface, color, typography step and component
              primitive in the app. Edit freely — nothing else imports from this page.
            </p>
          </div>
          <DbStatusBadge />
        </header>

        {/* ─────────────────────── Database health ─────────────────────────── */}
        <Section
          title="Database"
          caption="Live row counts, indexes, sample latency · /api/db-health"
        >
          <DbHealthPanel />
        </Section>

        {/* ────────────────────────── Dropdowns ────────────────────────────── */}
        <Section
          title="Dropdowns"
          caption="Shared primitive · @/components/ui/dropdown · click any trigger to open"
        >
          <DropdownShowcase />
        </Section>

        {/* ─────────────────────────── Modals ──────────────────────────────── */}
        <Section
          title="Modals"
          caption="Solid surface, no blur · @/components/ui/modal · click any trigger to open"
        >
          <ModalShowcase />
        </Section>

        {/* ───────────────────── Bounty feed components ─────────────────────── */}
        <Section
          title="Bounty feed"
          caption="Cards, eligibility, chips, empty states · fixtures only — no DB"
        >
          <BountyShowcase />
        </Section>

        {/* ───────────────────── Bounty detail components ──────────────────── */}
        <Section
          title="Bounty detail"
          caption="State machine, action checklist, reply tester, hunter list · fixtures only"
        >
          <BountyDetailShowcase />
        </Section>

        {/* ───────────────────── Create-bounty form components ─────────────── */}
        <Section
          title="Create bounty"
          caption="Form sections, tag input, distribution + duration pickers · interactive"
        >
          <CreateFormShowcase />
        </Section>

        {/* ─────────────────────────── Typography ──────────────────────────── */}
        <Section title="Typography" caption="Geist sans · Geist mono · two weights">
          <Card>
            <CardContent className="space-y-6 p-8">
              <div>
                <Label>Display · 56/500/-0.02em</Label>
                <p className="text-display">Earn tokens by claiming bounties.</p>
              </div>
              <div>
                <Label>H1 · 32/500/-0.01em</Label>
                <p className="text-h1">Active bounties</p>
              </div>
              <div>
                <Label>H2 · 24/500</Label>
                <p className="text-h2">Trending bounties</p>
              </div>
              <div>
                <Label>H3 · 18/500</Label>
                <p className="text-h3">Campaign details</p>
              </div>
              <div>
                <Label>Body · 14/400/1.5</Label>
                <p className="max-w-prose text-body">
                  Claim this bounty for a chance to earn 100 $BNTY. Like, retweet
                  and reply to qualify. Eligibility is verified asynchronously.
                </p>
              </div>
              <div>
                <Label>Small · 12/400</Label>
                <p className="text-small text-text-secondary">3 minutes ago</p>
              </div>
              <div>
                <Label>Caption · 11/500/0.04em uppercase</Label>
                <p className="text-caption uppercase text-text-tertiary">
                  Tap to verify
                </p>
              </div>
              <div>
                <Label>Mono · tabular-nums</Label>
                <p className="font-mono text-body" data-numeric>
                  $1,234.5678 SOL · 0xAB99…4F02
                </p>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ───────────────────────────── Colors ─────────────────────────────── */}
        <Section title="Surfaces & borders" caption="Layered grays, dark mode only">
          <Swatches items={surfaces} kind="surface" />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["border-subtle", "rgba(255,255,255,0.04)", "border-border-subtle"],
              ["border-default", "rgba(255,255,255,0.06)", "border-border-default"],
              ["border-hover", "rgba(255,255,255,0.10)", "border-border-hover"],
            ].map(([name, hex, cls]) => (
              <div
                key={name}
                className={`flex items-center justify-between rounded-[var(--radius-card)] border ${cls} bg-bg-surface px-4 py-3`}
              >
                <span className="text-small text-text-primary">{name}</span>
                <span className="font-mono text-small text-text-tertiary">
                  {hex}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Text" caption="Primary down to quaternary">
          <Swatches items={text} kind="text" />
        </Section>

        <Section
          title="Accent — Phantom lavender"
          caption="All CTAs use accent-primary. Hover uses accent-hover."
        >
          <Swatches items={accent} kind="surface" />
        </Section>

        <Section title="Status" caption="Success · warning · danger">
          <Swatches items={status} kind="surface" cols={3} />
        </Section>

        <Section title="Token category chips" caption="Used on activity rows">
          <div className="flex flex-wrap gap-2">
            {tokenChips.map((t) => (
              <div
                key={t.name}
                className={`flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1.5 ${t.bg}`}
              >
                <span className={`text-small font-medium ${t.text}`}>
                  {t.example}
                </span>
                <span className="text-caption uppercase text-white/70">
                  {t.name}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ──────────────────────────── Buttons ─────────────────────────────── */}
        <Section title="Buttons" caption="All variants · press spring 0.97">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-8">
              <Button className="press">Primary</Button>
              <Button variant="secondary" className="press">Secondary</Button>
              <Button variant="outline" className="press">Outline</Button>
              <Button variant="ghost" className="press">Ghost</Button>
              <Button variant="destructive" className="press">Destructive</Button>
              <Button variant="link">Link</Button>
              <Button size="sm" className="press">Small</Button>
              <Button size="lg" className="press">Large</Button>
              <Button size="icon" className="press" aria-label="Zap">
                <Zap />
              </Button>
              <Button disabled>Disabled</Button>
            </CardContent>
          </Card>
        </Section>

        {/* ────────────────────────── Card examples ─────────────────────────── */}
        <Section title="Cards" caption="14px radius · hover lifts 1.01 with spring">
          <div className="grid gap-4 md:grid-cols-2">
            <motion.div
              whileHover={{ scale: 1.01 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Bounty #1284</CardTitle>
                    <Badge className="bg-success-soft text-success">Live</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-body text-text-secondary">
                    Like, retweet and reply with #bountiesfm for a chance to earn.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-[var(--radius-pill)] bg-token-platform-bg px-2.5 py-1 text-small font-medium text-token-platform-text">
                      100 $BNTY
                    </span>
                    <span className="text-caption uppercase text-text-tertiary">
                      pool · 50,000
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-small text-text-tertiary">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-3.5" /> 1,284
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Repeat2 className="size-3.5" /> 412
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-3.5" /> 87
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <Card>
              <CardHeader>
                <CardTitle>Skeleton / loading</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-2/3 shimmer rounded-md" />
                <Skeleton className="h-4 w-1/2 shimmer rounded-md" />
                <Skeleton className="h-24 w-full shimmer rounded-[var(--radius-card)]" />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ─────────────────────────── Form inputs ──────────────────────────── */}
        <Section title="Forms" caption="Inputs · labels · accent ring on focus">
          <Card>
            <CardContent className="grid gap-4 p-8 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ds-tweet">Tweet URL</Label>
                <Input id="ds-tweet" placeholder="https://x.com/..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ds-pool">Reward pool</Label>
                <Input id="ds-pool" placeholder="50,000" inputMode="numeric" />
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ──────────────────────────── Spacing ─────────────────────────────── */}
        <Section title="Spacing" caption="4px base · Tailwind default">
          <div className="space-y-2">
            {[1, 2, 3, 4, 6, 8, 12, 16, 24].map((step) => (
              <div key={step} className="flex items-center gap-4">
                <span className="w-12 font-mono text-small text-text-tertiary">
                  {step}
                </span>
                <span
                  className="h-2 rounded-full bg-accent-soft"
                  style={{ width: `${step * 4}px` }}
                />
                <span className="font-mono text-small text-text-tertiary">
                  {step * 4}px
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ──────────────────────────── Radii ───────────────────────────────── */}
        <Section title="Radii" caption="14px cards · 10px buttons · pill chips">
          <div className="flex flex-wrap gap-4">
            {[
              { label: "button · 10px", radius: "10px" },
              { label: "card · 14px", radius: "14px" },
              { label: "pill", radius: "9999px" },
            ].map((r) => (
              <div
                key={r.label}
                className="flex h-20 w-32 items-center justify-center border border-border-default bg-bg-surface px-3"
                style={{ borderRadius: r.radius }}
              >
                <span className="text-small text-text-secondary">{r.label}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ─────────────────────────── Animations ───────────────────────────── */}
        <Section
          title="Animation"
          caption="Spring: stiffness 400, damping 30 · count-ups · shimmer 1.5s"
        >
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 p-8">
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="rounded-[var(--radius-button)] bg-accent-primary px-4 py-2 text-small font-medium text-[#0E0E10]"
              >
                Press me
              </motion.button>

              <motion.div
                whileHover={{ scale: 1.01 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="rounded-[var(--radius-card)] border border-border-default bg-bg-surface px-4 py-3"
              >
                <span className="text-small text-text-secondary">Hover lift</span>
              </motion.div>

              <div className="h-10 w-40 rounded-[var(--radius-button)] shimmer" />

              <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-success-soft px-3 py-1.5 text-small text-success">
                <Check className="size-3.5" /> Verified
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  );
}

/* ──────────────────────────── small helpers ──────────────────────────── */

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-h2">{title}</h2>
        {caption && (
          <p className="mt-1 text-small text-text-secondary">{caption}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Swatches({
  items,
  kind,
  cols = 4,
}: {
  items: { name: string; hex: string; className: string }[];
  kind: "surface" | "text";
  cols?: 3 | 4;
}) {
  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 ${cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
    >
      {items.map((it) => (
        <div
          key={it.name}
          className="overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-bg-surface"
        >
          <div
            className={`h-20 ${kind === "surface" ? it.className : "bg-bg-elevated"} grid place-items-center`}
          >
            {kind === "text" && (
              <span className={`text-h3 ${it.className}`}>Aa</span>
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-small text-text-primary">{it.name}</span>
            <span className="font-mono text-small text-text-tertiary">
              {it.hex}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
