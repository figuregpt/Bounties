import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // `metadataBase` lets Next.js resolve every relative OG / Twitter
  // image URL (including the auto-wired `opengraph-image.tsx` outputs)
  // to an absolute https URL that scrapers can fetch.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://bounties.fm",
  ),
  // Title template: any page that exports its own `metadata.title`
  // renders as "<title> · bounties.fm". Pages that don't set a title
  // (e.g., transient screens) fall back to the bare `default`.
  title: {
    default: "bounties.fm",
    template: "%s · bounties.fm",
  },
  description:
    "Raid tweets, earn tokens. Bounties.fm pays hunters real crypto on Solana for every reply, retweet, and follow they complete on X.",
  openGraph: {
    title: "bounties.fm",
    description:
      "Raid tweets, earn tokens. Bounties.fm pays hunters real crypto on Solana for every reply, retweet, and follow they complete on X.",
    url: "/",
    siteName: "bounties.fm",
    type: "website",
    // Image auto-wired from `src/app/opengraph-image.tsx`.
  },
  twitter: {
    card: "summary_large_image",
    title: "bounties.fm",
    description:
      "Raid tweets, earn tokens. Bounties.fm pays hunters real crypto on Solana for every reply, retweet, and follow on X.",
    creator: "@bountiesfm",
    // Image auto-wired from the same file convention.
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-bg-base text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
