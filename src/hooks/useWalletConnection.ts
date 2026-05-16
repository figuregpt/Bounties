"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback } from "react";

/**
 * Thin wrapper over @solana/wallet-adapter's hooks.
 *
 * Why a wrapper at all: components in this app shouldn't import from
 * the wallet-adapter package directly — that couples our flows to a
 * specific lib choice. The wrapper also exposes a uniform shape with
 * the helpers we need (string address, name, openConnectModal).
 */

export type WalletConnectionState = {
  /** Base58 address, or null when no wallet is connected. */
  address: string | null;
  isConnected: boolean;
  /** Adapter-provided wallet name, e.g. "Phantom". */
  walletName: string | null;
  /** Same Connection instance backing the adapter — reuse it everywhere
   *  so we don't multiply RPC clients per page. */
  connection: ReturnType<typeof useConnection>["connection"];
  /** Sign + send a `Transaction` (legacy) or `VersionedTransaction`.
   *  Resolves with the on-chain signature string. */
  sendTransaction: ReturnType<typeof useWallet>["sendTransaction"];
  /** Opens the wallet-modal where the user picks a provider. */
  openConnectModal: () => void;
  /** Programmatic disconnect (e.g. from a "sign out" menu item). */
  disconnect: ReturnType<typeof useWallet>["disconnect"];
};

export function useWalletConnection(): WalletConnectionState {
  const { publicKey, connected, sendTransaction, disconnect, wallet } =
    useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const openConnectModal = useCallback(() => setVisible(true), [setVisible]);

  return {
    address: publicKey?.toBase58() ?? null,
    isConnected: connected,
    walletName: wallet?.adapter.name ?? null,
    connection,
    sendTransaction,
    openConnectModal,
    disconnect,
  };
}
