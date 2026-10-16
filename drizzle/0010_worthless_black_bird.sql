CREATE TABLE `article_deletions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`state` text NOT NULL,
	`started_at` text NOT NULL,
	`deleted_at` text,
	`object_count` integer,
	`lock_token` text,
	`lock_expires` text
);
