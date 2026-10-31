ALTER TABLE `matrix_review_articles` ADD `reference_article_id` text;
--> statement-breakpoint
ALTER TABLE `matrix_review_playbooks` ADD `status` text CONSTRAINT "matrix_review_playbook_status" CHECK("status" IS NULL OR "status" IN ('draft','active','archived'));
