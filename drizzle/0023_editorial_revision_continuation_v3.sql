CREATE TABLE `editorial_revision_continuations_v3` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`authorization_key` text NOT NULL,
	`run_id` text NOT NULL,
	`source_stage_id` text NOT NULL,
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
	`old_delegation_sha256` text NOT NULL,
	`new_stage_id` text NOT NULL,
	`new_input_sha256` text NOT NULL,
	`new_token_sha256` text NOT NULL,
	`expires` text NOT NULL,
	`created` text NOT NULL,
	CONSTRAINT "editorial_revision_continuations_v3_run" CHECK("editorial_revision_continuations_v3"."run_id" = 'bd6d4434-273b-426e-a17f-9390fc124c84'),
	CONSTRAINT "editorial_revision_continuations_v3_source" CHECK("editorial_revision_continuations_v3"."source_stage_id" = '496c9348-7de3-4322-8462-55892b8162b0'),
	CONSTRAINT "editorial_revision_continuations_v3_scope" CHECK("editorial_revision_continuations_v3"."scope" = 'editorial_v3_one_explicit_unknown_revision_continuation'),
	CONSTRAINT "editorial_revision_continuations_v3_state" CHECK("editorial_revision_continuations_v3"."state" = 'allocated')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_revision_continuations_v3_owner_source` ON `editorial_revision_continuations_v3` (`owner`,`source_stage_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_revision_continuations_v3_owner_key` ON `editorial_revision_continuations_v3` (`owner`,`authorization_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_revision_continuations_v3_owner_new_stage` ON `editorial_revision_continuations_v3` (`owner`,`new_stage_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_revision_continuations_v3_token` ON `editorial_revision_continuations_v3` (`new_token_sha256`);