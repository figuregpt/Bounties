import { ImageResponse } from "next/og";
import { getBountyBySlug } from "@/lib/db/queries/bounties";
import { formatTokenAmount } from "@/lib/format";

/**
 * Dynamic OG image per bounty. Twitter / Discord / Telegram preview
 * cards pull this when somebody shares the bounty URL.
 *
 * Edge runtime would be faster but our Drizzle/postgres-js DB driver
 * only runs on Node, so we serve from `nodejs`. Cache for 60s so a
 * thousand re-shares don't all re-query the DB + token logo.
 */

export const runtime = "nodejs";
export const revalidate = 60;
export const alt = "Bounty on bounties.fm";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BountyOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bounty = await getBountyBySlug(slug, null);

  if (!bounty) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: "#0E0E10",
            color: "#EDEDF0",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui",
            fontSize: 72,
            fontWeight: 500,
          }}
        >
          bounties.fm
        </div>
      ),
      size,
    );
  }

  const reward = formatTokenAmount(bounty.rewardPerHunter);
  const symbol = bounty.rewardTokenSymbol;
  const creator = bounty.creator.handle;
  const slotsClaimed = bounty.currentHuntersCount ?? 0;
  const maxSlots = bounty.maxHunters;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#0E0E10",
          color: "#EDEDF0",
          padding: "60px 80px",
          fontFamily: "system-ui",
          position: "relative",
        }}
      >
        {/* Lavender accent ring (decorative, top-right) */}
        <div
          style={{
            position: "absolute",
            right: -200,
            top: -200,
            width: 500,
            height: 500,
            borderRadius: 9999,
            background:
              "radial-gradient(closest-side, #AB9FF230 0%, transparent 70%)",
          }}
        />

        {/* Top: brand bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#AB9FF2",
              color: "#100F16",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            B
          </div>
          <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.01em" }}>
            bounties.fm
          </div>
        </div>

        {/* Middle: token + reward */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            gap: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <TokenMark symbol={symbol} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: 132,
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  color: "#AB9FF2",
                }}
              >
                {reward} {symbol}
              </div>
              <div style={{ fontSize: 32, color: "#9B9BA5" }}>
                per hunter · {maxSlots} slots
              </div>
            </div>
          </div>

          {/* Meta row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              fontSize: 28,
            }}
          >
            <span style={{ color: "#EDEDF0" }}>
              by @{truncateHandle(creator)}
            </span>
            <span style={{ color: "#3F3F4A" }}>·</span>
            <span style={{ color: "#7BC768" }}>
              {slotsClaimed}/{maxSlots} claimed
            </span>
          </div>
        </div>

        {/* Bottom: CTA + URL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              background: "#AB9FF2",
              color: "#100F16",
              padding: "18px 36px",
              borderRadius: 9999,
              fontSize: 30,
              fontWeight: 500,
            }}
          >
            Hunt now →
          </div>
          <div style={{ fontSize: 20, color: "#6B6B75" }}>
            bounties.fm
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function TokenMark({ symbol }: { symbol: string }) {
  // Generic letter-circle keeps the OG image self-contained (no
  // remote-asset fetch + no broken-logo fallback to worry about).
  // Color matches the token chip palette for familiar tokens.
  const palette = paletteFor(symbol);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 152,
        height: 152,
        borderRadius: 9999,
        background: palette.bg,
        color: palette.text,
        fontSize: 64,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

function paletteFor(symbol: string): { bg: string; text: string } {
  switch (symbol.toUpperCase()) {
    case "USDC":
    case "USDT":
      return { bg: "#2DD4BF33", text: "#5EEAD4" };
    case "SOL":
      return { bg: "#9333EA33", text: "#C4B5FD" };
    case "BNTY":
      return { bg: "#AB9FF233", text: "#C7BFFA" };
    default:
      return { bg: "#1F1F28", text: "#EDEDF0" };
  }
}

function truncateHandle(handle: string): string {
  if (handle.length <= 20) return handle;
  return `${handle.slice(0, 18)}…`;
}
