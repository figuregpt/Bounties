import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "./escrow";

/**
 * SPL-token balance check for the holder-requirement eligibility
 * filter. Used by the hunt route to gate slot reservation: hunter's
 * connected wallet must hold >= `minAmount` of the bounty's required
 * mint to claim a slot.
 *
 * One RPC call (`getParsedTokenAccountsByOwner`). Walks the wallet's
 * SPL token accounts for the given mint, sums their `uiAmount`, and
 * compares to the threshold. A wallet with zero accounts for the
 * mint reads as 0 — returns false.
 *
 * For native SOL we'd need a separate code path (`getBalance` on the
 * wallet pubkey, divide by lamports). The holder-requirement form
 * captures `decimals` per-mint and SPL wrapped-SOL accounts work fine
 * here, so we keep this SPL-only for now.
 */

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

export async function hasMinTokenBalance(args: {
  wallet: string;
  mint: string;
  minAmount: number;
  decimals: number;
}): Promise<boolean> {
  const conn = new Connection(rpcEndpoint(), "confirmed");
  const walletKey = new PublicKey(args.wallet);
  const mintKey = new PublicKey(args.mint);

  // Try the original SPL Token program first (covers USDC, USDT, most
  // memecoins). Token-2022 wraps the same query under a different
  // program id, so we try both before giving up.
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
