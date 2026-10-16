CREATE TABLE `dedao_dispatches` (
	`owner` text NOT NULL,
	`batch_id` text NOT NULL,
	`queue_revision` text NOT NULL,
	`dispatch_key` text NOT NULL,
	`dispatcher_id` text NOT NULL,
	`target_environment` text NOT NULL,
	`selection_sha256` text NOT NULL,
	`selection_ref` text NOT NULL,
	`state` text NOT NULL,
	`thread_id` text,
	`session_id` text,
	`turn_id` text,
	`previous_thread_id` text,
	`previous_session_id` text,
	`previous_turn_id` text,
	`creation_json` text,
	`unknown_json` text,
	`stop_json` text,
	`not_created_json` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`owner`, `batch_id`, `queue_revision`),
	CONSTRAINT "dedao_dispatch_state" CHECK("dedao_dispatches"."state" IN ('reserved','unknown','created','not_created','stopped')),
	CONSTRAINT "dedao_dispatch_identity" CHECK("dedao_dispatches"."state" NOT IN ('created','stopped') OR ("dedao_dispatches"."thread_id" IS NOT NULL AND "dedao_dispatches"."session_id" IS NOT NULL AND "dedao_dispatches"."turn_id" IS NOT NULL AND "dedao_dispatches"."creation_json" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_dispatch_key` ON `dedao_dispatches` (`owner`,`dispatch_key`);
--> statement-breakpoint
CREATE TABLE `dedao_wake_outbox` (
	`owner` text NOT NULL,
	`batch_id` text NOT NULL,
	`queue_revision` text NOT NULL,
	`event_id` text NOT NULL,
	`state` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`owner`, `batch_id`, `queue_revision`),
	CONSTRAINT "dedao_wake_state" CHECK("dedao_wake_outbox"."state" IN ('pending','sending','accepted','unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_wake_event` ON `dedao_wake_outbox` (`event_id`);
--> statement-breakpoint
ALTER TABLE `dedao_batch_runtime` ADD `dispatch_mode` text DEFAULT 'fixed' NOT NULL CONSTRAINT dedao_batch_dispatch_mode CHECK (`dispatch_mode` IN ('fixed','dynamic'));
