import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Bearer-token auth for cron endpoints.
 *
 * Railway cron triggers an HTTP call to the configured URL on a
 * schedule. We protect those handlers with a shared secret so a
 * stranger can't kick off a verification run by hitting the endpoint
 * directly.
 *
 * Header: `Authorization: Bearer ${CRON_SECRET}`
 *
 * If `CRON_SECRET` is unset we reject every request. In production this
 * is mandatory; locally you can set it to anything (e.g. "dev") to be
 * able to curl the endpoint while testing.
 */

export function verifyCronRequest(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_SECRET is not configured on the server",
      },
      { status: 500 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : null;

  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  return null;
}

/**
 * Constant-time string compare. Length-leak is acceptable here — the
 * secret length is known to anyone who reads this repo, the value is
 * what's secret.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
