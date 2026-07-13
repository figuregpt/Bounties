"use client";

import { ExternalLink, Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact, formatTokenPrice } from "@/lib/format";
import { TokenAvatar } from "@/components/bounties/token-avatar";
import type { TokenCategory } from "@/lib/tokens/enrichment";

/**
 * Read-only $ANSEM token card for /create.
 *
 * The reward token is fixed — there is no picker anymore. The parent
 * enriches the ANSEM mint on mount (live price/logo via
 * /api/tokens/enrich) and passes the result down; this card renders the
 * same logo + price + market stats the old picker's info card showed.
 */

export type SelectedToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  category: TokenCategory;
  /** Required post-strict-gating. ANSEM has a hardcoded fallback. */
  logoUrl: string;
  priceUsd: number;
  marketCapUsd: number | null;
  liquidityUsd: number;
  volume24hUsd: number;
  priceChange24hPercent: number;
  dexScreenerUrl: string;
  isAdminVerified: boolean;
  warnings?: {
    lowLiquidity: boolean;
    lowVolume: boolean;
    newToken: boolean;
    firstSeen: boolean;
  };
};

type Props = {
  token: SelectedToken | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function AnsemTokenCard({ token, loading, error, onRetry }: Props) {
  if (!token) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-4">
        {loading ? (
          <span className="inline-flex items-center gap-2 text-small text-text-tertiary">
            <Loader2 className="size-4 animate-spin" strokeWidth={2.25} />
            Loading live $ANSEM price…
          </span>
        ) : (
          <>
            <span className="text-small text-danger">
              {error ?? "Couldn't load the $ANSEM price."}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="press inline-flex items-center gap-1.5 rounded-[10px] border border-border-default px-3 py-1.5 text-small text-text-secondary hover:text-text-primary"
            >
              <RefreshCw className="size-3.5" strokeWidth={2.25} />
              Retry
            </button>
          </>
        )}
      </div>
    );
  }

  const up = token.priceChange24hPercent >= 0;
  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-4">
      <div className="flex items-start gap-3">
        <TokenAvatar
          logoUrl={token.logoUrl}
          symbol={token.symbol}
          size={40}
          isAdminVerified={token.isAdminVerified}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-body font-medium text-text-primary">
              {token.symbol}
            </span>
            <span className="truncate text-small text-text-tertiary">
              {token.name}
            </span>
            <span className="rounded-[var(--radius-pill)] bg-accent-soft px-2 py-0.5 text-caption text-accent-text">
              Reward token
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-small">
            <span
              className="font-mono tabular-nums text-text-primary"
              data-numeric
            >
              {formatTokenPrice(token.priceUsd)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-mono tabular-nums",
                up ? "text-success" : "text-danger",
              )}
              data-numeric
            >
              {up ? (
                <TrendingUp className="size-3" strokeWidth={2.25} />
              ) : (
                <TrendingDown className="size-3" strokeWidth={2.25} />
              )}
              {Math.abs(token.priceChange24hPercent).toFixed(2)}%
            </span>
          </div>
          <div className="mt-1 text-caption text-text-tertiary">
            {token.marketCapUsd != null && (
              <span>MCap ${formatCompact(token.marketCapUsd)}</span>
            )}
            {token.marketCapUsd != null && <span className="px-1">·</span>}
            <span>Liq ${formatCompact(token.liquidityUsd)}</span>
            <span className="px-1">·</span>
            <span>24h Vol ${formatCompact(token.volume24hUsd)}</span>
          </div>
        </div>
      </div>

      <p className="text-caption text-text-tertiary">
        All bounties pay out in $ANSEM.{" "}
        <a
          href={token.dexScreenerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-accent-text hover:text-accent-hover"
        >
          Check DexScreener
          <ExternalLink className="size-3" strokeWidth={2} />
        </a>
      </p>
    </div>
  );
}
