"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTokenColorClass } from "@/lib/format";

/**
 * Strict-gated token avatar.
 *
 * `logoUrl` is **required** by the type system. Tokens without a logo
 * are rejected during enrichment (see [src/lib/tokens/dexscreener.ts])
 * — by the time a token row reaches this component its logo URL is
 * guaranteed to exist at the data layer.
 *
 * Runtime safety net: if the image actually fails to load at render
 * time (CDN blip, expired URL, 404), we swap to `/token-placeholder.svg`
 * — a neutral coin glyph. We deliberately do NOT fall back to a
 * letter-on-color circle, because that pattern made scam tokens look
 * identical to canonical ones.
 *
 * Use [SafeTokenAvatar] when consuming a legacy row where the database
 * value can still be null — it forwards null cases to a broken-token
 * indicator so TypeScript catches missed migrations.
 */

const PLACEHOLDER = "/token-placeholder.svg";

export type TokenAvatarProps = {
  logoUrl: string;
  symbol: string;
  size?: number;
  className?: string;
  /** Renders a small accent-colored check badge in the bottom-right. */
  isAdminVerified?: boolean;
};

export function TokenAvatar({
  logoUrl,
  symbol,
  size = 32,
  className,
  isAdminVerified,
}: TokenAvatarProps) {
  const [src, setSrc] = useState(logoUrl);
  const badgeSize = Math.max(12, Math.round(size * 0.34));

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${symbol} logo`}
        width={size}
        height={size}
        className="size-full rounded-full border border-border-subtle bg-bg-elevated object-cover"
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src !== PLACEHOLDER) setSrc(PLACEHOLDER);
        }}
      />
      {isAdminVerified && (
        <span
          className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-accent-primary text-[#100F16] ring-2 ring-bg-base"
          style={{ width: badgeSize, height: badgeSize }}
          title="Admin-verified token"
          aria-label="Admin-verified token"
        >
          <Check
            strokeWidth={3}
            style={{ width: badgeSize * 0.6, height: badgeSize * 0.6 }}
          />
        </span>
      )}
    </div>
  );
}

/**
 * Use when consuming a row whose `logoUrl` is nullable (feed JOINs that
 * may include legacy tokens, etc.). Renders the strict-gated
 * TokenAvatar when a logo is present; otherwise falls back to a
 * colored-letter circle keyed off the token symbol/category.
 *
 * The fallback is intentionally NOT the dashed-?-placeholder anymore —
 * it reads as broken UI. A first-letter circle is a known pattern that
 * still distinguishes tokens visually while we wait for enrichment to
 * fill the gap.
 */
export function SafeTokenAvatar({
  logoUrl,
  symbol,
  category,
  size = 32,
  className,
  isAdminVerified,
}: {
  logoUrl: string | null | undefined;
  symbol: string;
  category?: string | null;
  size?: number;
  className?: string;
  isAdminVerified?: boolean;
}) {
  if (logoUrl) {
    return (
      <TokenAvatar
        logoUrl={logoUrl}
        symbol={symbol}
        size={size}
        className={className}
        isAdminVerified={isAdminVerified}
      />
    );
  }
  const palette = getTokenColorClass(symbol, category);
  const badgeSize = Math.max(12, Math.round(size * 0.34));
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <div
        className={cn(
          "grid size-full place-items-center rounded-full font-mono font-medium uppercase",
          palette,
        )}
        style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}
        aria-label={`${symbol} token`}
      >
        {symbol.charAt(0)}
      </div>
      {isAdminVerified && (
        <span
          className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-accent-primary text-[#100F16] ring-2 ring-bg-base"
          style={{ width: badgeSize, height: badgeSize }}
          title="Admin-verified token"
          aria-label="Admin-verified token"
        >
          <Check
            strokeWidth={3}
            style={{ width: badgeSize * 0.6, height: badgeSize * 0.6 }}
          />
        </span>
      )}
    </div>
  );
}
