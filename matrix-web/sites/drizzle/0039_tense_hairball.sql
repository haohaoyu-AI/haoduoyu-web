CREATE TABLE `dedao_actions` (
	`batch_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`action` text NOT NULL,
	`action_id` text NOT NULL,
	`state` text NOT NULL,
	`observation_json` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`batch_id`, `ordinal`, `action`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_action_identity` ON `dedao_actions` (`action_id`);--> statement-breakpoint
CREATE TABLE `dedao_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`total` integer NOT NULL,
	`state` text NOT NULL,
	`current_ordinal` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`started` text,
	`finished` text,
	`executor_id` text,
	`execution_id` text,
	`claim_hash` text,
	`lease_until` text,
	`heartbeat` text,
	`executor_ended` integer DEFAULT 1 NOT NULL,
	`failure` text,
	`dispatch_state` text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "dedao_positive_total" CHECK(typeof("dedao_batches"."total")='integer' AND "dedao_batches"."total">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_owner_request` ON `dedao_batches` (`owner`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_one_active_batch` ON `dedao_batches` (`owner`) WHERE "dedao_batches"."state" != 'completed';--> statement-breakpoint
CREATE TABLE `dedao_chunks` (
	`batch_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`offset` integer NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	PRIMARY KEY(`batch_id`, `ordinal`, `offset`)
);
--> statement-breakpoint
CREATE TABLE `dedao_executors` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`browser_session` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`heartbeat` text NOT NULL,
	`ready` integer NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `dedao_items` (
	`batch_id` text NOT NULL,
	`owner` text NOT NULL,
	`ordinal` integer NOT NULL,
	`id` text NOT NULL,
	`title` text,
	`stage` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`final_ref` text,
	`download_json` text,
	`article_id` text,
	`upload_state` text,
	`submitted_handoff_id` text,
	`submitted` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`batch_id`, `ordinal`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_item_identity` ON `dedao_items` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_item_article` ON `dedao_items` (`article_id`);