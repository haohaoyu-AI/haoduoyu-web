CREATE TABLE `article_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`event_id` text NOT NULL,
	`state` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`expires` text NOT NULL,
	CONSTRAINT "article_handoffs_state" CHECK("article_handoffs"."state" IN ('sending','delivered','unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_handoffs_event` ON `article_handoffs` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `article_handoffs_sending` ON `article_handoffs` (`owner`,`article_id`) WHERE "article_handoffs"."state" = 'sending';--> statement-breakpoint
CREATE INDEX `article_handoffs_article` ON `article_handoffs` (`owner`,`article_id`,`created`);--> statement-breakpoint
CREATE TABLE `article_output_restarts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`previous_output_id` text NOT NULL,
	`previous_meta` text NOT NULL,
	`new_output_id` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_output_restarts_previous` ON `article_output_restarts` (`owner`,`article_id`,`previous_output_id`);