/**
 * BigInt-safe token amount conversion.
 *
 * Why this exists: JavaScript `Number` loses precision past 2^53 ≈ 9e15.
 * For a 9-decimal token, that's only ~9,007,199 whole tokens — trivially
 * exceeded by memecoin supplies. Multiplying `humanAmount × 10^decimals`
 * inline with floats silently corrupts amounts as soon as someone
 * launches a 1B-supply token.
 *
 * Use `toRawAmount` everywhere a tx is built or verified. Only call
 * `fromRawAmount` for display, where the precision loss is acceptable.
 *
 * String parsing avoids the float roundtrip entirely:
 *
 *   toRawAmount(1.5, 6) → BigInt("1500000")
 *   toRawAmount(1, 9)   → BigInt("1000000000")
 *   toRawAmount(0.0001, 6) → BigInt("100")
 */

const LAMPORTS_PER_SOL_BIGINT = BigInt(1_000_000_000);

/**
 * Convert a human amount (e.g. 1.5 USDC) into raw units (1500000).
 * Rounds *down* if the input has more decimals than the token supports
 * — overshoot is impossible, undershoot is conservative.
 */
export function toRawAmount(humanAmount: number, decimals: number): bigint {
  if (!Number.isFinite(humanAmount)) {
    throw new Error(`toRawAmount: amount must be finite (got ${humanAmount})`);
  }
  if (humanAmount < 0) {
    throw new Error(`toRawAmount: amount must be non-negative (got ${humanAmount})`);
  }
  if (decimals < 0 || decimals > 18 || !Number.isInteger(decimals)) {
    throw new Error(`toRawAmount: decimals must be 0..18 int (got ${decimals})`);
  }

  // Use the canonical string repr (avoid `.toFixed` which can flip to
  // scientific notation for tiny / huge numbers).
  const str = humanAmount.toString();
  const [wholeRaw, fractionRaw = ""] = str.includes("e")
    ? expandScientific(str).split(".")
    : str.split(".");
  const whole = wholeRaw.replace(/^-/, "") || "0";
  const padded = (fractionRaw + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + padded);
}

/** Inverse of `toRawAmount` for *display only*. */
export function fromRawAmount(raw: bigint, decimals: number): number {
  if (decimals < 0 || decimals > 18 || !Number.isInteger(decimals)) {
    throw new Error(`fromRawAmount: decimals must be 0..18 int (got ${decimals})`);
  }
  return Number(raw) / 10 ** decimals;
}

/** Convenience for SOL → lamports. SOL has 9 decimals by definition. */
export function solToLamports(sol: number): bigint {
  return toRawAmount(sol, 9);
}

/** Convenience for lamports → SOL (display only). */
export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / Number(LAMPORTS_PER_SOL_BIGINT);
}

/** Expand `1e-7` → `0.0000001` so the string→bigint path works. */
function expandScientific(s: string): string {
  const n = Number(s);
  return n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}
