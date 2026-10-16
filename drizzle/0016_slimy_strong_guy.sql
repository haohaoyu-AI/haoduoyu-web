CREATE TABLE `editorial_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`authorization_key` text NOT NULL,
	`article_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`state` text NOT NULL,
	`final_sha256` text,
	`expires` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_owner_authorization` ON `editorial_flows` (`owner`,`authorization_key`);--> statement-breakpoint
CREATE TABLE `editorial_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`stage` text NOT NULL,
	`token` text NOT NULL,
	`input_json` text NOT NULL,
	`input_sha256` text NOT NULL,
	`state` text NOT NULL,
	`artifact_json` text,
	`artifact_sha256` text,
	`actor_id` text,
	`execution_id` text,
	`model` text,
	`provenance` text,
	`receipt_id` text,
	`error` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_owner_run_stage` ON `editorial_stages` (`owner`,`run_id`,`stage`);