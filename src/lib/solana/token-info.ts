import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { rpcEndpoint } from "./escrow";

/**
 * Fetch a mint's decimals from on-chain.
 *
 * DexScreener doesn't return decimals and they're load-bearing for
 * amount math (we serialize SPL transfers as raw units). We pin to RPC
 * once, cache in-memory + the `tokens` table, then never look again.
 */

const decimalsCache = new Map<string, number>();

export async function getTokenDecimals(mintAddress: string): Promise<number> {
  const cached = decimalsCache.get(mintAddress);
  if (cached != null) return cached;

  const connection = new Connection(rpcEndpoint(), "confirmed");
  const mint = new PublicKey(mintAddress);
  const info = await connection.getParsedAccountInfo(mint);
  if (!info.value) {
    throw new Error(`Mint ${mintAddress} not found on Solana`);
  }
  const data = info.value.data;
  if (
    !data ||
    typeof data !== "object" ||
    !("parsed" in data) ||
    !data.parsed ||
    typeof data.parsed !== "object" ||
    !("info" in data.parsed)
  ) {
    throw new Error(`Mint ${mintAddress} did not return parsed account data`);
  }
  const parsed = data.parsed as {
    info?: { decimals?: number };
  };
  const decimals = parsed.info?.decimals;
  if (typeof decimals !== "number" || decimals < 0 || decimals > 18) {
    throw new Error(`Mint ${mintAddress} has no usable decimals`);
  }
  decimalsCache.set(mintAddress, decimals);
  return decimals;
}
