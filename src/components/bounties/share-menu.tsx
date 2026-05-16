"use client";

import { useState } from "react";
import { Check, Copy, Link as LinkIcon, Share2 } from "lucide-react";
import {
  DropdownContent,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownLinkItem,
  DropdownMenu,
  DropdownTrigger,
  DropdownTriggerButton,
} from "@/components/ui/dropdown";
import { formatHandle, formatTokenAmount } from "@/lib/format";

/**
 * Share menu for the bounty detail page. Three actions:
 *   • Copy link to clipboard
 *   • Open X compose with prefilled text
 *   • (placeholder) Copy embed code
 *
 * Built on the unified dropdown primitive so it matches every other
 * dropdown in the app.
 */

type Props = {
  bountyUrl: string;
  creatorHandle: string;
  rewardAmount: string | number;
  rewardSymbol: string;
};

export function ShareMenu({
  bountyUrl,
  creatorHandle,
  rewardAmount,
  rewardSymbol,
}: Props) {
  const [copied, setCopied] = useState(false);

  const shareText = `Hunt this bounty on @bountiesfm — earn ${formatTokenAmount(
    rewardAmount,
  )} ${rewardSymbol} for engaging with ${formatHandle(creatorHandle)}'s post. ${bountyUrl}`;

  const composeUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bountyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard denied — fall back to nothing */
    }
  };

  return (
    <DropdownMenu>
      <DropdownTrigger>
        <DropdownTriggerButton icon={Share2} aria-label="Share bounty">
          Share
        </DropdownTriggerButton>
      </DropdownTrigger>
      <DropdownContent className="w-56">
        <DropdownLabel>Share this bounty</DropdownLabel>
        <DropdownItem
          icon={copied ? Check : LinkIcon}
          onSelect={(e) => {
            // Keep menu open while we flash the "Link copied" feedback.
            e.preventDefault();
            void copyLink();
          }}
        >
          {copied ? "Link copied" : "Copy link"}
        </DropdownItem>
        <DropdownLinkItem href={composeUrl} external icon={XGlyph as never}>
          Share on X
        </DropdownLinkItem>
        <DropdownDivider />
        <DropdownItem icon={Copy} disabled>
          Copy embed code · soon
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

/* =========================================================================
   Tiny X glyph that conforms to the LucideIcon prop shape so we can pass
   it as `icon` to DropdownLinkItem without a custom slot.
   ========================================================================= */

function XGlyph(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={props.className}
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}
