CREATE TABLE `hot_benchmark_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hot_benchmark_owner_url` ON `hot_benchmark_accounts` (`owner`,`url`);--> statement-breakpoint
CREATE TABLE `hot_benchmark_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`state` text NOT NULL,
	`accounts_json` text NOT NULL,
	`result_json` text,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hot_benchmark_owner_request` ON `hot_benchmark_scans` (`owner`,`request_key`);--> statement-breakpoint
CREATE INDEX `hot_benchmark_owner_created` ON `hot_benchmark_scans` (`owner`,`created`);