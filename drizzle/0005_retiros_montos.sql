ALTER TABLE "withdrawals" ADD COLUMN "invoiced_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "pending_amount" numeric(18, 2);