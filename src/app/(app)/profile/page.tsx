import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";

/**
 * /profile (no handle) — redirects to the current user's profile.
 *
 * Anonymous users can't land here (the (app) layout already gates
 * auth), so `requireAuth` is purely defensive: on cookie expiry race
 * it routes through /login first.
 */
export default async function ProfileIndex() {
  const user = await requireAuth();
  redirect(`/profile/${user.handle}`);
}
