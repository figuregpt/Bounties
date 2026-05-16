CREATE TABLE "api_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"endpoint" text NOT NULL,
	"method" text DEFAULT 'GET' NOT NULL,
	"status_code" integer,
	"success" boolean DEFAULT true NOT NULL,
	"estimated_cost_usd" numeric(12, 8) DEFAULT '0' NOT NULL,
	"response_time_ms" integer,
	"bounty_id" uuid,
	"claim_id" uuid,
	"user_id" uuid,
	"error_message" text,
	"request_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buybacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyback_tx_hash" text,
	"revenue_included_usd" numeric(20, 6) NOT NULL,
	"bnty_amount_bought" numeric(30, 9) NOT NULL,
	"bnty_amount_burned" numeric(30, 9) NOT NULL,
	"bnty_amount_to_stakers" numeric(30, 9) NOT NULL,
	"jupiter_route" jsonb,
	"price_impact_percent" numeric(8, 4),
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"total_active_bounties" integer DEFAULT 0 NOT NULL,
	"total_active_hunters" integer DEFAULT 0 NOT NULL,
	"new_users_count" integer DEFAULT 0 NOT NULL,
	"new_bounties_count" integer DEFAULT 0 NOT NULL,
	"completed_claims_count" integer DEFAULT 0 NOT NULL,
	"total_rewards_distributed_usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"total_revenue_usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"total_api_cost_usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"top_token_symbol" text,
	"top_creator_user_id" uuid,
	"top_hunter_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_metrics_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "platform_revenue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"claim_id" uuid,
	"bounty_id" uuid,
	"amount" numeric(30, 9) NOT NULL,
	"amount_usd" numeric(20, 6) NOT NULL,
	"token_mint" text NOT NULL,
	"token_symbol" text NOT NULL,
	"included_in_buyback" boolean DEFAULT false NOT NULL,
	"buyback_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bounties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tweet_id" text NOT NULL,
	"tweet_url" text NOT NULL,
	"tweet_author_twitter_id" text,
	"tweet_author_handle" text,
	"tweet_cached_data" jsonb NOT NULL,
	"tweet_is_owned_by_creator" boolean DEFAULT false NOT NULL,
	"action_config" jsonb NOT NULL,
	"requires_like" boolean DEFAULT false NOT NULL,
	"requires_retweet" boolean DEFAULT false NOT NULL,
	"requires_reply" boolean DEFAULT false NOT NULL,
	"requires_quote" boolean DEFAULT false NOT NULL,
	"reply_keywords_required" text[],
	"reply_keywords_pool" text[],
	"reply_keywords_pool_minimum" integer,
	"reply_keywords_forbidden" text[],
	"reply_min_length" integer DEFAULT 0 NOT NULL,
	"reply_min_words" integer DEFAULT 0 NOT NULL,
	"reply_match_type" text DEFAULT 'word' NOT NULL,
	"reward_token_mint" text NOT NULL,
	"reward_token_symbol" text NOT NULL,
	"reward_token_decimals" integer NOT NULL,
	"reward_per_hunter" numeric(30, 9) NOT NULL,
	"reward_per_hunter_usd" numeric(20, 6),
	"max_hunters" integer NOT NULL,
	"total_pool" numeric(30, 9) NOT NULL,
	"total_pool_usd" numeric(20, 6),
	"platform_fee_bps" integer DEFAULT 500 NOT NULL,
	"platform_fee_amount" numeric(30, 9),
	"distribution_model" text NOT NULL,
	"distribution_config" jsonb,
	"eligibility_filters" jsonb NOT NULL,
	"min_followers" integer,
	"require_verified" boolean DEFAULT false NOT NULL,
	"min_account_age_months" integer,
	"min_reputation_score" numeric(8, 2),
	"allowed_countries" text[],
	"blocked_countries" text[],
	"min_previous_bounties" integer,
	"require_reputation_tier" text,
	"escrow_tx_hash" text,
	"escrow_confirmed_at" timestamp with time zone,
	"escrow_amount" numeric(30, 9),
	"treasury_address" text,
	"on_chain_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"ends_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"current_hunters_count" integer DEFAULT 0 NOT NULL,
	"claimed_hunters_count" integer DEFAULT 0 NOT NULL,
	"failed_hunters_count" integer DEFAULT 0 NOT NULL,
	"pending_hunters_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"featured_until" timestamp with time zone,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_nsfw" boolean DEFAULT false NOT NULL,
	"visibility_type" text DEFAULT 'public' NOT NULL,
	"tags" text[],
	"category" text,
	"stream_subscription_id" text,
	"stream_subscribed_at" timestamp with time zone,
	"last_engagement_check_at" timestamp with time zone,
	"engagement_check_error_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "bounties_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"hunter_user_id" uuid NOT NULL,
	"status" text DEFAULT 'awaiting_action' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hunt_started_at" timestamp with time zone,
	"action_claimed_at" timestamp with time zone,
	"initial_verified_at" timestamp with time zone,
	"final_check_scheduled_at" timestamp with time zone,
	"final_check_attempted_at" timestamp with time zone,
	"final_verified_at" timestamp with time zone,
	"claim_window_ends_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"verification_details" jsonb,
	"like_verified" boolean,
	"retweet_verified" boolean,
	"reply_verified" boolean,
	"reply_tweet_id" text,
	"reply_text" text,
	"quote_verified" boolean,
	"quote_tweet_id" text,
	"quote_text" text,
	"failure_reason" text,
	"failure_category" text,
	"verification_attempts" integer DEFAULT 0 NOT NULL,
	"reward_amount" numeric(30, 9) NOT NULL,
	"reward_amount_usd" numeric(20, 6),
	"reward_token_mint" text NOT NULL,
	"reward_token_symbol" text NOT NULL,
	"platform_fee_amount" numeric(30, 9),
	"claim_tx_hash" text,
	"claim_tx_confirmed_at" timestamp with time zone,
	"claim_tx_error" text,
	"ip_address" text,
	"user_agent" text,
	"device_fingerprint" text,
	"session_duration_seconds" integer,
	"mouse_events_count" integer,
	"referrer" text,
	"user_twitter_followers_at_hunt" integer,
	"user_twitter_verified_at_hunt" boolean,
	"user_reputation_score_at_hunt" numeric(8, 2)
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 0 NOT NULL,
	"enabled_for_user_ids" uuid[],
	"enabled_for_reputation_tier" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"privy_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now(),
	"twitter_id" text NOT NULL,
	"twitter_handle" text NOT NULL,
	"twitter_verified" boolean DEFAULT false NOT NULL,
	"twitter_followers" integer DEFAULT 0 NOT NULL,
	"twitter_following" integer DEFAULT 0 NOT NULL,
	"twitter_tweet_count" integer DEFAULT 0 NOT NULL,
	"twitter_account_created_at" timestamp with time zone,
	"twitter_last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"twitter_raw_profile" jsonb,
	"reputation_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"total_bounties_completed" integer DEFAULT 0 NOT NULL,
	"total_bounties_failed" integer DEFAULT 0 NOT NULL,
	"total_rewards_earned_usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"total_rewards_claimed_usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"longest_streak_days" integer DEFAULT 0 NOT NULL,
	"account_tier" text DEFAULT 'standard' NOT NULL,
	"total_bounties_created" integer DEFAULT 0 NOT NULL,
	"total_spent_as_creator_usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"is_creator_verified" boolean DEFAULT false NOT NULL,
	"email_address" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"notification_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"referral_code" text,
	"referred_by_user_id" uuid,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"banned_at" timestamp with time zone,
	"banned_reason" text,
	"banned_by_user_id" uuid,
	"shadow_banned" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_privy_id_unique" UNIQUE("privy_id"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "users_twitter_id_unique" UNIQUE("twitter_id"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "tweet_engagement_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tweet_id" text NOT NULL,
	"engagement_type" text NOT NULL,
	"last_cursor" text,
	"last_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_scheduled_fetch_at" timestamp with time zone,
	"known_engager_count" integer DEFAULT 0 NOT NULL,
	"total_api_calls_made" integer DEFAULT 0 NOT NULL,
	"is_fully_fetched" boolean DEFAULT false NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tweet_engagers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tweet_id" text NOT NULL,
	"engagement_type" text NOT NULL,
	"engager_twitter_id" text NOT NULL,
	"engager_handle" text,
	"engagement_tweet_id" text,
	"engagement_text" text,
	"engagement_created_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_still_valid" boolean DEFAULT true NOT NULL,
	"last_validated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tweet_stream_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"tweet_id" text NOT NULL,
	"stream_rule_id" text,
	"rule_value" text,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"events_received_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mint" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"decimals" integer NOT NULL,
	"logo_url" text,
	"category" text,
	"is_whitelisted" boolean DEFAULT false NOT NULL,
	"whitelisted_at" timestamp with time zone,
	"is_verified" boolean DEFAULT false NOT NULL,
	"coingecko_id" text,
	"jupiter_price_usd" numeric(20, 8),
	"jupiter_price_updated_at" timestamp with time zone,
	"total_volume_as_reward_usd" numeric(20, 6) DEFAULT '0' NOT NULL,
	"bounty_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_mint_unique" UNIQUE("mint")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"image_url" text,
	"link_url" text,
	"related_bounty_id" uuid,
	"related_claim_id" uuid,
	"related_user_id" uuid,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"delivered" boolean DEFAULT false NOT NULL,
	"delivered_at" timestamp with time zone,
	"channels" text[] DEFAULT ARRAY['web']::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"bounty_id" uuid,
	"claim_id" uuid,
	"target_user_id" uuid,
	"metadata" jsonb,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_user_id" uuid NOT NULL,
	"following_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_call_log" ADD CONSTRAINT "api_call_log_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_call_log" ADD CONSTRAINT "api_call_log_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_call_log" ADD CONSTRAINT "api_call_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_top_creator_user_id_users_id_fk" FOREIGN KEY ("top_creator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_top_hunter_user_id_users_id_fk" FOREIGN KEY ("top_hunter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_revenue" ADD CONSTRAINT "platform_revenue_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_revenue" ADD CONSTRAINT "platform_revenue_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_revenue" ADD CONSTRAINT "platform_revenue_buyback_id_buybacks_id_fk" FOREIGN KEY ("buyback_id") REFERENCES "public"."buybacks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_hunter_user_id_users_id_fk" FOREIGN KEY ("hunter_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_user_id_users_id_fk" FOREIGN KEY ("referred_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_banned_by_user_id_users_id_fk" FOREIGN KEY ("banned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tweet_stream_subscriptions" ADD CONSTRAINT "tweet_stream_subscriptions_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_bounty_id_bounties_id_fk" FOREIGN KEY ("related_bounty_id") REFERENCES "public"."bounties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_claim_id_claims_id_fk" FOREIGN KEY ("related_claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_follows" ADD CONSTRAINT "social_follows_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_follows" ADD CONSTRAINT "social_follows_following_user_id_users_id_fk" FOREIGN KEY ("following_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_call_log_service_idx" ON "api_call_log" USING btree ("service","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "api_call_log_bounty_idx" ON "api_call_log" USING btree ("bounty_id","created_at");--> statement-breakpoint
CREATE INDEX "api_call_log_errors_idx" ON "api_call_log" USING btree ("success","status_code","created_at");--> statement-breakpoint
CREATE INDEX "api_call_log_created_idx" ON "api_call_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "buybacks_executed_at_idx" ON "buybacks" USING btree ("executed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "buybacks_status_idx" ON "buybacks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "daily_metrics_date_idx" ON "daily_metrics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "platform_revenue_source_idx" ON "platform_revenue" USING btree ("source_type","created_at");--> statement-breakpoint
CREATE INDEX "platform_revenue_buyback_idx" ON "platform_revenue" USING btree ("included_in_buyback","created_at");--> statement-breakpoint
CREATE INDEX "platform_revenue_buyback_id_idx" ON "platform_revenue" USING btree ("buyback_id");--> statement-breakpoint
CREATE INDEX "bounties_creator_idx" ON "bounties" USING btree ("creator_user_id");--> statement-breakpoint
CREATE INDEX "bounties_tweet_id_idx" ON "bounties" USING btree ("tweet_id");--> statement-breakpoint
CREATE INDEX "bounties_status_ends_at_idx" ON "bounties" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "bounties_status_created_at_idx" ON "bounties" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bounties_status_reward_usd_idx" ON "bounties" USING btree ("status","reward_per_hunter_usd" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bounties_status_almost_full_idx" ON "bounties" USING btree ("status","current_hunters_count","max_hunters");--> statement-breakpoint
CREATE INDEX "bounties_category_status_idx" ON "bounties" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "bounties_tags_gin_idx" ON "bounties" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "bounties_featured_idx" ON "bounties" USING btree ("is_featured","featured_until") WHERE "bounties"."is_featured" = true;--> statement-breakpoint
CREATE INDEX "bounties_slug_idx" ON "bounties" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_bounty_hunter_unique" ON "claims" USING btree ("bounty_id","hunter_user_id");--> statement-breakpoint
CREATE INDEX "claims_bounty_idx" ON "claims" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX "claims_hunter_idx" ON "claims" USING btree ("hunter_user_id");--> statement-breakpoint
CREATE INDEX "claims_status_final_check_idx" ON "claims" USING btree ("status","final_check_scheduled_at");--> statement-breakpoint
CREATE INDEX "claims_bounty_status_idx" ON "claims" USING btree ("bounty_id","status");--> statement-breakpoint
CREATE INDEX "claims_hunter_status_idx" ON "claims" USING btree ("hunter_user_id","status");--> statement-breakpoint
CREATE INDEX "claims_hunter_created_idx" ON "claims" USING btree ("hunter_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "claims_status_window_idx" ON "claims" USING btree ("status","claim_window_ends_at");--> statement-breakpoint
CREATE INDEX "claims_status_action_claimed_idx" ON "claims" USING btree ("status","action_claimed_at");--> statement-breakpoint
CREATE INDEX "claims_tx_hash_idx" ON "claims" USING btree ("claim_tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_lower_unique" ON "users" USING btree (lower("handle"));--> statement-breakpoint
CREATE INDEX "users_reputation_score_idx" ON "users" USING btree ("reputation_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_total_rewards_earned_idx" ON "users" USING btree ("total_rewards_earned_usd" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_referral_code_idx" ON "users" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("id") WHERE "users"."is_banned" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "tweet_engagement_cache_tweet_type_unique" ON "tweet_engagement_cache" USING btree ("tweet_id","engagement_type");--> statement-breakpoint
CREATE INDEX "tweet_engagement_cache_next_fetch_idx" ON "tweet_engagement_cache" USING btree ("next_scheduled_fetch_at");--> statement-breakpoint
CREATE INDEX "tweet_engagement_cache_stale_idx" ON "tweet_engagement_cache" USING btree ("is_stale","last_fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tweet_engagers_unique" ON "tweet_engagers" USING btree ("tweet_id","engagement_type","engager_twitter_id");--> statement-breakpoint
CREATE INDEX "tweet_engagers_tweet_type_idx" ON "tweet_engagers" USING btree ("tweet_id","engagement_type");--> statement-breakpoint
CREATE INDEX "tweet_engagers_twitter_id_idx" ON "tweet_engagers" USING btree ("engager_twitter_id");--> statement-breakpoint
CREATE INDEX "tweet_engagers_active_idx" ON "tweet_engagers" USING btree ("tweet_id","engagement_type","is_still_valid");--> statement-breakpoint
CREATE INDEX "tweet_stream_subs_bounty_idx" ON "tweet_stream_subscriptions" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX "tweet_stream_subs_active_idx" ON "tweet_stream_subscriptions" USING btree ("is_active","subscribed_at");--> statement-breakpoint
CREATE INDEX "tokens_symbol_idx" ON "tokens" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "tokens_category_whitelist_idx" ON "tokens" USING btree ("category","is_whitelisted");--> statement-breakpoint
CREATE INDEX "tokens_whitelist_volume_idx" ON "tokens" USING btree ("is_whitelisted","total_volume_as_reward_usd" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_feed_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_delivery_idx" ON "notifications" USING btree ("delivered","created_at");--> statement-breakpoint
CREATE INDEX "social_activities_actor_idx" ON "social_activities" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "social_activities_global_idx" ON "social_activities" USING btree ("is_public","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "social_activities_type_idx" ON "social_activities" USING btree ("type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "social_follows_unique" ON "social_follows" USING btree ("follower_user_id","following_user_id");--> statement-breakpoint
CREATE INDEX "social_follows_follower_idx" ON "social_follows" USING btree ("follower_user_id");--> statement-breakpoint
CREATE INDEX "social_follows_following_idx" ON "social_follows" USING btree ("following_user_id");