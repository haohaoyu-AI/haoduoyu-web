CREATE TABLE `matrix_review_article_diagnoses` (
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`account` text NOT NULL,
	`prompt_key` text NOT NULL,
	`prompt_version` integer NOT NULL,
	`prompt_hash` text NOT NULL,
	`result_text` text NOT NULL,
	`input_json` text NOT NULL,
	`created_at` text NOT NULL,
	`beijing_date` text NOT NULL,
	PRIMARY KEY(`user_id`, `article_id`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "matrix_review_article_diagnosis_version" CHECK(typeof("prompt_version")='integer' AND "prompt_version" >= 0),
	CONSTRAINT "matrix_review_article_diagnosis_day" CHECK("beijing_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("beijing_date",'+0 days') IS NOT NULL AND date("beijing_date",'+0 days') = "beijing_date")
);
--> statement-breakpoint
CREATE INDEX `matrix_review_article_diagnoses_day` ON `matrix_review_article_diagnoses` (`user_id`,`beijing_date`);
