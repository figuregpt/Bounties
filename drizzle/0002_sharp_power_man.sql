CREATE TABLE "smart_account_followers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"smart_account_id" uuid NOT NULL,
	"follower_twitter_id" text NOT NULL,
	"follower_handle" text,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"twitter_id" text,
	"display_name" text,
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"follower_count_snapshot" integer DEFAULT 0 NOT NULL,
	"followers_cached_at" timestamp with time zone,
	"followers_fully_synced" boolean DEFAULT false NOT NULL,
	"followers_last_cursor" text,
	"estimated_refresh_cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smart_accounts_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "smart_follower_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "smart_follower_last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "smart_account_followers" ADD CONSTRAINT "smart_account_followers_smart_account_id_smart_accounts_id_fk" FOREIGN KEY ("smart_account_id") REFERENCES "public"."smart_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "smart_account_followers_unique" ON "smart_account_followers" USING btree ("smart_account_id","follower_twitter_id");--> statement-breakpoint
CREATE INDEX "smart_account_followers_follower_idx" ON "smart_account_followers" USING btree ("follower_twitter_id");--> statement-breakpoint
CREATE INDEX "smart_account_followers_account_cached_idx" ON "smart_account_followers" USING btree ("smart_account_id","cached_at");--> statement-breakpoint
CREATE INDEX "smart_accounts_active_idx" ON "smart_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "smart_accounts_tier_idx" ON "smart_accounts" USING btree ("tier","followers_cached_at");--> statement-breakpoint
CREATE INDEX "smart_accounts_due_idx" ON "smart_accounts" USING btree ("followers_cached_at");--> statement-breakpoint
CREATE INDEX "users_smart_follower_count_idx" ON "users" USING btree ("smart_follower_count" DESC NULLS LAST);