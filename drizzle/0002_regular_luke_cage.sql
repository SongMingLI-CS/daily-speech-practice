ALTER TABLE "user_progress" ADD COLUMN "audio_key" text;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "audio_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "pronunciation_score" integer;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "fluency_score" integer;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "completeness_score" integer;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "user_progress" ADD COLUMN "assessed_at" timestamp with time zone;