CREATE TABLE `topic_research_heads` (
	`owner` text PRIMARY KEY NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`current_id` text
);
--> statement-breakpoint
CREATE TABLE `topic_research_outbox` (
	`research_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`event_id` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`next_attempt` text,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topic_research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`generation` integer NOT NULL,
	`state` text NOT NULL,
	`input_hash` text NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text,
	`result_hash` text,
	`claim_hash` text,
	`claim_expires` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`error` text,
	`dispatch_state` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_research_owner_request` ON `topic_research_runs` (`owner`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `topic_research_owner_generation` ON `topic_research_runs` (`owner`,`generation`);