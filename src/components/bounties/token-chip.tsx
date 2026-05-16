import { cn } from "@/lib/utils";
import { formatTokenAmount } from "@/lib/format";
import { TokenAvatar } from "@/components/bounties/token-avatar";
import type { TokenCategory } from "@/types/database";

/**
 * Pill chip that pairs an amount with a token symbol, colored by the
 * token's broad category (so users glance-recognize "is this a memecoin
 * play or a stable payout?").
 *
 * The mapping is intentionally narrow — bag-creator tokens reuse the
 * memecoin palette and `other` falls back to neutral. Adding a new
 * category should re-touch `globals.css` first.
 */

export type TokenChipSize = "sm" | "md";

type Props = {
  symbol: string;
  amount?: number | string | null;
  category?: TokenCategory | string | null;
  size?: TokenChipSize;
  /** Hide the amount and just show the symbol — used in activity rows. */
  symbolOnly?: boolean;
  className?: string;
  /** When present, the chip renders an inline token logo before the
   *  amount. Falls back to the category-colored text pill when null. */
  logoUrl?: string | null;
};

export function TokenChip({
  symbol,
  amount,
  category,
  size = "md",
  symbolOnly,
  className,
  logoUrl,
}: Props) {
  const palette = paletteFor(symbol, category);
  const avatarSize = size === "sm" ? 14 : 18;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] font-medium tabular-nums",
        size === "sm"
          ? "px-2 py-0.5 text-caption"
          : "px-2.5 py-1 text-small",
        palette.bg,
        palette.text,
        className,
      )}
      data-numeric
    >
      {logoUrl && (
        <TokenAvatar
          logoUrl={logoUrl}
          symbol={symbol}
          size={avatarSize}
          className="-ml-0.5"
        />
      )}
      {!symbolOnly && amount != null && (
        <span className="font-mono">{formatTokenAmount(amount)}</span>
      )}
      <span className={cn("font-medium", symbolOnly ? "" : "opacity-90")}>
        {symbol}
      </span>
    </span>
  );
}

/* =========================================================================
   Palette mapping. Symbols win when explicit; category is the fallback.
   ========================================================================= */

const SYMBOL_PALETTE: Record<string, { bg: string; text: string }> = {
  BNTY: { bg: "bg-token-platform-bg/20", text: "text-token-platform-text" },
  USDC: { bg: "bg-token-stable-bg/20", text: "text-token-stable-text" },
  USDT: { bg: "bg-token-stable-bg/20", text: "text-token-stable-text" },
  SOL: { bg: "bg-token-sol-bg/20", text: "text-token-sol-text" },
};

const CATEGORY_PALETTE: Record<string, { bg: string; text: string }> = {
  platform: { bg: "bg-token-platform-bg/20", text: "text-token-platform-text" },
  stablecoin: { bg: "bg-token-stable-bg/20", text: "text-token-stable-text" },
  sol_ecosystem: { bg: "bg-token-sol-bg/20", text: "text-token-sol-text" },
  memecoin: { bg: "bg-token-meme-bg/20", text: "text-token-meme-text" },
  bags_creator: { bg: "bg-token-meme-bg/20", text: "text-token-meme-text" },
};

const NEUTRAL = {
  bg: "bg-bg-elevated",
  text: "text-text-secondary",
};

function paletteFor(
  symbol: string,
  category: TokenCategory | string | null | undefined,
) {
  return (
    SYMBOL_PALETTE[symbol.toUpperCase()] ??
    (category ? CATEGORY_PALETTE[category] : null) ??
    NEUTRAL
  );
}

/** Exposed so callers (e.g., creator avatars) can match the palette. */
export function tokenPalette(
  symbol: string,
  category?: TokenCategory | string | null,
) {
  return paletteFor(symbol, category);
}
