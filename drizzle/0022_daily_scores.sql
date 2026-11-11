CREATE TABLE `matrix_daily_scores` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`score` integer NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "matrix_daily_scores_score" CHECK(typeof("score")='integer' AND "score" BETWEEN 1 AND 10),
	CONSTRAINT "matrix_daily_scores_version" CHECK(typeof("version")='integer' AND "version" >= 1),
	CONSTRAINT "matrix_daily_scores_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("date",'+0 days') IS NOT NULL AND date("date",'+0 days') = "date")
);
