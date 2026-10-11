ALTER TABLE "watches" RENAME COLUMN "regions" TO "cities";--> statement-breakpoint
UPDATE "watches" SET "cities" = array_replace("cities", 'ca', 'la');
