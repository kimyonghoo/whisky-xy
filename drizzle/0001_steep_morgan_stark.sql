CREATE TABLE "fx_rates" (
	"date" text PRIMARY KEY NOT NULL,
	"usd_krw" real NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kr_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"bottle_key" text NOT NULL,
	"dailyshot_product_id" text NOT NULL,
	"name_ko" text NOT NULL,
	"name_en" text,
	"image_url" text,
	"low_price_krw" integer NOT NULL,
	"high_price_krw" integer,
	"offer_count" integer,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "kr_links_bottle_key_unique" UNIQUE("bottle_key")
);
