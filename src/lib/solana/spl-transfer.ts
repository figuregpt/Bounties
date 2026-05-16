/**
 * Minimal SPL Token transfer instruction builder. We avoid the full
 * `@solana/spl-token` dependency — it's heavy and we only need two
 * primitives: derive the associated token account, and build a
 * `TransferChecked` instruction.
 *
 * Token-2022 mints work too (their program id differs but the
 * instruction layout for `TransferChecked` is identical). We detect the
 * program from the mint's owner via the connection.
 */

import {
  PublicKey,
  SystemProgram,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";

// Program IDs ---------------------------------------------------------------
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/* =========================================================================
   Public API
   ========================================================================= */

export async function buildSplTransferInstruction(args: {
  connection: Connection;
  from: PublicKey;
  to: PublicKey;
  mint: PublicKey;
  rawAmount: bigint;
}): Promise<TransactionInstruction[]> {
  const programId = await detectTokenProgram(args.connection, args.mint);

  const fromAta = associatedTokenAddress(args.from, args.mint, programId);
  const toAta = associatedTokenAddress(args.to, args.mint, programId);

  const instructions: TransactionInstruction[] = [];

  // If the recipient's ATA doesn't exist yet, prepend an Idempotent
  // Create ATA instruction. The user pays the rent — same flow most
  // wallets use.
  const info = await args.connection.getAccountInfo(toAta);
  if (!info) {
    instructions.push(
      createIdempotentAtaInstruction({
        payer: args.from,
        ata: toAta,
        owner: args.to,
        mint: args.mint,
        programId,
      }),
    );
  }

  // We use the legacy 3-byte amount path on Transfer (instruction tag 3)
  // because `TransferChecked` requires the mint's decimals which we don't
  // want to fetch on the hot path. The launch endpoint compares against
  // the parsed transfer it observes, which works for either variant.
  const decimals = await fetchMintDecimals(args.connection, args.mint);
  instructions.push(
    buildTransferCheckedInstruction({
      source: fromAta,
      mint: args.mint,
      destination: toAta,
      authority: args.from,
      amount: args.rawAmount,
      decimals,
      programId,
    }),
  );

  return instructions;
}

/* =========================================================================
   PDA derivations
   ========================================================================= */

function associatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey,
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

async function detectTokenProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) {
    throw new Error(`Mint ${mint.toBase58()} not found`);
  }
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

async function fetchMintDecimals(
  connection: Connection,
  mint: PublicKey,
): Promise<number> {
  const info = await connection.getParsedAccountInfo(mint);
  const parsed = info.value?.data as
    | { parsed?: { info?: { decimals?: number } } }
    | undefined;
  const d = parsed?.parsed?.info?.decimals;
  if (typeof d !== "number") {
    throw new Error(`Could not read decimals for mint ${mint.toBase58()}`);
  }
  return d;
}

/* =========================================================================
   Instruction encoders
   ========================================================================= */

function createIdempotentAtaInstruction(args: {
  payer: PublicKey;
  ata: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  programId: PublicKey;
}): TransactionInstruction {
  // Instruction tag 1 = CreateIdempotent on the Associated Token Program.
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: args.ata, isSigner: false, isWritable: true },
      { pubkey: args.owner, isSigner: false, isWritable: false },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: args.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  };
}

function buildTransferCheckedInstruction(args: {
  source: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  authority: PublicKey;
  amount: bigint;
  decimals: number;
  programId: PublicKey;
}): TransactionInstruction {
  // TransferChecked is instruction tag 12. Layout:
  //   u8 tag · u64 amount (LE) · u8 decimals
  //
  // We byte-write the u64 manually instead of `Buffer.writeBigUInt64LE`
  // — the latter exists in Node but the `buffer` npm polyfill that
  // bundlers ship to the browser doesn't include it (TypeError:
  // `data.writeBigUInt64LE is not a function` at runtime). Manual
  // little-endian write works on every Buffer impl.
  const data = Buffer.alloc(1 + 8 + 1);
  data[0] = 12;
  let amt = args.amount;
  const FF = BigInt(0xff);
  const EIGHT = BigInt(8);
  for (let i = 0; i < 8; i++) {
    data[1 + i] = Number(amt & FF);
    amt = amt >> EIGHT;
  }
  data[9] = args.decimals & 0xff;
  return {
    programId: args.programId,
    keys: [
      { pubkey: args.source, isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.destination, isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false },
    ],
    data,
  };
}
