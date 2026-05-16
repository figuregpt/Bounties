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
  // Title template: any page that exports its own `metadata.title`
  // renders as "<title> · bounties.fm". Pages that don't set a title
  // (e.g., transient screens) fall back to the bare `default`.
  title: {
    default: "bounties.fm",
    template: "%s · bounties.fm",
  },
  description: "Token rewards for Twitter engagement. Bounties on Solana.",
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
