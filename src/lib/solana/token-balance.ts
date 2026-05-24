import "server-only";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "./escrow";

/**
 * Balance check for the holder-requirement eligibility filter. Used by
 * the hunt route to gate slot reservation: hunter's connected wallet
 * must hold >= `minAmount` of the bounty's required mint to claim a
 * slot.
 *
 * Native SOL path: when `mint` matches the wrapped-SOL mint, hunters
 * almost always hold their balance as native lamports (not as a WSOL
 * SPL account), so we read `getBalance` and divide by LAMPORTS_PER_SOL.
 * This is what people actually mean by "holding SOL" — using the SPL
 * path here would report 0 for any wallet that hasn't wrapped its SOL.
 *
 * SPL path (everything else): one `getParsedTokenAccountsByOwner` per
 * program id. Walks the wallet's SPL token accounts for the given mint,
 * sums `uiAmount`, compares to the threshold. Zero accounts → 0 →
 * false. Token-2022 wraps the same query under a different program id,
 * so we try both before giving up.
 */

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export async function hasMinTokenBalance(args: {
  wallet: string;
  mint: string;
  minAmount: number;
  decimals: number;
}): Promise<boolean> {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const walletKey = new PublicKey(args.wallet);

  // Native SOL — read lamport balance, not SPL accounts. A user with
  // 100 SOL in their wallet has zero WSOL token accounts in 99% of
  // cases; the SPL path would report 0 and reject them.
  if (args.mint === WSOL_MINT) {
    const lamports = await conn.getBalance(walletKey, "confirmed");
    const sol = lamports / LAMPORTS_PER_SOL;
    return sol >= args.minAmount;
  }

  const mintKey = new PublicKey(args.mint);
  const fromV1 = await conn
    .getParsedTokenAccountsByOwner(walletKey, {
      programId: TOKEN_PROGRAM_ID,
      mint: mintKey,
    })
    .catch(() => null);
  const fromV2 = await conn
    .getParsedTokenAccountsByOwner(walletKey, {
      programId: TOKEN_2022_PROGRAM_ID,
      mint: mintKey,
    })
    .catch(() => null);

  let total = 0;
  for (const list of [fromV1?.value, fromV2?.value]) {
    if (!list) continue;
    for (const acct of list) {
      const ui = acct.account.data.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof ui === "number" && Number.isFinite(ui)) total += ui;
    }
  }
  return total >= args.minAmount;
}
