CREATE TABLE `editorial_body_continuations_v3` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`authorization_key` text NOT NULL,
	`run_id` text NOT NULL,
	`failed_stage_id` text NOT NULL,
	`scope` text NOT NULL,
	`state` text NOT NULL,
	`request_json` text NOT NULL,
	`request_sha256` text NOT NULL,
	`evidence_json` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`frozen_json` text NOT NULL,
	`frozen_sha256` text NOT NULL,
	`old_receipt_id` text NOT NULL,
	`old_receipt_sha256` text NOT NULL,
	`new_stage_id` text NOT NULL,
	`new_input_sha256` text NOT NULL,
	`new_token_sha256` text NOT NULL,
	`expires` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_body_continuations_v3_owner_failed` ON `editorial_body_continuations_v3` (`owner`,`failed_stage_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_body_continuations_v3_owner_key` ON `editorial_body_continuations_v3` (`owner`,`authorization_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_body_continuations_v3_owner_new_stage` ON `editorial_body_continuations_v3` (`owner`,`new_stage_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_body_continuations_v3_owner_token_sha` ON `editorial_body_continuations_v3` (`owner`,`new_token_sha256`);
