import "server-only";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  nonceManager,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EVM_CHAINS, type EvmChainKey } from "./config";
import {
  evmEscrowMode,
  getEvmRpcUrl,
  getEvmTreasuryAddress,
  getEvmTreasuryPrivateKey,
} from "./env";

/** Mainnet chain by default; testnet when ESCROW_MODE=testnet so EIP-155
 *  signatures carry the chain id the node expects. */
function activeChain(chain: EvmChainKey) {
  const cfg = EVM_CHAINS[chain];
  return evmEscrowMode(chain) === "testnet" ? cfg.testnetChain : cfg.viemChain;
}

/* Lazy per-chain singletons — created on first use so a read-only path (or
   a chain without keys configured) doesn't throw at import time. */

function makePublic(chain: EvmChainKey) {
  return createPublicClient({
    chain: activeChain(chain),
    transport: http(getEvmRpcUrl(chain)),
  });
}
const _public = new Map<EvmChainKey, ReturnType<typeof makePublic>>();
export function evmPublicClient(chain: EvmChainKey) {
  let c = _public.get(chain);
  if (!c) {
    c = makePublic(chain);
    _public.set(chain, c);
  }
  return c;
}

function makeAccount(chain: EvmChainKey) {
  // nonceManager assigns sequential nonces for the single treasury EOA.
  const account = privateKeyToAccount(getEvmTreasuryPrivateKey(chain), {
    nonceManager,
  });
  // Fail fast on a pub/priv mismatch: escrow lands at the PUBLIC_KEY
  // address (and the launch route verifies it there) but payouts sign
  // from the PRIVATE_KEY's EOA — they MUST be the same wallet.
  const declared = getEvmTreasuryAddress(chain);
  if (getAddress(account.address) !== getAddress(declared)) {
    throw new Error(
      `${EVM_CHAINS[chain].envPrefix} treasury key mismatch: private key derives ` +
        `${account.address} but the public key env is ${declared}. Set both to the same EOA.`,
    );
  }
  return account;
}
const _account = new Map<EvmChainKey, ReturnType<typeof makeAccount>>();
export function evmTreasuryAccount(chain: EvmChainKey) {
  let a = _account.get(chain);
  if (!a) {
    a = makeAccount(chain);
    _account.set(chain, a);
  }
  return a;
}

function makeWallet(chain: EvmChainKey) {
  return createWalletClient({
    account: evmTreasuryAccount(chain),
    chain: activeChain(chain),
    transport: http(getEvmRpcUrl(chain)),
  });
}
const _wallet = new Map<EvmChainKey, ReturnType<typeof makeWallet>>();
export function evmWalletClient(chain: EvmChainKey) {
  let w = _wallet.get(chain);
  if (!w) {
    w = makeWallet(chain);
    _wallet.set(chain, w);
  }
  return w;
}

/**
 * Serialize every treasury-signed submit on a chain behind one promise
 * chain. A single EOA has a strictly sequential nonce and the lottery-
 * finalization cron fires many payouts in a loop; this queue makes the
 * actual submits happen one-at-a-time per chain so a replace / failure
 * can't desync them.
 */
const _tail = new Map<EvmChainKey, Promise<unknown>>();
export function withEvmTreasuryLock<T>(
  chain: EvmChainKey,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = _tail.get(chain) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  _tail.set(
    chain,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
