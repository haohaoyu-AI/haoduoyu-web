CREATE TABLE `daily_editorial_drafts` (
	`run_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`writer` text NOT NULL,
	`day` text NOT NULL,
	`input_snapshot` text NOT NULL,
	`initial_json` text NOT NULL,
	`initial_sha256` text NOT NULL,
	`initial_source` text NOT NULL,
	`provider_attempt_id` text,
	`created` text NOT NULL,
	`final_sha256` text,
	`revision_flow_id` text,
	`verified_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_editorial_owner_article` ON `daily_editorial_drafts` (`owner`,`article_id`);