CREATE TABLE `editorial_authority_v3` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`authorization_key` text NOT NULL,
	`scope` text NOT NULL,
	`state` text NOT NULL,
	`start_day` text NOT NULL,
	`evidence_json` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`frozen_bindings_json` text NOT NULL,
	`frozen_bindings_sha256` text NOT NULL,
	`policy_json` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_authority_v3_owner_key` ON `editorial_authority_v3` (`owner`,`authorization_key`);--> statement-breakpoint
CREATE TABLE `editorial_runs_v3` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`authority_id` text NOT NULL,
	`request_key` text NOT NULL,
	`run_kind` text NOT NULL,
	`day` text NOT NULL,
	`writer` text NOT NULL,
	`test_intent_key` text,
	`input_json` text NOT NULL,
	`input_sha256` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`state` text NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`initialized` integer DEFAULT 0 NOT NULL,
	`article_id` text NOT NULL,
	`final_sha256` text,
	`error` text,
	`expires` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_runs_v3_owner_request` ON `editorial_runs_v3` (`owner`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_runs_v3_daily_slot` ON `editorial_runs_v3` (`owner`,`day`,`writer`) WHERE run_kind = 'daily';--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_runs_v3_test_intent` ON `editorial_runs_v3` (`owner`,`test_intent_key`) WHERE run_kind = 'workflow_test';--> statement-breakpoint
CREATE TABLE `editorial_stages_v3` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`stage` text NOT NULL,
	`round` integer NOT NULL,
	`sequence` integer NOT NULL,
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
CREATE UNIQUE INDEX `editorial_stages_v3_owner_stage_round` ON `editorial_stages_v3` (`owner`,`run_id`,`stage`,`round`);--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_stages_v3_owner_sequence` ON `editorial_stages_v3` (`owner`,`run_id`,`sequence`);