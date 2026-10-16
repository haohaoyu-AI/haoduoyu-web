CREATE TABLE `article_claim_credential_hashes` (
	`owner` text NOT NULL,
	`sha256` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_claim_owner_sha256` ON `article_claim_credential_hashes` (`owner`,`sha256`);--> statement-breakpoint
CREATE TABLE `article_upload_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`platform` text NOT NULL,
	`target_account` text NOT NULL,
	`word_sha256` text NOT NULL,
	`word_size` integer NOT NULL,
	`authorization_kind` text NOT NULL,
	`claim_hash` text NOT NULL,
	`preflight` text NOT NULL,
	`baseline` text NOT NULL,
	`state` text NOT NULL,
	`editor_urls` text NOT NULL,
	`readback` text,
	`created` text NOT NULL,
	`consumed_at` text,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_upload_owner_article_platform` ON `article_upload_attempts` (`owner`,`article_id`,`platform`);--> statement-breakpoint
ALTER TABLE `articles` ADD `upload_guard_version` integer DEFAULT 0 NOT NULL;