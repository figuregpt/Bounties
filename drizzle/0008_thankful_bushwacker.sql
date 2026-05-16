ALTER TABLE "bounties" ADD COLUMN "creation_fee_amount" numeric(30, 9);--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "creation_fee_amount_usd" numeric(20, 6);