import "server-only";
import { erc20Abi, getAddress, isAddress, parseEventLogs } from "viem";
import { toRawAmount } from "@/lib/solana/amount";
import type {
  ChainAdapter,
  RewardResult,
  RewardTransfer,
  VerifyEscrowArgs,
  VerifyEscrowResult,
} from "../types";
import { EVM_CHAINS, type EvmChainKey } from "./config";
import {
  evmPublicClient,
  evmTreasuryAccount,
  evmWalletClient,
  withEvmTreasuryLock,
} from "./client";
import {
  getEvmConfirmations,
  getEvmTreasuryAddress,
  isEvmRealTxEnabled,
} from "./env";

const FEE_SLIPPAGE_BPS = BigInt(500); // 5% — matches the Solana fee tolerance.
const ZERO = BigInt(0);
const BPS_DENOM = BigInt(10_000);
/** Gas headroom (~0.001 native) kept aside on a native send so paying out
 *  (near-)the-whole balance can't pass the preflight then revert for gas. */
const NATIVE_GAS_RESERVE = BigInt("1000000000000000");

function withSlippage(amount: bigint): bigint {
  return (amount * (BPS_DENOM - FEE_SLIPPAGE_BPS)) / BPS_DENOM;
}

function short(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : "unknown error";
}

/** A `null` / "native" mint is the native sentinel regardless of chain. */
function isNativeSentinel(mint: string | null): boolean {
  return mint === null || mint === "native";
}

export function createEvmAdapter(chain: EvmChainKey): ChainAdapter {
  const cfg = EVM_CHAINS[chain];
  const MOCK_PREFIX = `MOCK_${cfg.envPrefix}_`;

  /** Native reward detection: by SYMBOL (matches the escrow + create side),
   *  not by mint — a native reward still carries the wrapped-token 0x mint. */
  function isNativeReward(
    symbol: string | null,
    mint: string | null,
  ): boolean {
    return (
      symbol?.toUpperCase() === cfg.nativeSymbol || isNativeSentinel(mint)
    );
  }

  function isValidWallet(address: string): boolean {
    return isAddress(address);
  }
  function isValidTokenAddress(address: string): boolean {
    return isNativeSentinel(address) || isAddress(address);
  }
  function normalizeAddress(address: string): string {
    return isAddress(address) ? getAddress(address) : address;
  }

  async function getTokenDecimals(tokenAddress: string): Promise<number> {
    if (isNativeSentinel(tokenAddress)) return 18;
    const dec = await evmPublicClient(chain).readContract({
      address: getAddress(tokenAddress),
      abi: erc20Abi,
      functionName: "decimals",
    });
    return Number(dec);
  }

  async function hasMinTokenBalance(args: {
    wallet: string;
    mint: string;
    minAmount: number;
    decimals: number;
  }): Promise<boolean> {
    if (!isAddress(args.wallet)) return false;
    const owner = getAddress(args.wallet);
    const need = toRawAmount(args.minAmount, args.decimals);
    if (isNativeSentinel(args.mint)) {
      const bal = await evmPublicClient(chain).getBalance({ address: owner });
      return bal >= need;
    }
    const bal = await evmPublicClient(chain).readContract({
      address: getAddress(args.mint),
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
    return bal >= need;
  }

  async function getTxReceipt(
    hash: string,
  ): Promise<{ found: boolean; success: boolean }> {
    try {
      const r = await evmPublicClient(chain).getTransactionReceipt({
        hash: hash as `0x${string}`,
      });
      return { found: true, success: r.status === "success" };
    } catch {
      return { found: false, success: false };
    }
  }

  async function verifyEscrowTx(
    args: VerifyEscrowArgs,
  ): Promise<VerifyEscrowResult> {
    const pub = evmPublicClient(chain);
    const hash = args.signature as `0x${string}`;
    const confirmations = getEvmConfirmations(chain);

    let receipt;
    try {
      receipt = await pub.waitForTransactionReceipt({ hash, confirmations });
    } catch (err) {
      return {
        ok: false,
        code: "tx_not_found",
        reason: `Receipt unavailable after ${confirmations} confs: ${short(err)}`,
      };
    }
    if (receipt.status !== "success") {
      return {
        ok: false,
        code: "tx_failed_on_chain",
        reason: `Tx reverted on-chain (status=${receipt.status})`,
      };
    }

    const treasury = getAddress(args.expectedTreasuryWallet);
    const from = getAddress(args.expectedFromWallet);
    const feeRaw = args.expectedFee?.amount ?? ZERO;
    const need = args.expectedAmount + withSlippage(feeRaw);
    const feeRoutedTo: "treasury_legacy" | "none" =
      feeRaw > ZERO ? "treasury_legacy" : "none";

    // Native: inspect the transaction itself.
    if (args.expectedMint === null) {
      const tx = await pub.getTransaction({ hash });
      if (!tx.to || getAddress(tx.to) !== treasury) {
        return {
          ok: false,
          code: "recipient_mismatch",
          reason: "Native transfer not addressed to treasury",
        };
      }
      if (getAddress(tx.from) !== from) {
        return {
          ok: false,
          code: "sender_mismatch",
          reason: "Sender does not match the creator wallet",
        };
      }
      if (tx.value < need) {
        return {
          ok: false,
          code: "amount_too_low",
          reason: `Sent ${tx.value} < required ${need}`,
        };
      }
      return {
        ok: true,
        confirmedAt: new Date(),
        actualAmount: tx.value,
        feeRoutedTo,
      };
    }

    // ERC-20: sum Transfer(creator → treasury) events for the token.
    const token = getAddress(args.expectedMint);
    const transfers = parseEventLogs({
      abi: erc20Abi,
      eventName: "Transfer",
      logs: receipt.logs,
    }).filter(
      (l) =>
        getAddress(l.address) === token &&
        getAddress(l.args.to) === treasury &&
        getAddress(l.args.from) === from,
    );
    if (transfers.length === 0) {
      return {
        ok: false,
        code: "no_matching_transfer",
        reason: "No ERC-20 Transfer to the treasury found in this tx",
      };
    }
    const total = transfers.reduce((sum, l) => sum + l.args.value, ZERO);
    if (total < need) {
      return {
        ok: false,
        code: "amount_too_low",
        reason: `Transferred ${total} < required ${need}`,
      };
    }
    return {
      ok: true,
      confirmedAt: new Date(),
      actualAmount: total,
      feeRoutedTo,
    };
  }

  async function sendReward(transfer: RewardTransfer): Promise<RewardResult> {
    if (!isEvmRealTxEnabled(chain)) {
      const sig = `${MOCK_PREFIX}${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      console.log(
        `[${chain}] mock tx → ${transfer.toWalletAddress} ${transfer.amount} ` +
          `${transfer.tokenSymbol} (ref=${transfer.reference}, sig=${sig})`,
      );
      return { ok: true, signature: sig, mock: true };
    }

    if (!isAddress(transfer.toWalletAddress)) {
      return {
        ok: false,
        error: "Recipient is not a valid EVM address",
        errorCode: "invalid_recipient",
      };
    }
    const to = getAddress(transfer.toWalletAddress);
    const treasury = getAddress(getEvmTreasuryAddress(chain));
    if (to === treasury) {
      return {
        ok: false,
        error: "Recipient address equals the treasury",
        errorCode: "invalid_recipient",
      };
    }

    const amount = toRawAmount(transfer.amount, transfer.decimals);
    const native = isNativeReward(transfer.tokenSymbol, transfer.tokenMint);

    return withEvmTreasuryLock(chain, async () => {
      const pub = evmPublicClient(chain);
      const wallet = evmWalletClient(chain);
      const account = evmTreasuryAccount(chain);
      try {
        const gasBal = await pub.getBalance({ address: account.address });
        if (gasBal === ZERO) {
          return {
            ok: false,
            error: `Treasury has no ${cfg.nativeSymbol} to pay gas`,
            errorCode: "treasury_low_sol",
          };
        }

        let hash: `0x${string}`;
        if (native) {
          if (gasBal < amount + NATIVE_GAS_RESERVE) {
            return {
              ok: false,
              error: `Treasury ${cfg.nativeSymbol} balance is below payout + gas`,
              errorCode: "treasury_low_token",
            };
          }
          hash = await wallet.sendTransaction({ to, value: amount });
        } else {
          const token = getAddress(transfer.tokenMint);
          const bal = await pub.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account.address],
          });
          if (bal < amount) {
            return {
              ok: false,
              error: "Treasury token balance is below the payout amount",
              errorCode: "treasury_low_token",
            };
          }
          hash = await wallet.writeContract({
            address: token,
            abi: erc20Abi,
            functionName: "transfer",
            args: [to, amount],
          });
        }

        const receipt = await pub.waitForTransactionReceipt({
          hash,
          confirmations: getEvmConfirmations(chain),
        });
        if (receipt.status !== "success") {
          return {
            ok: false,
            error: `Payout tx reverted on-chain (${hash})`,
            errorCode: "tx_failed",
          };
        }
        return { ok: true, signature: hash, mock: false };
      } catch (err) {
        return { ok: false, error: short(err), errorCode: "rpc_error" };
      }
    });
  }

  function isMockSignature(signature: string | null | undefined): boolean {
    return !!signature && signature.startsWith(MOCK_PREFIX);
  }

  return {
    chain,
    isValidWallet,
    isValidTokenAddress,
    normalizeAddress,
    getTokenDecimals,
    hasMinTokenBalance,
    verifyEscrowTx,
    sendReward,
    isRealTxEnabled: () => isEvmRealTxEnabled(chain),
    isMockSignature,
    getTxReceipt,
  };
}
