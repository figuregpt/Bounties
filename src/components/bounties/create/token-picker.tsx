"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCompact, formatTokenPrice } from "@/lib/format";
import { TokenAvatar } from "@/components/bounties/token-avatar";
import type { TokenCategory } from "@/lib/tokens/enrichment";

/**
 * Phase 8.5 token picker for /create.
 *
 * UX: paste a Solana mint address → debounce → /api/tokens/enrich.
 * Quick-picks chip row shows popular tokens (USDC/SOL/BNTY by default,
 * top-used non-flagged tokens after enough activity).
 *
 * Once a token is selected, swap the input for an info card showing
 * logo + price + market cap + warnings + DexScreener link.
 */

export type SelectedToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  category: TokenCategory;
  /** Required post-strict-gating. Enrichment rejects logoless tokens. */
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

export type QuickPickToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  category: TokenCategory | null;
  /** Quick-picks API filters out null-logo tokens. */
  logoUrl: string;
  priceUsd: number | null;
};

type Props = {
  selected: SelectedToken | null;
  onChange: (token: SelectedToken | null) => void;
};

const MINT_LIKE_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function TokenPicker({ selected, onChange }: Props) {
  const [input, setInput] = useState("");
  const [picks, setPicks] = useState<QuickPickToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Fetch quick picks once on mount.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/tokens/quick-picks", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok && Array.isArray(body.tokens)) {
          setPicks(body.tokens as QuickPickToken[]);
        }
      })
      .catch(() => {
        /* swallow — chip row is non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enrich = async (mint: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tokens/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress: mint }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        token?: SelectedToken;
        error?: string;
        errorCode?: string;
      };
      if (!res.ok || !body.ok || !body.token) {
        // Tailor the copy for the strict-gating rejection — it has a
        // concrete fix the creator can take to unblock the bounty.
        if (body.errorCode === "token_logo_missing") {
          throw new Error(
            "This token isn't fully registered on DexScreener. " +
              "It needs a logo to be usable for bounties — token " +
              "creators can add one via DexScreener's enhanced token info.",
          );
        }
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onChange(body.token);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Debounce: when the user pastes a mint-looking string, kick off
  // enrichment after 500ms idle. Anything shorter is just typing noise.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!MINT_LIKE_RE.test(trimmed)) return;
    debounceRef.current = window.setTimeout(() => {
      void enrich(trimmed);
    }, 500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  if (selected) {
    return (
      <TokenInfoCard
        token={selected}
        onClear={() => {
          onChange(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
          strokeWidth={2}
        />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste contract address (e.g. EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm)"
          className="pl-9"
          aria-label="Token contract address"
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-tertiary"
            strokeWidth={2.25}
          />
        )}
      </div>

      {error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-small text-danger">
          {error}
        </p>
      )}

      {picks.length > 0 && (
        <div>
          <p className="mb-2 text-caption uppercase tracking-wider text-text-tertiary">
            Quick picks
          </p>
          <div className="flex flex-wrap gap-2">
            {picks.map((p) => {
              // BNTY is the platform token; mint isn't live yet so the
              // chip is informational only — surface it disabled with a
              // 'Soon' badge instead of routing into enrichment.
              const isComingSoon = p.symbol.toUpperCase() === "BNTY";
              return (
                <button
                  key={p.mint}
                  type="button"
                  onClick={() => {
                    if (isComingSoon) return;
                    void enrich(p.mint);
                  }}
                  disabled={loading || isComingSoon}
                  aria-disabled={isComingSoon}
                  className={cn(
                    "press inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-border-default bg-bg-elevated px-3 py-1.5 text-small text-text-secondary transition-colors disabled:cursor-not-allowed",
                    isComingSoon
                      ? "opacity-60"
                      : "hover:border-accent-primary/40 hover:text-text-primary disabled:cursor-progress disabled:opacity-60",
                  )}
                >
                  <TokenAvatar
                    logoUrl={p.logoUrl}
                    symbol={p.symbol}
                    size={18}
                  />
                  <span className="font-medium">{p.symbol}</span>
                  {isComingSoon && (
                    <span className="rounded-[var(--radius-pill)] bg-bg-base px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Selected-token info card
   ========================================================================= */

function TokenInfoCard({
  token,
  onClear,
}: {
  token: SelectedToken;
  onClear: () => void;
}) {
  const up = token.priceChange24hPercent >= 0;
  // Soft-warning banners (low-liquidity / new-token / first-bounty)
  // were removed — they added noise on the create flow without
  // changing whether the launch could go through. The CTA disclaimer
  // below the card still tells creators to check DexScreener.
  const warnings: { kind: "amber" | "blue"; text: string }[] = [];

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
            {/* Verified state shown as the badge on the TokenAvatar. */}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-small">
            <span className="font-mono tabular-nums text-text-primary" data-numeric>
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
            {token.marketCapUsd != null && (
              <span className="px-1">·</span>
            )}
            <span>Liq ${formatCompact(token.liquidityUsd)}</span>
            <span className="px-1">·</span>
            <span>24h Vol ${formatCompact(token.volume24hUsd)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="press grid size-8 place-items-center rounded-[10px] text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          aria-label="Change token"
        >
          <X className="size-4" strokeWidth={2.25} />
        </button>
      </div>

      {warnings.map((wn, i) => (
        <p
          key={i}
          className={cn(
            "inline-flex items-start gap-2 rounded-[10px] border px-3 py-2 text-small",
            wn.kind === "amber"
              ? "border-warning/30 bg-warning/10 text-warning"
              : "border-accent-primary/30 bg-accent-soft text-accent-text",
          )}
        >
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0"
            strokeWidth={2.25}
          />
          {wn.text}
        </p>
      ))}

      <p className="text-caption text-text-tertiary">
        Always verify the contract before launching. Scammers create fake
        tokens with similar names.{" "}
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

/* TokenAvatar is now imported from @/components/bounties/token-avatar. */
