import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Default OG image for / and any route that doesn't ship its own
 * `opengraph-image.tsx`. Branded card with the lavender bounties.fm
 * mark and the site tagline. Rendered on-demand by Next.js.
 */

export const runtime = "nodejs";
export const alt = "bounties.fm — Raid tweets, earn tokens";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function logoDataUri(): Promise<string> {
  const svg = await readFile(
    path.join(process.cwd(), "public", "bountieslogo.svg"),
    "utf-8",
  );
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export default async function RootOgImage() {
  const logoSrc = await logoDataUri();
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="bounties.fm" width={100} height={100} />
          <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.01em" }}>
            bounties.fm
          </div>
        </div>

        {/* Hero copy — pinned to the bottom */}
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
          <div style={{ fontSize: 32, color: "#9B9BA5", marginTop: 16 }}>
            Solana-backed bounties for every reply, retweet, and follow.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
