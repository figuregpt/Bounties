import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/* =========================================================================
   user_wallets — one row per (user, chain) wallet binding.

   Replaces the single users.walletAddress scalar, which can only hold one
   address and carries a global UNIQUE that a multi-chain user breaks (a
   base58 Solana key AND a 0x Monad key can't both live in one unique
   column). During the migration window users.walletAddress stays as the
   synced 'solana primary' for back-compat; new code reads/writes here via
   (userId, chain). UNIQUE(address, chain) preserves the old "one wallet
   maps to one user" invariant per chain, including the detach-on-rebind
   behaviour the connect-wallet endpoint relies on.
   ========================================================================= */

export const userWallets = pgTable(
  "user_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'solana' | 'monad' — matches bounties.chain / claims.chain. */
    chain: text("chain").notNull(),
    /** Base58 (Solana) or 0x-hex checksummed (Monad) address. */
    address: text("address").notNull(),
    /** Wallet adapter / connector name (e.g. "Phantom", "MetaMask") —
     *  informational, mirrors the old users.walletProvider. */
    provider: text("provider"),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One wallet per chain per user.
    uniqueIndex("user_wallets_user_chain_unique").on(table.userId, table.chain),
    // A given address binds to at most one user on a given chain (the
    // detach-on-rebind path enforces this in app code too).
    uniqueIndex("user_wallets_address_chain_unique").on(
      table.address,
      table.chain,
    ),
    index("user_wallets_user_idx").on(table.userId),
  ],
);
