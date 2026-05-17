import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getProfileData } from "@/lib/db/queries/profile";
import { formatUsd } from "@/lib/format";

async function logoDataUri(): Promise<string> {
  const svg = await readFile(
    path.join(process.cwd(), "public", "bountieslogo.svg"),
    "utf-8",
  );
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Dynamic OG image for /profile/[handle]. Hunter brags about their
 * earnings on Twitter → preview card surfaces their stats.
 */

export const runtime = "nodejs";
export const revalidate = 120;
export const alt = "Profile on bounties.fm";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ProfileOgImage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw).replace(/^@/, "");
  const [data, logoSrc] = await Promise.all([
    getProfileData(handle),
    logoDataUri(),
  ]);

  if (!data) {
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
            fontSize: 64,
            fontWeight: 500,
          }}
        >
          {`@${handle} · bounties.fm`}
        </div>
      ),
      size,
    );
  }

  const displayName = data.user.displayName ?? `@${data.user.handle}`;
  const initial = displayName.replace(/^@/, "").charAt(0).toUpperCase();

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

        {/* Top: brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="bounties.fm" width={52} height={52} />
          <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.01em" }}>
            bounties.fm
          </div>
        </div>

        {/* Middle: avatar + name + handle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 9999,
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
              {initial}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {truncate(displayName, 22)}
              </div>
              <div style={{ fontSize: 32, color: "#9B9BA5" }}>
                {`@${truncate(data.user.handle, 22)}`}
              </div>
            </div>
          </div>

          {/* Stat strip */}
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <StatCard
              label="Earned"
              value={formatUsd(data.stats.totalEarnedUsd)}
              accent
            />
            <StatCard
              label="Bounties done"
              value={String(data.stats.bountiesDoneCount)}
            />
            <StatCard
              label="Created"
              value={String(data.stats.createdCount)}
            />
          </div>
        </div>

        {/* Bottom URL */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            fontSize: 20,
            color: "#6B6B75",
          }}
        >
          {`bounties.fm/profile/${truncate(data.user.handle, 24)}`}
        </div>
      </div>
    ),
    size,
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: accent ? "#3C3458" : "#1A1A22",
        borderRadius: 16,
        padding: "20px 28px",
        gap: 6,
        minWidth: 200,
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: accent ? "#C7BFFA" : "#6B6B75",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 44,
          fontWeight: 600,
          color: accent ? "#FFFFFF" : "#EDEDF0",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
