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
import {
  monadPublicClient,
  monadTreasuryAccount,
  monadWalletClient,
  withTreasuryLock,
} from "./client";
import {
  getMonadConfirmations,
  getMonadTreasuryAddress,
  isMonadRealTxEnabled,
} from "./env";

const MONAD_MOCK_PREFIX = "MOCKMON_";
/** Match the Solana fee-slippage tolerance (5%) on the USD-derived fee. */
const FEE_SLIPPAGE_BPS = BigInt(500);
const ZERO = BigInt(0);
const BPS_DENOM = BigInt(10_000);

/** A reward token of `null` / "native" / "MON" means native MON, not an
 *  ERC-20. Mirrors the Solana SOL sentinel. */
function isNative(mint: string | null): boolean {
  return mint === null || mint === "native" || mint.toLowerCase() === "mon";
}

/** Native-MON detection for a transfer. The escrow + verify paths key
 *  native off the SYMBOL ('MON'), so the payout path MUST too — a native
 *  MON reward still carries a 0x mint (the enriched WMON address), so a
 *  mint-only check would wrongly take the ERC-20 branch and the payout
 *  would fail/strand funds. Mirrors the Solana adapter (symbol === 'SOL'). */
function isNativeReward(symbol: string | null, mint: string | null): boolean {
  return symbol?.toUpperCase() === "MON" || isNative(mint);
}

/** Gas headroom (~0.001 MON) kept aside on a native MON send so paying out
 *  (near-)the-whole balance can't pass the preflight then revert for gas. */
const NATIVE_GAS_RESERVE = BigInt("1000000000000000");

function withSlippage(amount: bigint): bigint {
  return (amount * (BPS_DENOM - FEE_SLIPPAGE_BPS)) / BPS_DENOM;
}

function short(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : "unknown error";
}

/* ---- validation / formatting ------------------------------------------ */

function isValidWallet(address: string): boolean {
  return isAddress(address);
}

function isValidTokenAddress(address: string): boolean {
  return isNative(address) || isAddress(address);
}

function normalizeAddress(address: string): string {
  return isAddress(address) ? getAddress(address) : address;
}

/* ---- reads ------------------------------------------------------------ */

async function getTokenDecimals(tokenAddress: string): Promise<number> {
  if (isNative(tokenAddress)) return 18;
  const dec = await monadPublicClient().readContract({
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
  // toRawAmount handles scientific-notation / large floats; parseUnits(String(n)) throws on '1e-7'.
  const need = toRawAmount(args.minAmount, args.decimals);
  if (isNative(args.mint)) {
    const bal = await monadPublicClient().getBalance({ address: owner });
    return bal >= need;
  }
  const bal = await monadPublicClient().readContract({
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
    const r = await monadPublicClient().getTransactionReceipt({
      hash: hash as `0x${string}`,
    });
    return { found: true, success: r.status === "success" };
  } catch {
    return { found: false, success: false };
  }
}

/* ---- escrow verification ---------------------------------------------- */

/**
 * Verifies a creator's escrow-funding tx. On Monad the creator sends the
 * WHOLE pool + creation fee to the treasury in ONE transfer (a plain EVM
 * tx has a single recipient), so we check the treasury received at least
 * `expectedAmount + fee`. The fee then lives in the treasury and is swept
 * to the revenue wallet later — exactly the Solana "treasury_legacy"
 * shape, which we report so the caller knows a sweep is owed.
 */
async function verifyEscrowTx(
  args: VerifyEscrowArgs,
): Promise<VerifyEscrowResult> {
  const pub = monadPublicClient();
  const hash = args.signature as `0x${string}`;
  const confirmations = getMonadConfirmations();

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

  /* ---- native MON: inspect the transaction itself --------------------- */
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

  /* ---- ERC-20: sum Transfer(creator → treasury) events ---------------- */
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
  return { ok: true, confirmedAt: new Date(), actualAmount: total, feeRoutedTo };
}

/* ---- reward / refund payout ------------------------------------------- */

/**
 * Sends a reward / refund from the treasury. The 5% platform fee is NOT
 * co-transferred here: a plain EVM tx has one recipient, and the fee was
 * already collected into the treasury at escrow time. We send only the net
 * `amount` to the hunter; accrued fees are swept to the revenue wallet by
 * a separate cron. `transfer.fee` is intentionally ignored.
 *
 * All sends go through `withTreasuryLock` so the single treasury EOA's
 * nonce stays sequential under concurrent payouts.
 */
async function sendReward(transfer: RewardTransfer): Promise<RewardResult> {
  if (!isMonadRealTxEnabled()) {
    const sig = `${MONAD_MOCK_PREFIX}${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    console.log(
      `[monad] mock tx → ${transfer.toWalletAddress} ${transfer.amount} ` +
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
  const treasury = getAddress(getMonadTreasuryAddress());
  if (to === treasury) {
    return {
      ok: false,
      error: "Recipient address equals the treasury",
      errorCode: "invalid_recipient",
    };
  }

  // toRawAmount handles scientific-notation / large floats; parseUnits(String(n)) throws on '1e-7'.
  const amount = toRawAmount(transfer.amount, transfer.decimals);
  // Native MON is identified by SYMBOL (it carries a 0x mint), matching
  // the escrow/verify side — never by mint alone.
  const native = isNativeReward(transfer.tokenSymbol, transfer.tokenMint);

  return withTreasuryLock(async () => {
    const pub = monadPublicClient();
    const wallet = monadWalletClient();
    const account = monadTreasuryAccount();
    try {
      // Every send burns native MON for gas — preflight a non-zero balance.
      const gasBal = await pub.getBalance({ address: account.address });
      if (gasBal === ZERO) {
        return {
          ok: false,
          error: "Treasury has no MON to pay gas",
          errorCode: "treasury_low_sol",
        };
      }

      let hash: `0x${string}`;
      if (native) {
        // Native send pays value + gas from the same balance — keep a
        // reserve so we fail cleanly instead of reverting on-chain.
        if (gasBal < amount + NATIVE_GAS_RESERVE) {
          return {
            ok: false,
            error: "Treasury MON balance is below the payout amount + gas",
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
        confirmations: getMonadConfirmations(),
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
  return !!signature && signature.startsWith(MONAD_MOCK_PREFIX);
}

export const monadAdapter: ChainAdapter = {
  chain: "monad",
  isValidWallet,
  isValidTokenAddress,
  normalizeAddress,
  getTokenDecimals,
  hasMinTokenBalance,
  verifyEscrowTx,
  sendReward,
  isRealTxEnabled: isMonadRealTxEnabled,
  isMockSignature,
  getTxReceipt,
};
