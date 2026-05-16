ALTER TABLE "tokens" ADD COLUMN "market_cap_usd" numeric(24, 2);--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "liquidity_usd" numeric(24, 2);--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "volume_24h_usd" numeric(24, 2);--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "price_change_24h_percent" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "dex_screener_pair_address" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "is_admin_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "flagged_as_scam" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "usage_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "tokens_usage_idx" ON "tokens" USING btree ("usage_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tokens_flagged_idx" ON "tokens" USING btree ("flagged_as_scam");