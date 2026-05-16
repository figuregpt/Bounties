CREATE TABLE "stream_events_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_rule_id" text,
	"tweet_id" text NOT NULL,
	"conversation_id" text,
	"author_twitter_id" text,
	"author_handle" text,
	"text" text,
	"is_reply" boolean DEFAULT false NOT NULL,
	"is_quote" boolean DEFAULT false NOT NULL,
	"in_reply_to_tweet_id" text,
	"quoted_tweet_id" text,
	"matched_claim_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tweet_stream_subscriptions" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "stream_events_log_conversation_idx" ON "stream_events_log" USING btree ("conversation_id","received_at");--> statement-breakpoint
CREATE INDEX "stream_events_log_author_idx" ON "stream_events_log" USING btree ("author_twitter_id","received_at");--> statement-breakpoint
CREATE INDEX "stream_events_log_claim_idx" ON "stream_events_log" USING btree ("matched_claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tweet_stream_subs_one_active_per_bounty" ON "tweet_stream_subscriptions" USING btree ("bounty_id") WHERE "tweet_stream_subscriptions"."is_active" = true;