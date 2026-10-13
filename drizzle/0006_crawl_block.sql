ALTER TABLE "crawl_state" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crawl_state" ADD COLUMN "block_reason" text;