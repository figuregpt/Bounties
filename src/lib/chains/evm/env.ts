import "server-only";

/**
 * Server-only env readers for the Monad (EVM) money path — the mirror of
 * src/lib/solana/env.ts. Never imported from a client component; the
 * create page reads the public treasury address separately.
 *
 * Per-chain config is deliberate: you will want Solana live while Monad is
 * still being shaken out, so Monad has its OWN kill switch and RPC and
 * keys. A missing Monad key throws a Monad-specific error, not the
 * misleading Solana one.
 */

/** Server RPC for signing / verifying. Falls back to the public node. */
export function getMonadRpcUrl(): string {
  return (
    process.env.MONAD_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim() ||
    "https://rpc.monad.xyz"
  );
}

/** Treasury address (0x) that receives escrow + pays rewards. */
export function getMonadTreasuryAddress(): string {
  const v = process.env.MONAD_TREASURY_WALLET_PUBLIC_KEY?.trim();
  if (!v) {
    throw new Error(
      "MONAD_TREASURY_WALLET_PUBLIC_KEY not set. Generate a Monad treasury " +
        "EOA and set it in env (and fund it with MON for gas).",
    );
  }
  return v;
}

export function getMonadTreasuryAddressOrNull(): string | null {
  try {
    return getMonadTreasuryAddress();
  } catch {
    return null;
  }
}

/** Hex private key (0x…64) for the treasury EOA. Loaded only when signing. */
export function getMonadTreasuryPrivateKey(): `0x${string}` {
  const raw = process.env.MONAD_TREASURY_WALLET_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "MONAD_TREASURY_WALLET_PRIVATE_KEY not set. Set the Monad treasury " +
        "EOA private key (0x-prefixed hex) via secrets.",
    );
  }
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  return hex as `0x${string}`;
}

/**
 * Revenue wallet — where accrued platform fees are SWEPT to. On Monad we
 * don't split the fee per-payout (a plain EVM tx has one recipient); the
 * fee stays in the treasury and a sweep cron moves it here. Null = keep
 * fees in the treasury (no separate revenue accounting).
 */
export function getMonadRevenueAddressOrNull(): string | null {
  const raw = process.env.MONAD_REVENUE_WALLET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * Per-chain kill switch. Real on-chain settlement happens only when
 * MONAD_ENABLE_REAL_TX is not "false" AND a mode of mainnet/testnet is
 * selected. Defaults to mock so a fresh deploy never moves real MON by
 * accident.
 */
export function monadEscrowMode(): "mock" | "testnet" | "mainnet" {
  const m = process.env.MONAD_ESCROW_MODE?.trim().toLowerCase();
  if (m === "mainnet" || m === "testnet") return m;
  return "mock";
}

export function isMonadRealTxEnabled(): boolean {
  if (process.env.MONAD_ENABLE_REAL_TX === "false") return false;
  const mode = monadEscrowMode();
  return mode === "mainnet" || mode === "testnet";
}

/** Confirmations to wait before treating an escrow / payout as final.
 *  EVM blocks can reorg, so we don't trust 1. Tunable per Monad finality. */
export function getMonadConfirmations(): number {
  const n = Number(process.env.MONAD_CONFIRMATIONS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
}
