ALTER TABLE "bounties" ADD COLUMN "requires_follow" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "follow_target_handle" text;