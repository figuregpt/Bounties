CREATE TABLE "user_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"provider" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_mint_unique";--> statement-breakpoint
DROP INDEX "bounties_escrow_tx_hash_unique";--> statement-breakpoint
DROP INDEX "bounties_refund_tx_hash_unique";--> statement-breakpoint
DROP INDEX "claims_claim_tx_hash_unique";--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "chain" text DEFAULT 'solana' NOT NULL;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "chain" text DEFAULT 'solana' NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "chain" text DEFAULT 'solana' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_wallets_user_chain_unique" ON "user_wallets" USING btree ("user_id","chain");--> statement-breakpoint
CREATE UNIQUE INDEX "user_wallets_address_chain_unique" ON "user_wallets" USING btree ("address","chain");--> statement-breakpoint
CREATE INDEX "user_wallets_user_idx" ON "user_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_chain_mint_unique" ON "tokens" USING btree ("chain","mint");--> statement-breakpoint
CREATE UNIQUE INDEX "bounties_escrow_tx_hash_unique" ON "bounties" USING btree ("chain","escrow_tx_hash") WHERE "bounties"."escrow_tx_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bounties_refund_tx_hash_unique" ON "bounties" USING btree ("chain","refund_tx_hash") WHERE "bounties"."refund_tx_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_claim_tx_hash_unique" ON "claims" USING btree ("chain","claim_tx_hash") WHERE "claims"."claim_tx_hash" IS NOT NULL;--> statement-breakpoint
-- Backfill: mirror every existing Solana wallet into user_wallets so new
-- (userId, chain) lookups resolve for legacy users from day one. The old
-- users.wallet_address column stays as the synced 'solana primary' during
-- the migration window. Idempotent via ON CONFLICT.
INSERT INTO "user_wallets" ("user_id", "chain", "address", "provider", "connected_at")
SELECT "id", 'solana', "wallet_address", "wallet_provider", COALESCE("wallet_connected_at", now())
FROM "users"
WHERE "wallet_address" IS NOT NULL
ON CONFLICT DO NOTHING;