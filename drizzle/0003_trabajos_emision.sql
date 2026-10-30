CREATE TABLE "emission_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"ok" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_seconds" integer DEFAULT 0 NOT NULL,
	"origin" text,
	"locked_until" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "emission_jobs" ADD CONSTRAINT "emission_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;