import { AlertTriangle } from "lucide-react";
import { currentNetwork } from "@/lib/tokens/canonical";

/**
 * Sticky banner shown when `SOLANA_NETWORK=devnet` (or its NEXT_PUBLIC_
 * mirror). Goal: prevent the "wait, I just bought 100 USDC and it's
 * fake?" support ticket. Renders a single subtle row above the desktop
 * top bar and the mobile header.
 *
 * Server-component — reads env at render time. No client JS shipped.
 */
export function DevnetBanner() {
  if (currentNetwork() !== "devnet") return null;
  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-caption text-warning">
      <AlertTriangle className="size-3.5" strokeWidth={2.25} />
      <span className="hidden sm:inline">
        Devnet mode — transactions run on the Solana test network. No
        real funds, no real prices.
      </span>
      <span className="sm:hidden">Devnet mode · test network</span>
    </div>
  );
}
