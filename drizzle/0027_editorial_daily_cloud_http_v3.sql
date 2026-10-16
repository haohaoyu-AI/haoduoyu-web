CREATE TABLE `editorial_daily_cloud_delegations_v3` (
	`stage_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`authority_id` text NOT NULL,
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
	CONSTRAINT "editorial_daily_cloud_kind" CHECK("editorial_daily_cloud_delegations_v3"."stage_kind" IN ('outline','outline_revision','body','structure_revision','fact_revision')),
	CONSTRAINT "editorial_daily_cloud_round" CHECK("editorial_daily_cloud_delegations_v3"."current_round" >= 0),
	CONSTRAINT "editorial_daily_cloud_transport" CHECK("editorial_daily_cloud_delegations_v3"."transport" = 'cloud_http_once'),
	CONSTRAINT "editorial_daily_cloud_state" CHECK("editorial_daily_cloud_delegations_v3"."state" IN ('delegated','started'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_daily_cloud_delegations_v3_token` ON `editorial_daily_cloud_delegations_v3` (`token_sha256`);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_daily_cloud_delegations_v3_owner_stage_round` ON `editorial_daily_cloud_delegations_v3` (`owner`,`run_id`,`stage_kind`,`current_round`);
