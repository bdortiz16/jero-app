CREATE TABLE "credit_note_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer,
	"invoice_number" text NOT NULL,
	"id_key" text NOT NULL,
	"identification" text NOT NULL,
	"beneficiary" text,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"reason" text NOT NULL,
	"detail" text NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"admin_note" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "credit_note_requests" ADD CONSTRAINT "credit_note_requests_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_requests" ADD CONSTRAINT "credit_note_requests_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_note_requests_status" ON "credit_note_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "credit_note_requests_key" ON "credit_note_requests" USING btree ("id_key");