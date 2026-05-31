"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useEvmConnectModal } from "@/app/evm-provider";

/**
 * Thin wrapper over wagmi's hooks — the EVM/Monad counterpart to
 * useWalletConnection (Solana). Exposes the same uniform shape (string
 * address, name, openConnectModal, disconnect) so a chain-aware component
 * can pick either hook by the bounty's chain without caring which runtime
 * is underneath.
 *
 * Transaction sending is intentionally NOT here — the create-escrow flow
 * uses wagmi's useSendTransaction / useWriteContract directly, since the
 * EVM tx shape has nothing in common with Solana's sendTransaction.
 */
export type EvmWalletState = {
  /** 0x-checksummed address, or null when no EVM wallet is connected. */
  address: string | null;
  isConnected: boolean;
  /** Connector name, e.g. "MetaMask". */
  walletName: string | null;
  connecting: boolean;
  /** Connect the first available injected EVM wallet. */
  openConnectModal: () => void;
  disconnect: () => void;
};

export function useEvmWallet(): EvmWalletState {
  const { address, isConnected, connector } = useAccount();
  const { isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const modal = useEvmConnectModal();

  return {
    address: address ?? null,
    isConnected,
    walletName: connector?.name ?? null,
    connecting: isPending,
    // Open the wallet-selection modal (MetaMask / Phantom / Rabby / …)
    // instead of auto-connecting the first injected provider.
    openConnectModal: () => modal.open(),
    disconnect: () => disconnect(),
  };
}
