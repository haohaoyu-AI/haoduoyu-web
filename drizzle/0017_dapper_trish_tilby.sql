CREATE TABLE `editorial_request_outbox` (
	`request_id` text PRIMARY KEY NOT NULL,
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
CREATE TABLE `editorial_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`input_json` text NOT NULL,
	`input_sha256` text NOT NULL,
	`state` text NOT NULL,
	`claim_hash` text,
	`claim_expires` text,
	`flow_id` text,
	`progress_json` text NOT NULL,
	`dispatch_state` text NOT NULL,
	`error` text,
	`expires` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_requests_owner_key` ON `editorial_requests` (`owner`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_requests_owner_flow` ON `editorial_requests` (`owner`,`flow_id`);