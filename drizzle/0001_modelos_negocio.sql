CREATE TABLE "business_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "person_type" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "id_type" text;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD COLUMN "model_id" integer;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD COLUMN "params" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_model_id_business_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."business_models"("id") ON DELETE no action ON UPDATE no action;