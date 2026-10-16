CREATE TABLE `word_checkpoints` (
	`owner` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`asset_id` text NOT NULL,
	`kind` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`chunks` integer NOT NULL,
	`metadata_json` text NOT NULL,
	`verification_json` text,
	`parts_json` text NOT NULL,
	`state` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `target_kind`, `target_id`, `asset_id`),
	CONSTRAINT "word_checkpoint_kind" CHECK("word_checkpoints"."kind" IN ('image','word')),
	CONSTRAINT "word_checkpoint_size" CHECK("word_checkpoints"."size">0 AND "word_checkpoints"."size"<=20971520),
	CONSTRAINT "word_checkpoint_state" CHECK("word_checkpoints"."state" IN ('incomplete','ready'))
);
--> statement-breakpoint
CREATE TABLE `word_execution_receipts` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`claim_hash` text NOT NULL,
	`token_hash` text NOT NULL,
	`execution_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_execution_token_once` ON `word_execution_receipts` (`owner`,`token_hash`);--> statement-breakpoint
CREATE TABLE `word_image_candidates` (
	`owner` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`source_url` text NOT NULL,
	`source_title` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text NOT NULL,
	`replacement_for` text,
	`asset_id` text,
	`payload_sha256` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `target_kind`, `target_id`, `candidate_id`),
	CONSTRAINT "word_candidate_outcome" CHECK("word_image_candidates"."outcome" IN ('download_failed','skipped','ready'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_candidate_url_once` ON `word_image_candidates` (`owner`,`target_kind`,`target_id`,`source_url`);--> statement-breakpoint
CREATE TABLE `word_recovery` (
	`owner` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`claim_hash` text NOT NULL,
	`version` integer NOT NULL,
	`epoch` integer NOT NULL,
	`desired` text NOT NULL,
	`execution_id` text,
	`request_key` text,
	`token_hash` text,
	`lease_until` text,
	`heartbeat_at` text,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`retry_count` integer NOT NULL,
	`retry_after` text,
	`minimum_images` integer,
	`legacy_output_binding` text,
	`updated` text NOT NULL,
	PRIMARY KEY(`owner`, `target_kind`, `target_id`),
	CONSTRAINT "word_recovery_target" CHECK("word_recovery"."target_kind" IN ('article','local_word')),
	CONSTRAINT "word_recovery_intent" CHECK("word_recovery"."desired" IN ('run','paused','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `word_recovery_capacity` ON `word_recovery` (`owner`,`desired`,`status`,`lease_until`);--> statement-breakpoint
CREATE TABLE `word_service_incidents` (
	`owner` text NOT NULL,
	`dependency` text NOT NULL,
	`reason` text NOT NULL,
	`state` text NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	PRIMARY KEY(`owner`, `dependency`, `reason`)
);

--> statement-breakpoint
CREATE TRIGGER word_recovery_cleanup_deleted_article AFTER DELETE ON articles BEGIN DELETE FROM word_recovery WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;

--> statement-breakpoint
CREATE TRIGGER word_checkpoints_cleanup_deleted_article AFTER DELETE ON articles BEGIN DELETE FROM word_checkpoints WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;

--> statement-breakpoint
CREATE TRIGGER word_execution_receipts_cleanup_deleted_article AFTER DELETE ON articles BEGIN DELETE FROM word_execution_receipts WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;

--> statement-breakpoint
CREATE TRIGGER word_image_candidates_cleanup_deleted_article AFTER DELETE ON articles BEGIN DELETE FROM word_image_candidates WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;

--> statement-breakpoint
CREATE TRIGGER word_execution_receipts_immutable BEFORE UPDATE ON word_execution_receipts BEGIN SELECT RAISE(ABORT,'immutable_word_receipt'); END;

--> statement-breakpoint
CREATE TRIGGER word_image_candidates_immutable BEFORE UPDATE ON word_image_candidates BEGIN SELECT RAISE(ABORT,'immutable_word_receipt'); END;


--> statement-breakpoint
CREATE TRIGGER word_legacy_output_binding_immutable BEFORE UPDATE OF legacy_output_binding ON word_recovery WHEN NEW.legacy_output_binding IS NOT OLD.legacy_output_binding BEGIN SELECT RAISE(ABORT,'immutable_word_legacy_binding'); END;
