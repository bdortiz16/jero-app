ALTER TABLE "credit_note_requests" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note_requests" ADD COLUMN "client_message" text;--> statement-breakpoint
ALTER TABLE "credit_note_requests" ADD COLUMN "credit_note_number" text;--> statement-breakpoint
ALTER TABLE "credit_note_requests" ADD COLUMN "credit_note_file" "bytea";--> statement-breakpoint
ALTER TABLE "credit_note_requests" ADD COLUMN "credit_note_file_name" text;--> statement-breakpoint
ALTER TABLE "credit_note_requests" ADD COLUMN "credit_note_at" timestamp with time zone;