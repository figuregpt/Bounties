import { ImageResponse } from "next/og";

/**
 * Default OG image for / and any route that doesn't ship its own
 * `opengraph-image.tsx`. Branded card with the lavender B mark and the
 * site tagline. Rendered on-demand by Next.js at /opengraph-image.png.
 */

export const runtime = "nodejs";
export const alt = "bounties.fm — Raid tweets, earn tokens";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function RootOgImage() {
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
          padding: "80px",
          fontFamily: "system-ui",
          position: "relative",
        }}
      >
        {/* Lavender accent gradient ring (top-right) */}
        <div
          style={{
            position: "absolute",
            right: -240,
            top: -240,
            width: 600,
            height: 600,
            borderRadius: 9999,
            background:
              "radial-gradient(closest-side, #AB9FF230 0%, transparent 70%)",
          }}
        />

        {/* Brand mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 24,
              background: "#AB9FF2",
              color: "#100F16",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            B
          </div>
          <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.01em" }}>
            bounties.fm
          </div>
        </div>

        {/* Hero copy — pinned to the middle */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 104,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            Raid tweets,
          </div>
          <div
            style={{
              fontSize: 104,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: "#AB9FF2",
            }}
          >
            earn tokens.
          </div>
          <div style={{ fontSize: 30, color: "#9B9BA5", marginTop: 14 }}>
            Solana-backed bounties for every reply, retweet, and follow.
          </div>
        </div>

        {/* Bottom: CTA pill + url */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              background: "#AB9FF2",
              color: "#100F16",
              padding: "20px 40px",
              borderRadius: 9999,
              fontSize: 32,
              fontWeight: 600,
              display: "flex",
            }}
          >
            Start hunting →
          </div>
          <div style={{ fontSize: 22, color: "#6B6B75", display: "flex" }}>
            bounties.fm
          </div>
        </div>
      </div>
    ),
    size,
  );
}
