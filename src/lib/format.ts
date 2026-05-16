/**
 * Tiny formatting helpers — shared by every screen that renders amounts,
 * counts, or timestamps. Keep them pure and dependency-free; date-fns is
 * already a project dep so we use it for relative time.
 */
import { formatDistanceToNowStrict } from "date-fns";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const USD_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const INT = new Intl.NumberFormat("en-US");

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "$1,247" (under $1) → "$0.42". Hides cents on whole-dollar amounts. */
export function formatUsd(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n == null) return "—";
  if (n > 0 && n < 1) return USD_PRECISE.format(n);
  return USD.format(n);
}

/** "1,247" — for counts, follower numbers, etc. */
export function formatInt(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n == null) return "—";
  return INT.format(Math.round(n));
}

/** "1.2K", "4.3M" — for engagement metrics. */
export function formatCompact(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n == null) return "—";
  return COMPACT.format(n);
}

/**
 * Token amounts pick precision based on magnitude:
 *   • >= 100         → integer ("250 BNTY")
 *   • >= 1           → up to 2 decimals ("1.42 SOL")
 *   • < 1            → up to 6 sig figs ("0.0421")
 *   • 0              → "0"
 */
export function formatTokenAmount(
  value: number | string | null | undefined,
): string {
  const n = toNumber(value);
  if (n == null) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100) return INT.format(Math.round(n));
  if (abs >= 1) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  // Strip trailing zeros from a fixed 6-decimal representation.
  return n.toPrecision(3).replace(/\.?0+$/, "");
}

/** "2m ago", "1h ago", "3d ago". Returns "just now" for < 30s. */
export function formatRelativeTime(
  date: Date | string | null | undefined,
): string {
  if (!date) return "—";
  const ts = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - ts.getTime();
  if (diffMs < 30_000) return "just now";
  return `${formatDistanceToNowStrict(ts, { addSuffix: false })} ago`;
}

/** "in 2h", "in 3d", "ended" — for endsAt-style countdowns. */
export function formatTimeRemaining(
  endsAt: Date | string | null | undefined,
): string {
  if (!endsAt) return "—";
  const ts = endsAt instanceof Date ? endsAt : new Date(endsAt);
  const diffMs = ts.getTime() - Date.now();
  if (diffMs <= 0) return "Ended";
  return `${formatDistanceToNowStrict(ts)} left`;
}

/**
 * Same shape as [formatTimeRemaining] but the "now" baseline is passed
 * in explicitly, so React Compiler can memoize and a parent useNow tick
 * is what drives re-renders. Use this inside render rather than the
 * Date.now() variant.
 *
 * Output composes two units so a 24-hour timer ticks visibly — "23h 41m"
 * rather than date-fns' single-unit "24 hours" / "1 day" output.
 */
export function formatTimeRemainingFrom(
  target: Date | string | null | undefined,
  now: number,
): string {
  if (!target) return "—";
  const ts = target instanceof Date ? target : new Date(target);
  const diffMs = ts.getTime() - now;
  if (diffMs <= 0) return "Ready";

  const totalSec = Math.floor(diffMs / 1000);
  const totalHours = Math.floor(totalSec / 3_600);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const minutes = Math.floor((totalSec % 3_600) / 60);
  const seconds = totalSec % 60;

  // Use "Xh Ym" up to ~2 days so a 24h timer reads as "23h 59m" rather
  // than collapsing to "1d" the moment the clock starts.
  if (totalHours >= 48) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (totalHours >= 1) {
    return minutes > 0
      ? `${totalHours}h ${minutes}m`
      : `${totalHours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Adaptive-precision USD price for tokens spanning $100 down to fractions
 * of a cent. Default `formatUsd` rounds to 2 dp, which collapses sub-cent
 * memecoins to "$0.00" — useless for both the picker info card and the
 * reward USD readouts.
 *
 *   $89.42         (price ≥ 1)
 *   $0.4521        (price ≥ 0.01)
 *   $0.000523      (price ≥ 0.0001)
 *   $5.23e-7       (anything smaller — scientific, still readable)
 */
export function formatTokenPrice(
  value: number | string | null | undefined,
): string {
  const n = toNumber(value);
  if (n == null) return "—";
  if (n === 0) return "$0";
  if (n < 0) return `-${formatTokenPrice(-n)}`;
  if (n >= 1) {
    return `$${n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

/**
 * Same idea as `formatTokenPrice` but for amounts (not unit prices) —
 * e.g. "Reward × hunters in USD". Same precision ladder; differs only
 * in that "$0" is a valid display when the math truly yields zero.
 */
export function formatUsdAdaptive(
  value: number | string | null | undefined,
): string {
  return formatTokenPrice(value);
}

/**
 * Tailwind classes for the colored-letter token fallback. Symbol
 * overrides win; otherwise we pick by token category. Caller composes
 * the rest of the circle (rounded, sizing, font, etc.).
 *
 * Phase 8.5+ uses real DexScreener logos as the primary; this helper
 * is only the soft fallback for legacy / unenriched rows.
 */
const TOKEN_SYMBOL_PALETTE: Record<string, string> = {
  USDC: "bg-blue-500/15 text-blue-300",
  USDT: "bg-emerald-500/15 text-emerald-300",
  SOL: "bg-purple-500/15 text-purple-300",
  BNTY: "bg-accent-soft text-accent-text",
};

const TOKEN_CATEGORY_PALETTE: Record<string, string> = {
  stablecoin: "bg-blue-500/15 text-blue-300",
  sol_ecosystem: "bg-green-500/15 text-green-300",
  platform: "bg-accent-soft text-accent-text",
  memecoin: "bg-orange-500/15 text-orange-300",
};

export function getTokenColorClass(
  symbol: string | null | undefined,
  category?: string | null,
): string {
  const upper = symbol?.toUpperCase();
  if (upper && TOKEN_SYMBOL_PALETTE[upper]) return TOKEN_SYMBOL_PALETTE[upper];
  if (category && TOKEN_CATEGORY_PALETTE[category]) {
    return TOKEN_CATEGORY_PALETTE[category];
  }
  return "bg-bg-elevated text-text-secondary";
}

/** "@yigo" → "@yigo"; "@reallylongusername" → "@reallylongus…". */
export function formatHandle(handle: string, maxLen = 15): string {
  const h = handle.startsWith("@") ? handle : `@${handle}`;
  if (h.length <= maxLen + 1) return h;
  return `${h.slice(0, maxLen + 1)}…`;
}

/** "Sf9G...x4xA" — Solana mints / addresses. */
export function truncateAddress(addr: string, head = 4, tail = 4): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
