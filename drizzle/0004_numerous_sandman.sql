CREATE TABLE `writing_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`day` text NOT NULL,
	`state` text NOT NULL,
	`token` text,
	`expires` text,
	`article_id` text NOT NULL,
	`topic` text,
	`sources` text,
	`body_hash` text,
	`error` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `writing_owner_day` ON `writing_runs` (`owner`,`day`);