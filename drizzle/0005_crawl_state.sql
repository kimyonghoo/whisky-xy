CREATE TABLE "crawl_state" (
	"store_id" text PRIMARY KEY NOT NULL,
	"next_list_page" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
