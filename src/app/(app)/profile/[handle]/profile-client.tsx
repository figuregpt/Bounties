"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { useWalletConnection } from "@/hooks/useWalletConnection";
import { registerWallet } from "@/hooks/useBountyWallet";
import { ProfileHeader } from "@/components/profile/profile-header";
import { PendingHero } from "@/components/profile/pending-hero";
import { StatCards } from "@/components/profile/stat-cards";
import { TabRow, type ProfileTab } from "@/components/profile/tab-row";
import { ClaimList } from "@/components/profile/claim-list";
import { HuntingList } from "@/components/profile/hunting-list";
import { CreatedList } from "@/components/profile/created-list";
import { HistoryFeed } from "@/components/profile/history-feed";
import {
  ClaimAllModal,
  type ClaimAllRow,
} from "@/components/profile/claim-all-modal";
import type { ProfileData } from "@/lib/db/queries/profile";

type Props = {
  data: ProfileData;
  isOwnProfile: boolean;
  currentUserWalletAddress: string | null;
};

/**
 * Profile orchestrator. Owns:
 *   • Tab state (defaults to To claim on own profile, Created on
 *     other-user view since claim/hunting are private).
 *   • Single-row claim flow — POST /api/claims/[id]/claim-reward.
 *   • Claim-all flow — sequential single calls, with a modal that
 *     streams per-row progress.
 *   • Wallet-connect gate — both flows openConnectModal first if the
 *     user hasn't picked a Phantom/Solflare yet.
 *
 * Public (other-user) view hides the hero + To-claim + Hunting tabs;
 * those are private to the wallet owner. Stats + Created + History
 * stay visible.
 */
export function ProfileClient({
  data,
  isOwnProfile,
  currentUserWalletAddress,
}: Props) {
  const router = useRouter();
  const sol = useWalletConnection();

  const [activeTab, setActiveTab] = useState<ProfileTab>(
    isOwnProfile ? "to_claim" : "created",
  );
  const [claiming, setClaiming] = useState<Set<string>>(() => new Set());
  const [bulkRows, setBulkRows] = useState<ClaimAllRow[] | null>(null);
  // Suppress unused-var lint until we wire a "currently using wallet X"
  // copy line into the header — value is plumbed through for that
  // future tweak.
  void currentUserWalletAddress;

  /* ---- Single claim --------------------------------------------------- */
  const performClaim = useCallback(
    async (
      claimId: string,
    ): Promise<{ ok: true; signature?: string } | { ok: false; error: string }> => {
      if (!sol.isConnected || !sol.address) {
        sol.openConnectModal();
        return {
          ok: false,
          error: "Connect a Solana wallet to claim this reward.",
        };
      }
      try {
        // Register the wallet so the payout routes to it.
        await registerWallet(sol.address, sol.walletName);
        const res = await fetch(`/api/claims/${claimId}/claim-reward`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body = (await res.json()) as
          | { ok: true; tx?: { signature: string; mock: boolean } }
          | { ok: false; error: string };
        if (!res.ok || !body.ok) {
          return {
            ok: false,
            error: "error" in body ? body.error : `HTTP ${res.status}`,
          };
        }
        return { ok: true, signature: body.tx?.signature };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [sol],
  );

  const handleSingleClaim = useCallback(
    async (claimId: string) => {
      setClaiming((prev) => new Set(prev).add(claimId));
      const result = await performClaim(claimId);
      setClaiming((prev) => {
        const next = new Set(prev);
        next.delete(claimId);
        return next;
      });
      if (result.ok) router.refresh();
      else alert(result.error);
    },
    [performClaim, router],
  );

  /* ---- Claim all (sequential) ---------------------------------------- */
  const handleClaimAll = useCallback(async () => {
    // Rows frozen on a removed chain (monad/base) can't pay out — skip
    // them here; ClaimList renders them disabled with support copy.
    const claimable = data.toClaim.filter((r) => r.chain === "solana");
    if (claimable.length === 0) return;

    const initial: ClaimAllRow[] = claimable.map((row) => ({
      claimId: row.claimId,
      bountyTitle: row.bountyTitle,
      rewardAmount: row.rewardAmount,
      rewardTokenSymbol: row.rewardTokenSymbol,
      state: "pending",
    }));
    setBulkRows(initial);

    for (let i = 0; i < initial.length; i++) {
      const claimId = initial[i].claimId;
      setBulkRows((prev) =>
        prev
          ? prev.map((r) =>
              r.claimId === claimId ? { ...r, state: "claiming" } : r,
            )
          : prev,
      );
      const result = await performClaim(claimId);
      setBulkRows((prev) =>
        prev
          ? prev.map((r) =>
              r.claimId === claimId
                ? {
                    ...r,
                    state: result.ok ? "done" : "failed",
                    error: result.ok ? undefined : result.error,
                  }
                : r,
            )
          : prev,
      );
    }
  }, [data.toClaim, performClaim]);

  // Connect prompt: only when there are claimable (Solana) rewards and
  // the wallet isn't connected yet.
  const needsSolWallet =
    !sol.isConnected && data.toClaim.some((r) => r.chain === "solana");

  const closeBulk = useCallback(() => {
    setBulkRows(null);
    router.refresh();
  }, [router]);

  const bulkInFlight = bulkRows != null;

  /* ---- Tab counts ----------------------------------------------------- */
  const counts = useMemo(
    () => ({
      to_claim: data.toClaim.length,
      hunting: data.hunting.length,
      created: data.created.length,
      history: data.history.length,
    }),
    [data],
  );

  /* ---- Render --------------------------------------------------------- */
  return (
    <div className="space-y-4 sm:space-y-6">
      <ProfileHeader
        displayName={data.user.displayName}
        handle={data.user.handle}
        avatarUrl={data.user.avatarUrl}
        twitterVerified={data.user.twitterVerified}
      />

      {isOwnProfile && (
        <PendingHero
          pendingTotalUsd={data.stats.pendingTotalUsd}
          pendingCount={data.stats.pendingCount}
          isClaimingAll={bulkInFlight}
          onClaimAll={handleClaimAll}
        />
      )}

      <StatCards
        totalEarnedUsd={data.stats.totalEarnedUsd}
        bountiesDoneCount={data.stats.bountiesDoneCount}
        createdCount={data.stats.createdCount}
      />

      {isOwnProfile && needsSolWallet && (
        <ConnectPrompt
          label="Connect a Solana wallet (Phantom / Solflare) to claim your rewards."
          onConnect={sol.openConnectModal}
        />
      )}

      {/* Tabs — public view hides To-claim/Hunting tabs. */}
      <TabRow
        active={activeTab}
        counts={counts}
        visibleTabs={
          isOwnProfile
            ? undefined
            : (["created", "history"] as const)
        }
        onChange={setActiveTab}
      />

      {activeTab === "to_claim" && isOwnProfile && (
        <ClaimList
          rows={data.toClaim}
          claiming={claiming}
          bulkInFlight={bulkInFlight}
          onClaim={handleSingleClaim}
        />
      )}
      {activeTab === "hunting" && isOwnProfile && (
        <HuntingList rows={data.hunting} />
      )}
      {activeTab === "created" && (
        <CreatedList rows={data.created} isOwnProfile={isOwnProfile} />
      )}
      {activeTab === "history" && <HistoryFeed rows={data.history} />}

      <ClaimAllModal
        open={bulkInFlight}
        rows={bulkRows ?? []}
        onClose={closeBulk}
      />
    </div>
  );
}

function ConnectPrompt({
  label,
  onConnect,
}: {
  label: string;
  onConnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-accent-primary/40 bg-accent-soft px-4 py-3 text-small">
      <span className="text-accent-text">{label}</span>
      <button
        type="button"
        onClick={onConnect}
        className="press inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] bg-bg-base px-4 text-small font-medium text-accent-text hover:bg-bg-surface"
      >
        <Wallet className="size-3.5" strokeWidth={2.25} />
        Connect
      </button>
    </div>
  );
}

