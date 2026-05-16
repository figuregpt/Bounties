ALTER TABLE "bounties" ADD COLUMN "refund_tx_hash" text;--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "refunded_amount" numeric(30, 9);--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
-- Phase 8 Part 1 backfill: final check now runs at bounty.endsAt rather
-- than a fixed 24h offset from when the hunter verified.
UPDATE "claims" c
SET "final_check_scheduled_at" = b."ends_at"
FROM "bounties" b
WHERE c."bounty_id" = b."id"
  AND c."final_check_scheduled_at" IS NOT NULL
  AND c."final_check_scheduled_at" <> b."ends_at";
