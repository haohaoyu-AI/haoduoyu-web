CREATE TABLE `word_execution_queue` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`claim_hash` text NOT NULL,
	`token_hash` text NOT NULL,
	`execution_id` text NOT NULL,
	`execution_scope` text NOT NULL,
	`capacity_reason` text NOT NULL,
	`operation` text NOT NULL,
	`from_epoch` integer,
	`from_version` integer,
	`from_token_hash` text,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "word_queue_target" CHECK("word_execution_queue"."target_kind" IN ('article','local_word')),
	CONSTRAINT "word_queue_resource" CHECK("word_execution_queue"."execution_scope" IN ('prepare','heavy')),
	CONSTRAINT "word_queue_operation" CHECK("word_execution_queue"."operation" IN ('acquire','transition')),
	CONSTRAINT "word_queue_capacity_reason" CHECK("word_execution_queue"."capacity_reason" IN ('total_capacity','heavy_capacity'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_execution_queue_target` ON `word_execution_queue` (`owner`,`target_kind`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `word_execution_queue_token` ON `word_execution_queue` (`owner`,`token_hash`);--> statement-breakpoint
CREATE TABLE `word_execution_requests` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`claim_hash` text NOT NULL,
	`token_hash` text NOT NULL,
	`execution_id` text NOT NULL,
	`execution_scope` text NOT NULL,
	`capacity_reason` text,
	`operation` text NOT NULL,
	`from_epoch` integer,
	`from_version` integer,
	`from_token_hash` text,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "word_request_target" CHECK("word_execution_requests"."target_kind" IN ('article','local_word')),
	CONSTRAINT "word_request_resource" CHECK("word_execution_requests"."execution_scope" IN ('prepare','heavy')),
	CONSTRAINT "word_request_operation" CHECK("word_execution_requests"."operation" IN ('acquire','transition'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_execution_request_token` ON `word_execution_requests` (`owner`,`token_hash`);--> statement-breakpoint
ALTER TABLE `word_recovery` ADD COLUMN `execution_scope` text DEFAULT 'heavy' NOT NULL CONSTRAINT word_recovery_resource CHECK(execution_scope IN ('prepare','heavy'));
--> statement-breakpoint
ALTER TABLE `word_recovery` ADD COLUMN `queue_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `word_execution_receipts` ADD COLUMN `execution_scope` text DEFAULT 'heavy' NOT NULL CONSTRAINT word_receipt_resource CHECK(execution_scope IN ('prepare','heavy'));
--> statement-breakpoint
ALTER TABLE `word_execution_receipts` ADD COLUMN `operation` text DEFAULT 'acquire' NOT NULL CONSTRAINT word_receipt_operation CHECK(operation IN ('acquire','transition'));
--> statement-breakpoint
ALTER TABLE `word_execution_receipts` ADD COLUMN `from_epoch` integer;
--> statement-breakpoint
ALTER TABLE `word_execution_receipts` ADD COLUMN `from_version` integer;
--> statement-breakpoint
ALTER TABLE `word_execution_receipts` ADD COLUMN `from_token_hash` text;
--> statement-breakpoint
CREATE TRIGGER word_execution_queue_immutable BEFORE UPDATE ON word_execution_queue BEGIN SELECT RAISE(ABORT,'immutable_word_queue'); END;
--> statement-breakpoint
CREATE TRIGGER word_execution_requests_immutable BEFORE UPDATE ON word_execution_requests BEGIN SELECT RAISE(ABORT,'immutable_word_request'); END;
--> statement-breakpoint
CREATE TRIGGER word_execution_queue_revision_insert AFTER INSERT ON word_execution_queue BEGIN UPDATE word_recovery SET queue_revision=queue_revision+1 WHERE owner=NEW.owner AND target_kind=NEW.target_kind AND target_id=NEW.target_id; END;
--> statement-breakpoint
CREATE TRIGGER word_execution_queue_revision_delete AFTER DELETE ON word_execution_queue BEGIN UPDATE word_recovery SET queue_revision=queue_revision+1 WHERE owner=OLD.owner AND target_kind=OLD.target_kind AND target_id=OLD.target_id; END;
--> statement-breakpoint
CREATE TRIGGER word_execution_queue_cleanup_deleted_article AFTER DELETE ON articles BEGIN DELETE FROM word_execution_queue WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER word_execution_queue_cleanup_deleted_local_word AFTER DELETE ON local_word_jobs BEGIN DELETE FROM word_execution_queue WHERE owner=OLD.owner AND target_kind='local_word' AND target_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER word_execution_requests_cleanup_deleted_article AFTER DELETE ON articles BEGIN DELETE FROM word_execution_requests WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER word_execution_requests_cleanup_deleted_local_word AFTER DELETE ON local_word_jobs BEGIN DELETE FROM word_execution_requests WHERE owner=OLD.owner AND target_kind='local_word' AND target_id=OLD.id; END;
