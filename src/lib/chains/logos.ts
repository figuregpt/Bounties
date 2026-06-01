/** Chain logos for UI badges/filters (client-safe — plain URLs). */
export const CHAIN_LOGOS: Record<string, string> = {
  solana:
    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  monad:
    "https://cdn.dexscreener.com/cms/images/dbdf1b40bce8361da6215642ec5d4ad7aba0c748daa09eee62e3d6446008d469?width=800&height=800&quality=95&format=auto",
  base: "https://icons.llamao.fi/icons/chains/rsz_base.jpg",
};

export function chainLogo(chain: string): string | null {
  return CHAIN_LOGOS[chain] ?? null;
}
