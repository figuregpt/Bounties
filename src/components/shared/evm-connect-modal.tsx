"use client";

import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { X } from "lucide-react";

/**
 * Wallet-selection modal for the Monad (EVM) stack — the counterpart to
 * the Solana wallet-adapter modal. wagmi's EIP-6963 discovery means
 * `connectors` already lists every injected wallet the browser exposes
 * (MetaMask, Rabby, Phantom-EVM, …), so we just render them and connect
 * on pick instead of auto-connecting the first one.
 */
export function EvmConnectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { connectors, connect, isPending } = useConnect();
  const { isConnected } = useAccount();

  // Close once a wallet actually connects.
  useEffect(() => {
    if (open && isConnected) onClose();
  }, [open, isConnected, onClose]);

  if (!open) return null;

  // De-dupe by name (the generic `injected` connector can shadow an
  // EIP-6963 entry for the same wallet); prefer the one with an icon.
  const byName = new Map<string, (typeof connectors)[number]>();
  for (const c of connectors) {
    const key = c.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || (!existing.icon && c.icon)) byName.set(key, c);
  }
  const list = [...byName.values()];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-card)] border border-border-default bg-bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-h3 font-medium leading-tight text-text-primary">
            Connect a wallet on Monad to continue
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="press grid size-7 shrink-0 place-items-center rounded-[7px] border border-border-default bg-bg-elevated text-text-tertiary hover:text-text-primary"
          >
            <X className="size-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          {list.length === 0 && (
            <p className="rounded-[10px] border border-border-subtle bg-bg-base px-3 py-3 text-small text-text-tertiary">
              No EVM wallet detected. Install MetaMask, Rabby, or Phantom and
              refresh.
            </p>
          )}
          {list.map((c) => (
            <button
              key={c.uid}
              type="button"
              disabled={isPending}
              onClick={() => connect({ connector: c })}
              className="press flex w-full items-center gap-3 rounded-[10px] border border-border-default bg-bg-elevated px-3 py-2.5 text-small text-text-primary transition-colors hover:border-accent-primary/40 disabled:cursor-progress disabled:opacity-60"
            >
              {c.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.icon}
                  alt=""
                  className="size-6 rounded-md object-contain"
                />
              ) : (
                <span className="size-6 rounded-md bg-bg-base" />
              )}
              <span className="font-medium">{c.name}</span>
              <span className="ml-auto text-caption text-text-tertiary">
                Detected
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
