CREATE TABLE "movement_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer,
	"row_number" integer,
	"company" text NOT NULL,
	"customer_name" text NOT NULL,
	"identification_raw" text NOT NULL,
	"identification" text NOT NULL,
	"check_digit" text,
	"person_type" text NOT NULL,
	"withdrawals" integer,
	"date_from" timestamp with time zone,
	"date_to" timestamp with time zone,
	"amount" numeric(18, 2) NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"error" text,
	"invoice_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movement_imports" ADD CONSTRAINT "movement_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_import_id_movement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."movement_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "movements_unique" ON "movements" USING btree ("company","identification_raw","date_from","date_to","amount");--> statement-breakpoint
CREATE INDEX "movements_status" ON "movements" USING btree ("status");