CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"variant_title" text,
	"vendor" text NOT NULL,
	"product_type" text NOT NULL,
	"image_url" text,
	"url" text NOT NULL,
	"price_cents" integer NOT NULL,
	"available" boolean NOT NULL,
	"size_ml" integer,
	"proof" real,
	"batch" text,
	"bottle_key" text NOT NULL,
	"search_text" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "listings_store_variant_unique" UNIQUE("store_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"available" boolean NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"include_terms" text[] NOT NULL,
	"exclude_terms" text[] DEFAULT '{}' NOT NULL,
	"batch" text,
	"size_ml" integer,
	"max_price_cents" integer,
	"regions" text[] DEFAULT '{"brooklyn","nj"}' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_bottle_key_idx" ON "listings" USING btree ("bottle_key");