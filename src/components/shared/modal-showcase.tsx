"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Sparkles, Trash2, Zap } from "lucide-react";
import {
  Modal,
  ModalBody,
  ModalCancelButton,
  ModalConfirmButton,
  ModalContent,
  ModalDescription,
  ModalDetailsPanel,
  ModalFooter,
  ModalHeader,
  ModalTrigger,
} from "@/components/ui/modal";

/* ──────────────────────────────────────────────────────────────────────────
   Modal showcase — every shipped pattern (plain, with details panel,
   loading confirm, danger confirm) wired against real Radix dialogs so
   each one opens for inspection.
   ────────────────────────────────────────────────────────────────────────── */

export function ModalShowcase() {
  return (
    <div className="flex flex-wrap gap-3">
      <PlainModal />
      <DetailsModal />
      <LoadingModal />
      <DangerModal />
    </div>
  );
}

/* =========================================================================
   1. Plain — message + cancel/confirm
   ========================================================================= */

function PlainModal() {
  return (
    <Modal>
      <ModalTrigger>
        <TriggerPill icon={Sparkles}>Plain modal</TriggerPill>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader title="Discard draft?" />
        <ModalDescription>
          You&rsquo;ll lose what you&rsquo;ve typed so far. You can always start a new draft.
        </ModalDescription>
        <ModalFooter>
          <ModalCancelButton />
          <ModalConfirmButton icon={Check}>Discard</ModalConfirmButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* =========================================================================
   2. With details panel — the confirm-launch pattern in miniature
   ========================================================================= */

function DetailsModal() {
  return (
    <Modal>
      <ModalTrigger>
        <TriggerPill icon={Zap}>With details panel</TriggerPill>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader title="Launch bounty?" icon={Sparkles} />
        <ModalDescription>
          This transfers your reward pool to the bounties.fm treasury
          escrow.
        </ModalDescription>
        <ModalBody>
          <ModalDetailsPanel
            rows={[
              {
                label: "Reward pool",
                value: (
                  <>
                    5,000 USDC
                    <span className="ml-1.5 text-text-tertiary">· $5,000</span>
                  </>
                ),
              },
              { label: "Slots", value: 100 },
              { label: "Duration", value: "24 hours" },
              { label: "Platform fee", value: "5% (from each claim)" },
            ]}
          />
          <p className="text-caption text-text-tertiary">
            By launching you agree to our{" "}
            <a href="/legal/terms" className="text-accent-text">
              Terms of Service
            </a>
            .
          </p>
        </ModalBody>
        <ModalFooter>
          <ModalCancelButton />
          <ModalConfirmButton icon={Zap}>
            Launch and pay 5,000 USDC
          </ModalConfirmButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* =========================================================================
   3. Loading confirm — toggles into a loading state for ~1.5s on click
   ========================================================================= */

function LoadingModal() {
  const [phase, setPhase] = useState<"idle" | "loading">("idle");
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => setPhase("idle"), 1600);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <Modal
      onOpenChange={(open) => {
        if (!open) setPhase("idle");
      }}
    >
      <ModalTrigger>
        <TriggerPill icon={ArrowRight}>Loading confirm</TriggerPill>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader title="Submit for review?" icon={Sparkles} />
        <ModalDescription>
          Click confirm to watch the button enter its loading state —
          spinner replaces the icon, label flips, button stays lavender.
        </ModalDescription>
        <ModalFooter>
          <ModalCancelButton disabled={phase === "loading"} />
          <ModalConfirmButton
            loading={phase === "loading"}
            onClick={() => setPhase("loading")}
            icon={Sparkles}
          >
            {phase === "loading" ? "Submitting" : "Submit"}
          </ModalConfirmButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* =========================================================================
   4. Danger — destructive confirm swap to coral
   ========================================================================= */

function DangerModal() {
  return (
    <Modal>
      <ModalTrigger>
        <TriggerPill icon={Trash2}>Danger confirm</TriggerPill>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader title="Cancel bounty?" icon={Trash2} />
        <ModalDescription>
          This refunds the unclaimed pool to your wallet and removes the
          bounty from /discover. Existing hunters keep their verified
          claims.
        </ModalDescription>
        <ModalBody>
          <ModalDetailsPanel
            rows={[
              { label: "Refunded to you", value: "4,820 USDC" },
              { label: "Already paid out", value: "180 USDC" },
            ]}
          />
        </ModalBody>
        <ModalFooter>
          <ModalCancelButton>Keep running</ModalCancelButton>
          <ModalConfirmButton tone="danger" icon={Trash2}>
            Cancel and refund
          </ModalConfirmButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* =========================================================================
   Trigger pill — small surface button used as a uniform trigger.
   ========================================================================= */

function TriggerPill({
  icon: Icon,
  children,
}: {
  icon: typeof Zap;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="press inline-flex h-9 items-center gap-2 rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-bg-surface px-3.5 text-small text-text-primary transition-colors hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A1A20]"
    >
      <Icon className="size-3.5 text-text-tertiary" strokeWidth={2} />
      {children}
    </button>
  );
}
