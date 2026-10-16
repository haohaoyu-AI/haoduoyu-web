CREATE TABLE `matrix_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "matrix_account_active" CHECK("matrix_accounts"."active" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `matrix_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`platform_article_id` text,
	`published_at` text NOT NULL,
	`started_at` text,
	`production_mode` text DEFAULT 'unknown' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `matrix_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matrix_article_mode" CHECK("matrix_articles"."production_mode" IN ('manual','automatic','mixed','unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_article_url` ON `matrix_articles` (`account_id`,`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_article_platform_id` ON `matrix_articles` (`account_id`,`platform_article_id`) WHERE "matrix_articles"."platform_article_id" IS NOT NULL AND "matrix_articles"."platform_article_id" != '';--> statement-breakpoint
CREATE INDEX `matrix_article_account_date` ON `matrix_articles` (`account_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `matrix_login_attempts` (
	`bucket` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `matrix_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity_id` text,
	`detail_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `matrix_audit_entity_time` ON `matrix_audit` (`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `matrix_control` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`initialized` integer DEFAULT 0 NOT NULL,
	`revision_guard` integer DEFAULT 1 NOT NULL,
	`auth_guard` integer DEFAULT 1 NOT NULL,
	`setup_guard` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "matrix_single_control" CHECK("matrix_control"."id"=1),
	CONSTRAINT "matrix_revision_match" CHECK("matrix_control"."revision_guard"=1),
	CONSTRAINT "matrix_auth_match" CHECK("matrix_control"."auth_guard"=1),
	CONSTRAINT "matrix_setup_match" CHECK("matrix_control"."setup_guard"=1)
);
--> statement-breakpoint
CREATE TABLE `matrix_daily_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`article_id` text,
	`date` text NOT NULL,
	`metrics_json` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `matrix_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `matrix_articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_daily_account_day` ON `matrix_daily_metrics` (`account_id`,`date`) WHERE "matrix_daily_metrics"."article_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_daily_article_day` ON `matrix_daily_metrics` (`account_id`,`article_id`,`date`) WHERE "matrix_daily_metrics"."article_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `matrix_idempotency` (
	`actor` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`status` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`actor`, `key`)
);
--> statement-breakpoint
CREATE TABLE `matrix_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`account_ids_json` text NOT NULL,
	`permissions_json` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_key_hash` ON `matrix_api_keys` (`token_hash`);--> statement-breakpoint
CREATE TABLE `matrix_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`as_of` text NOT NULL,
	`collected_at` text NOT NULL,
	`kind` text NOT NULL,
	`metrics_json` text NOT NULL,
	`source` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `matrix_articles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matrix_observation_kind" CHECK("matrix_observations"."kind" IN ('latest','d1','d3','d7'))
);
--> statement-breakpoint
CREATE INDEX `matrix_observation_article_time` ON `matrix_observations` (`article_id`,`as_of`);--> statement-breakpoint
CREATE TABLE `matrix_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matrix_session_user` ON `matrix_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `matrix_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_username` ON `matrix_users` (`username`);