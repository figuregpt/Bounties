import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { escrowMode } from "@/lib/solana/escrow";
import {
  getRevenueWalletPublicKeyOrNull,
  getTreasuryPublicKeyOrNull,
} from "@/lib/solana/env";
import { CreateBountyClient } from "./create-bounty-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create bounty" };

/**
 * /create — server shell. Resolves the treasury address + escrow mode
 * from env (server-only) and hands them down; the client needs the
 * treasury address to build the escrow tx but can't read env vars
 * directly (Next.js inlines only NEXT_PUBLIC_* into the browser).
 */
export default async function CreatePage() {
  const user = await requireAuth();

  return (
    <CreateBountyClient
      user={{
        handle: user.handle,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        walletAddress: user.walletAddress,
        twitterHandle: user.twitterHandle,
      }}
      escrowMode={escrowMode()}
      treasuryAddress={getTreasuryPublicKeyOrNull()}
      revenueAddress={getRevenueWalletPublicKeyOrNull()}
    />
  );
}
