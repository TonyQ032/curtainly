CREATE TABLE "filter_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"keyword" text NOT NULL,
	"created_by" text,
	"review_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filter_rules_source_keyword_uq" UNIQUE NULLS NOT DISTINCT("source_id","keyword")
);
--> statement-breakpoint
ALTER TABLE "filter_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "filter_rules" ADD CONSTRAINT "filter_rules_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_rules" ADD CONSTRAINT "filter_rules_review_item_id_review_items_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."review_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Global keywords (#26). Whole words, normalized (lowercase, no punctuation). Kept
-- conservative: a filtered item never reaches the queue, so single words that are
-- also show titles ("Master Class", "Camp Rock") are left to per-source rules.
INSERT INTO "filter_rules" ("source_id", "keyword") VALUES
	(NULL, 'gala'),
	(NULL, 'fundraiser'),
	(NULL, 'audition'),
	(NULL, 'auditions'),
	(NULL, 'acting class'),
	(NULL, 'acting classes'),
	(NULL, 'masterclass'),
	(NULL, 'summer camp'),
	(NULL, 'theatre camp'),
	(NULL, 'theater camp'),
	(NULL, 'drama camp'),
	(NULL, 'staged reading'),
	(NULL, 'play reading'),
	(NULL, 'reading series'),
	(NULL, 'improv'),
	(NULL, 'open mic'),
	(NULL, 'gift card'),
	(NULL, 'gift certificate'),
	(NULL, 'season subscription'),
	(NULL, 'flex pass'),
	(NULL, 'parking'),
	(NULL, 'donation')
ON CONFLICT DO NOTHING;
