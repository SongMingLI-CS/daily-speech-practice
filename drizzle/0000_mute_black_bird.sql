CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"phone" text UNIQUE,
	"image" text,
	"email_verified" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" ("phone");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"date" date NOT NULL,
	"exercise_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "exercise_index" integer;
--> statement-breakpoint
WITH ranked AS (
	SELECT "id", row_number() OVER (PARTITION BY "date", "language" ORDER BY "id") AS position
	FROM "exercises"
)
UPDATE "exercises" AS target
SET "exercise_index" = ranked.position
FROM ranked
WHERE target."id" = ranked."id" AND target."exercise_index" IS NULL;
--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "exercise_index" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercises_date_language_index_unique"
	ON "exercises" ("date", "language", "exercise_index");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE cascade,
	"status" text DEFAULT 'pending' NOT NULL,
	"audio_url" text,
	"score" integer,
	"completed_at" timestamp with time zone,
	CONSTRAINT "user_progress_user_id_exercise_id_unique" UNIQUE("user_id", "exercise_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"default_language" text DEFAULT 'zh' NOT NULL,
	"daily_count" integer DEFAULT 3 NOT NULL,
	"time_zone" text DEFAULT 'Asia/Shanghai' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercise_generation_locks" (
	"date" date NOT NULL,
	"language" text NOT NULL,
	"owner_token" uuid NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	CONSTRAINT "exercise_generation_locks_date_language_pk" PRIMARY KEY("date", "language")
);
