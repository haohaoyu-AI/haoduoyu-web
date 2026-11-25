ALTER TABLE `matrix_review_articles` ADD `publish_status` text CONSTRAINT "matrix_review_article_publish_status" CHECK("publish_status" IS NULL OR "publish_status" IN ('pending','published','unmatched'));
--> statement-breakpoint
ALTER TABLE `matrix_review_articles` ADD `draft_saved_at` text;
--> statement-breakpoint
ALTER TABLE `matrix_review_articles` ADD `alternate_titles_json` text CONSTRAINT "matrix_review_article_alternate_titles_json" CHECK("alternate_titles_json" IS NULL OR CASE WHEN json_valid("alternate_titles_json") THEN json_type("alternate_titles_json")='array' ELSE 0 END);
