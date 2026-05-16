import { redirect } from "next/navigation";

/**
 * Root route — there's no marketing landing in V1. Everyone goes
 * straight into /discover; the (app) layout handles auth gating
 * (redirects to /login if the session cookie is missing).
 */
export default function RootIndex() {
  redirect("/discover");
}
