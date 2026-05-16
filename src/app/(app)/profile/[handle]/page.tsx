import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProfileData } from "@/lib/db/queries/profile";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).replace(/^@/, "");
  return { title: `@${handle}` };
}

/**
 * /profile/[handle] — Claim Center.
 *
 * Layout responsibilities:
 *   • Resolve the handle's profile data server-side (claims, bounties,
 *     stats — all in one round-trip via `getProfileData`).
 *   • Decide own-profile vs other-profile from the session.
 *   • Pass the typed payload to the client component, which owns tabs,
 *     claim actions, and realtime refresh.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).replace(/^@/, "");
  const data = await getProfileData(handle);
  if (!data) notFound();

  const currentUser = await getCurrentUser();
  const isOwnProfile =
    !!currentUser && currentUser.id === data.user.id;

  // Normalize URL casing: send "/profile/@Yigo" to "/profile/yigo"
  // so the canonical lowercase handle wins.
  if (data.user.handle !== rawHandle && data.user.handle !== handle) {
    redirect(`/profile/${data.user.handle}`);
  }

  return (
    <ProfileClient
      data={data}
      isOwnProfile={isOwnProfile}
      currentUserWalletAddress={currentUser?.walletAddress ?? null}
    />
  );
}
