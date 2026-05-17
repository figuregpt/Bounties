import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginClient } from "./login-client";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Server-side guard: if the DB row exists, this is a returning user
  // with a real session — shortcut straight to wherever they came from.
  // If `getCurrentUser` returns null (e.g. DB wiped, NextAuth cookie
  // stale, or first-time visitor), we render LoginClient so the button
  // is visible and the OAuth round-trip can refresh the session.
  const user = await getCurrentUser();
  if (user) {
    const raw = (await searchParams).callbackUrl;
    const callbackUrl = typeof raw === "string" ? raw : "/discover";
    redirect(callbackUrl);
  }
  return <LoginClient />;
}
