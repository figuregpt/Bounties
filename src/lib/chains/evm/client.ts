import "server-only";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  nonceManager,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";
import {
  getMonadRpcUrl,
  getMonadTreasuryAddress,
  getMonadTreasuryPrivateKey,
  monadEscrowMode,
} from "./env";

/** Mainnet (143) by default; testnet (10143) when MONAD_ESCROW_MODE=testnet
 *  so EIP-155 signatures carry the chain id the node expects. */
function activeChain() {
  return monadEscrowMode() === "testnet" ? monadTestnet : monad;
}

/* Lazy singletons — created on first use so a read-only path (or a fresh
   clone without the treasury key) doesn't throw at import time. The
   `makeX` indirection gives each cache var the exact inferred client
   type without wrestling viem's generics. */

function makePublic() {
  return createPublicClient({
    chain: activeChain(),
    transport: http(getMonadRpcUrl()),
  });
}
let _public: ReturnType<typeof makePublic> | undefined;
export function monadPublicClient() {
  return (_public ??= makePublic());
}

function makeAccount() {
  // nonceManager assigns sequential nonces for the single treasury EOA.
  const account = privateKeyToAccount(getMonadTreasuryPrivateKey(), {
    nonceManager,
  });
  // Fail fast on a pub/priv mismatch: escrow lands at the PUBLIC_KEY
  // address and the launch route verifies it there, but payouts sign from
  // the PRIVATE_KEY's EOA — if they differ, deposits strand. They MUST be
  // the same wallet.
  const declared = getMonadTreasuryAddress();
  if (getAddress(account.address) !== getAddress(declared)) {
    throw new Error(
      `Monad treasury key mismatch: MONAD_TREASURY_WALLET_PRIVATE_KEY derives ` +
        `${account.address} but MONAD_TREASURY_WALLET_PUBLIC_KEY is ${declared}. ` +
        `Set both to the same EOA.`,
    );
  }
  return account;
}
let _account: ReturnType<typeof makeAccount> | undefined;
export function monadTreasuryAccount() {
  return (_account ??= makeAccount());
}

function makeWallet() {
  return createWalletClient({
    account: monadTreasuryAccount(),
    chain: activeChain(),
    transport: http(getMonadRpcUrl()),
  });
}
let _wallet: ReturnType<typeof makeWallet> | undefined;
export function monadWalletClient() {
  return (_wallet ??= makeWallet());
}

/**
 * Serialize every treasury-signed submit behind one promise chain. A
 * single EOA has a strictly sequential nonce and the lottery-finalization
 * cron fires many payouts in a loop; viem's nonceManager assigns the
 * nonces, but this queue makes the actual submits happen one-at-a-time so
 * a replace / failure can't desync them mid-flight. Rejections are
 * swallowed on the tail so one failed payout doesn't poison the queue.
 */
let _tail: Promise<unknown> = Promise.resolve();
export function withTreasuryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = _tail.then(fn, fn);
  _tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
