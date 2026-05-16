import "server-only";

/**
 * Centralized env readers for treasury / escrow config. Server-only —
 * never imported from a client component or hook.
 *
 * Why a dedicated module: prior to Phase 9A the treasury address was
 * read from two env vars in different places (`BOUNTIES_TREASURY_ADDRESS`
 * and `TREASURY_WALLET_PUBLIC_KEY`). One missing, the other not
 * fallbacked through — and we'd ship an error from the wrong layer.
 * Routing every server call site through these helpers makes the
 * canonical name (`TREASURY_WALLET_PUBLIC_KEY`) the only one that
 * matters; the legacy alias stays as a transition fallback.
 *
 * IMPORTANT: client code can NEVER read these — Next.js only ships
 * vars prefixed `NEXT_PUBLIC_` to the browser. The page-component
 * server shell reads them here and passes the resolved string down to
 * the client component as a prop. See [src/app/(app)/create/page.tsx].
 */

/**
 * Resolves the treasury public key, preferring the canonical name and
 * falling back to the legacy alias. Throws (not returns null) because
 * every caller in real-mode needs this — failing late at a tx step
 * with an opaque RPC error is worse than failing early.
 */
export function getTreasuryPublicKey(): string {
  const canonical = process.env.TREASURY_WALLET_PUBLIC_KEY?.trim();
  const legacy = process.env.BOUNTIES_TREASURY_ADDRESS?.trim();
  const value = canonical && canonical.length > 0
    ? canonical
    : legacy && legacy.length > 0
      ? legacy
      : null;
  if (!value) {
    throw new Error(
      "Treasury address not configured. Set TREASURY_WALLET_PUBLIC_KEY in .env.local " +
        "(generate with `npm run treasury:generate`).",
    );
  }
  return value;
}

/** Soft variant for code paths that can degrade gracefully (rare). */
export function getTreasuryPublicKeyOrNull(): string | null {
  try {
    return getTreasuryPublicKey();
  } catch {
    return null;
  }
}

/**
 * Base58 private key for the treasury keypair. Loaded only when a
 * real outbound tx is being signed. Stays in this module so the only
 * import path is auditable.
 */
export function getTreasuryPrivateKey(): string {
  const raw = process.env.TREASURY_WALLET_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "TREASURY_WALLET_PRIVATE_KEY not set. Run `npm run treasury:generate` (devnet) " +
        "or set it via Railway secrets (mainnet).",
    );
  }
  return raw;
}
