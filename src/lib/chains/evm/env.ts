import "server-only";
import { EVM_CHAINS, type EvmChainKey } from "./config";

/**
 * Server-only env readers for the EVM money paths (Monad, Base, …). Each
 * chain reads `${PREFIX}_*` vars (MONAD_*, BASE_*) so they're configured +
 * funded independently — you can run one live while another is on testnet.
 * Never imported from a client component.
 */

function prefix(chain: EvmChainKey): string {
  return EVM_CHAINS[chain].envPrefix;
}

/** Server RPC for signing / verifying on this chain. */
export function getEvmRpcUrl(chain: EvmChainKey): string {
  const p = prefix(chain);
  return (
    process.env[`${p}_RPC_URL`]?.trim() ||
    process.env[`NEXT_PUBLIC_${p}_RPC_URL`]?.trim() ||
    EVM_CHAINS[chain].defaultRpc
  );
}

/** Treasury address (0x) that receives escrow + pays rewards. */
export function getEvmTreasuryAddress(chain: EvmChainKey): string {
  const p = prefix(chain);
  const v = process.env[`${p}_TREASURY_WALLET_PUBLIC_KEY`]?.trim();
  if (!v) {
    throw new Error(
      `${p}_TREASURY_WALLET_PUBLIC_KEY not set. Generate a ${EVM_CHAINS[chain].label} ` +
        `treasury EOA, set it in env, and fund it with gas + pool tokens.`,
    );
  }
  return v;
}

export function getEvmTreasuryAddressOrNull(chain: EvmChainKey): string | null {
  try {
    return getEvmTreasuryAddress(chain);
  } catch {
    return null;
  }
}

/** Hex private key (0x…64) for the treasury EOA. Loaded only when signing. */
export function getEvmTreasuryPrivateKey(chain: EvmChainKey): `0x${string}` {
  const p = prefix(chain);
  const raw = process.env[`${p}_TREASURY_WALLET_PRIVATE_KEY`]?.trim();
  if (!raw) {
    throw new Error(`${p}_TREASURY_WALLET_PRIVATE_KEY not set.`);
  }
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

/** Revenue wallet — where accrued platform fees are swept to. Null keeps
 *  fees in the treasury (no separate revenue accounting). */
export function getEvmRevenueAddressOrNull(chain: EvmChainKey): string | null {
  const raw = process.env[`${prefix(chain)}_REVENUE_WALLET`]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Per-chain kill switch. Defaults to mock so a fresh deploy never moves
 *  real funds by accident. */
export function evmEscrowMode(
  chain: EvmChainKey,
): "mock" | "testnet" | "mainnet" {
  const m = process.env[`${prefix(chain)}_ESCROW_MODE`]?.trim().toLowerCase();
  if (m === "mainnet" || m === "testnet") return m;
  return "mock";
}

export function isEvmRealTxEnabled(chain: EvmChainKey): boolean {
  if (process.env[`${prefix(chain)}_ENABLE_REAL_TX`] === "false") return false;
  const mode = evmEscrowMode(chain);
  return mode === "mainnet" || mode === "testnet";
}

/** Confirmations to wait before treating an escrow / payout as final. */
export function getEvmConfirmations(chain: EvmChainKey): number {
  const n = Number(process.env[`${prefix(chain)}_CONFIRMATIONS`]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
}
