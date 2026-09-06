ALTER TABLE "user_progress" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "last_error" text;