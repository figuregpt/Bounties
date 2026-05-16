/**
 * Generates a fresh Solana keypair for use as the treasury wallet.
 *
 *   npm run treasury:generate
 *   npm run treasury:generate -- --airdrop 2          # devnet only: airdrop 2 SOL
 *
 * Prints the public key + the base58-encoded secret key. Copy the secret
 * key into .env.local as TREASURY_WALLET_PRIVATE_KEY and the public key
 * as TREASURY_WALLET_PUBLIC_KEY (the frontend uses the public key to
 * label the escrow recipient).
 *
 * IMPORTANT — the secret key is the entire wallet. Never commit it,
 * never paste it into Slack/Discord, and back it up in a password
 * manager before relying on it for real funds.
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

async function main() {
  const args = process.argv.slice(2);
  const airdropIdx = args.indexOf("--airdrop");
  const airdropSol = airdropIdx >= 0 ? Number(args[airdropIdx + 1]) : 0;

  const keypair = Keypair.generate();
  const secretBase58 = bs58.encode(keypair.secretKey);

  console.log("");
  console.log("============================================================");
  console.log("  bounties.fm treasury keypair");
  console.log("============================================================");
  console.log("");
  console.log("Public key  (TREASURY_WALLET_PUBLIC_KEY):");
  console.log(`  ${keypair.publicKey.toBase58()}`);
  console.log("");
  console.log("Secret key  (TREASURY_WALLET_PRIVATE_KEY, base58):");
  console.log(`  ${secretBase58}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1) Paste both values into .env.local");
  console.log("  2) Back up the secret key in a password manager");
  console.log("  3) For mainnet: also fund the wallet with SOL for tx fees");
  console.log("");

  if (airdropSol > 0) {
    const rpcUrl =
      process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    if (!/devnet|testnet/i.test(rpcUrl)) {
      console.warn(
        "Refusing to airdrop against a non-devnet/testnet RPC. " +
          `Got SOLANA_RPC_URL=${rpcUrl}`,
      );
      process.exit(1);
    }
    console.log(`Airdropping ${airdropSol} SOL on ${rpcUrl}…`);
    const conn = new Connection(rpcUrl, "confirmed");
    const sig = await conn.requestAirdrop(
      keypair.publicKey,
      Math.floor(airdropSol * LAMPORTS_PER_SOL),
    );
    const { blockhash, lastValidBlockHeight } =
      await conn.getLatestBlockhash("confirmed");
    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    const balance = await conn.getBalance(keypair.publicKey, "confirmed");
    console.log(
      `Airdrop confirmed (sig=${sig}). Balance: ${balance / LAMPORTS_PER_SOL} SOL`,
    );
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
