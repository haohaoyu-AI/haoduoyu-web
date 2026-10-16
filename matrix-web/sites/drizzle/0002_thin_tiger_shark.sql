CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`source_key` text NOT NULL,
	`paragraphs` text NOT NULL,
	`created` text NOT NULL,
	`state` text NOT NULL,
	`error` text,
	`claim_token` text,
	`claim_expires` text,
	`result_key` text,
	`result_meta` text,
	`draft_url` text
);
--> statement-breakpoint
CREATE INDEX `articles_owner_created` ON `articles` (`owner`,`created`);--> statement-breakpoint
ALTER TABLE `event_subscriptions` ADD `event_name` text DEFAULT 'test.created' NOT NULL;