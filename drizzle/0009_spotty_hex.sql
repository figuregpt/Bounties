ALTER TABLE "claims" ADD COLUMN "claim_attempted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "bounties_escrow_tx_hash_unique" ON "bounties" USING btree ("escrow_tx_hash") WHERE "bounties"."escrow_tx_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bounties_refund_tx_hash_unique" ON "bounties" USING btree ("refund_tx_hash") WHERE "bounties"."refund_tx_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_claim_tx_hash_unique" ON "claims" USING btree ("claim_tx_hash") WHERE "claims"."claim_tx_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "claims_status_attempted_idx" ON "claims" USING btree ("status","claim_attempted_at");