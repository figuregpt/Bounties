"use client";

import { useSession } from "next-auth/react";

/**
 * Client-side "am I logged in?" hook. Wraps NextAuth's `useSession`.
 *
 * The DB user (with bounties, claims, wallet) is loaded server-side
 * via `getCurrentUser()` in pages; this hook is only useful for
 * client components that need to show a connect button vs an account
 * menu without waiting for a server round-trip.
 *
 * No DB call, no twitterapi.io enrichment — those happen once at sign-in
 * inside the NextAuth `signIn` callback. The session JWT carries
 * `twitterId` + `handle` straight to the client.
 */

export type AuthFlowState = {
  ready: boolean;
  authenticated: boolean;
  user:
    | {
        twitterId: string | null;
        handle: string | null;
        name: string | null | undefined;
        image: string | null | undefined;
      }
    | null;
  isLoading: boolean;
};

export function useAuthFlow(): AuthFlowState {
  const { data, status } = useSession();
  return {
    ready: status !== "loading",
    authenticated: status === "authenticated",
    user: data?.user
      ? {
          twitterId: data.user.twitterId ?? null,
          handle: data.user.handle ?? null,
          name: data.user.name,
          image: data.user.image,
        }
      : null,
    isLoading: status === "loading",
  };
}
