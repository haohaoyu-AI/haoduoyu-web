CREATE TABLE `article_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`platform` text NOT NULL,
	`state` text NOT NULL,
	`claim_token` text,
	`claim_expires` text,
	`draft_url` text,
	`message` text,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deliveries_owner_article` ON `article_deliveries` (`owner`,`article_id`);