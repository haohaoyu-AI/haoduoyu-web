CREATE TABLE `editorial_cloud_delegations_v3` (
	`stage_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`continuation_id` text NOT NULL,
	`transport` text NOT NULL,
	`token_sha256` text NOT NULL,
	`frozen_json` text NOT NULL,
	`frozen_sha256` text NOT NULL,
	`expires` text NOT NULL,
	`state` text NOT NULL,
	`created` text NOT NULL,
	`started` text,
	CONSTRAINT "editorial_cloud_transport" CHECK("editorial_cloud_delegations_v3"."transport" = 'cloud_http_once'),
	CONSTRAINT "editorial_cloud_state" CHECK("editorial_cloud_delegations_v3"."state" IN ('delegated','started'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_cloud_delegations_v3_token` ON `editorial_cloud_delegations_v3` (`token_sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_cloud_delegations_v3_continuation` ON `editorial_cloud_delegations_v3` (`owner`,`continuation_id`);