CREATE TABLE `editorial_agent_claim_recoveries_v3` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`scope` text NOT NULL,
	`input_sha256` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`authority_id` text NOT NULL,
	`authority_evidence_sha256` text NOT NULL,
	`claim_fingerprint` text NOT NULL,
	`old_token_sha256` text NOT NULL,
	`new_token_sha256` text NOT NULL,
	`confirmation_json` text NOT NULL,
	`confirmation_sha256` text NOT NULL,
	`created` text NOT NULL,
	CONSTRAINT "editorial_agent_claim_recovery_scope" CHECK("editorial_agent_claim_recoveries_v3"."scope" = 'editorial_v3_same_stage_unpaid_agent_claim_recovery')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_agent_claim_recoveries_v3_owner_stage` ON `editorial_agent_claim_recoveries_v3` (`owner`,`stage_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_agent_claim_recoveries_v3_token` ON `editorial_agent_claim_recoveries_v3` (`new_token_sha256`);