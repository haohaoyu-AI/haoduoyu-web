CREATE TABLE `editorial_failed_writer_continuations_v3` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`authorization_key` text NOT NULL,
	`run_id` text NOT NULL,
	`source_stage_id` text NOT NULL,
	`stage_kind` text NOT NULL,
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
	`old_delegation_sha256` text,
	`new_stage_id` text NOT NULL,
	`new_input_sha256` text NOT NULL,
	`new_token_sha256` text NOT NULL,
	`expires` text NOT NULL,
	`created` text NOT NULL,
	CONSTRAINT "editorial_failed_writer_continuation_kind" CHECK("editorial_failed_writer_continuations_v3"."stage_kind" IN ('outline','outline_revision','body','structure_revision','fact_revision')),
	CONSTRAINT "editorial_failed_writer_continuation_scope" CHECK("editorial_failed_writer_continuations_v3"."scope" = 'editorial_v3_one_explicit_failed_writer_continuation'),
	CONSTRAINT "editorial_failed_writer_continuation_state" CHECK("editorial_failed_writer_continuations_v3"."state" = 'allocated')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_failed_writer_continuations_v3_owner_source` ON `editorial_failed_writer_continuations_v3` (`owner`,`source_stage_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_failed_writer_continuations_v3_owner_key` ON `editorial_failed_writer_continuations_v3` (`owner`,`authorization_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_failed_writer_continuations_v3_owner_new_stage` ON `editorial_failed_writer_continuations_v3` (`owner`,`new_stage_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_failed_writer_continuations_v3_token` ON `editorial_failed_writer_continuations_v3` (`new_token_sha256`);
--> statement-breakpoint
CREATE TABLE `editorial_failed_writer_cloud_delegations_v3` (
	`stage_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`continuation_id` text NOT NULL,
	`stage_kind` text NOT NULL,
	`current_round` integer NOT NULL,
	`transport` text NOT NULL,
	`token_sha256` text NOT NULL,
	`frozen_json` text NOT NULL,
	`frozen_sha256` text NOT NULL,
	`expires` text NOT NULL,
	`state` text NOT NULL,
	`created` text NOT NULL,
	`started` text,
	CONSTRAINT "editorial_failed_writer_cloud_kind" CHECK("editorial_failed_writer_cloud_delegations_v3"."stage_kind" IN ('outline','outline_revision','body','structure_revision','fact_revision')),
	CONSTRAINT "editorial_failed_writer_cloud_round" CHECK("editorial_failed_writer_cloud_delegations_v3"."current_round" >= 0),
	CONSTRAINT "editorial_failed_writer_cloud_transport" CHECK("editorial_failed_writer_cloud_delegations_v3"."transport" = 'cloud_http_once'),
	CONSTRAINT "editorial_failed_writer_cloud_state" CHECK("editorial_failed_writer_cloud_delegations_v3"."state" IN ('delegated','started'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_failed_writer_cloud_delegations_v3_token` ON `editorial_failed_writer_cloud_delegations_v3` (`token_sha256`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_failed_writer_cloud_delegations_v3_owner_stage_round` ON `editorial_failed_writer_cloud_delegations_v3` (`owner`,`run_id`,`stage_kind`,`current_round`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_failed_writer_cloud_delegations_v3_continuation` ON `editorial_failed_writer_cloud_delegations_v3` (`owner`,`continuation_id`);
