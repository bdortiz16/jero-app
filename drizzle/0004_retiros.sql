CREATE TABLE "payment_lookups" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"id_key" text NOT NULL,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"beneficiary" text NOT NULL,
	"id_type" text,
	"identification_raw" text NOT NULL,
	"id_key" text NOT NULL,
	"bank" text,
	"account_last4" text,
	"amount" numeric(18, 2) NOT NULL,
	"net_amount" numeric(18, 2) NOT NULL,
	"status" text,
	"invoice_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payment_lookups_ip" ON "payment_lookups" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "payment_lookups_key" ON "payment_lookups" USING btree ("id_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_unique" ON "withdrawals" USING btree ("company","paid_at","id_key","net_amount");--> statement-breakpoint
CREATE INDEX "withdrawals_id_key" ON "withdrawals" USING btree ("id_key");