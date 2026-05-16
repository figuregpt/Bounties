import "server-only";

/**
 * Free, auth-less "does this tweet still exist?" check via Twitter's
 * oEmbed endpoint.
 *
 *   GET https://publish.twitter.com/oembed?url=https://twitter.com/i/status/{id}
 *
 * Status semantics observed in practice:
 *   • 200  — tweet exists, JSON metadata returned
 *   • 404  — tweet deleted OR account suspended OR account private
 *   • 403  — IP-rate-limited (rare from server origins)
 *   • 5xx  — Twitter cache fault, transient
 *
 * We treat 404 as a definite "withdrawn" signal during final verification.
 * Anything else falls back to twitterapi.io (defense against false
 * positives — never fail a claim on a transient Twitter outage).
 *
 * No retries here. The caller can race a couple checks if needed.
 */

export type OembedStatus = "exists" | "deleted" | "unknown";

const ENDPOINT = "https://publish.twitter.com/oembed";
const TIMEOUT_MS = 5_000;
// Some Twitter edges 403 obvious server-side UA. A vanilla browser
// string is enough — we're not faking anything privileged, just
// avoiding the no-UA heuristic.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export async function checkTweetExists(
  tweetId: string,
): Promise<OembedStatus> {
  if (!/^\d{6,25}$/.test(tweetId)) {
    // Bad input — treat as unknown so we don't accidentally fail
    // claims on malformed data.
    return "unknown";
  }
  const url = `${ENDPOINT}?url=${encodeURIComponent(
    `https://twitter.com/i/status/${tweetId}`,
  )}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
      // Bypass any platform-level caching — we need ground truth.
      cache: "no-store",
    });
    if (res.status === 200) return "exists";
    if (res.status === 404) return "deleted";
    return "unknown";
  } catch (err) {
    console.warn(
      `[oembed] check failed for ${tweetId}:`,
      err instanceof Error ? err.message.slice(0, 120) : err,
    );
    return "unknown";
  } finally {
    clearTimeout(t);
  }
}
