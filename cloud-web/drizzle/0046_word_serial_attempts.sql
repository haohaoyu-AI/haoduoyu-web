CREATE TABLE `word_attempt_requests` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`receipt_json` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "word_attempt_request_target" CHECK("word_attempt_requests"."target_kind" IN ('article','local_word')),
	CONSTRAINT "word_attempt_request_operation" CHECK("word_attempt_requests"."operation" IN ('stop','settle','restart')),
	CONSTRAINT "word_attempt_request_hash" CHECK(length("word_attempt_requests"."payload_sha256")=64),
	CONSTRAINT "word_attempt_request_json" CHECK(json_valid("word_attempt_requests"."receipt_json"))
);
--> statement-breakpoint
CREATE TABLE `word_attempts` (
	`owner` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`generation` integer NOT NULL,
	`input_sha256` text NOT NULL,
	`creation_request_key` text NOT NULL,
	`previous_attempt_id` text,
	`strategy_sha256` text NOT NULL,
	`strategy_reference` text NOT NULL,
	`state` text NOT NULL,
	`started_at` text,
	`active_elapsed_ms` integer DEFAULT 0 NOT NULL,
	`active_started_at` text,
	`stop_requested_at` text,
	`ended_at` text,
	`reason` text NOT NULL,
	`initial_manifest_json` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`owner`, `target_kind`, `target_id`, `attempt_id`),
	CONSTRAINT "word_attempt_target" CHECK("word_attempts"."target_kind" IN ('article','local_word')),
	CONSTRAINT "word_attempt_generation_limit" CHECK("word_attempts"."generation" BETWEEN 1 AND 3),
	CONSTRAINT "word_attempt_timer" CHECK("word_attempts"."active_elapsed_ms">=0),
	CONSTRAINT "word_attempt_hashes" CHECK(length("word_attempts"."input_sha256")=64 AND length("word_attempts"."strategy_sha256")=64),
	CONSTRAINT "word_attempt_state" CHECK("word_attempts"."state" IN ('queued','running','stop_requested','waiting_safe_stop','paused_safe','ended','saved','blocked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_attempt_generation` ON `word_attempts` (`owner`,`target_kind`,`target_id`,`generation`);--> statement-breakpoint
CREATE UNIQUE INDEX `word_attempt_creation_request` ON `word_attempts` (`owner`,`creation_request_key`);--> statement-breakpoint
CREATE TABLE `word_serial_slots` (
	`owner` text PRIMARY KEY NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`attempt_id` text NOT NULL,
	`claim_hash` text NOT NULL,
	`execution_id` text NOT NULL,
	`grant_request_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`epoch` integer NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL,
	`held_at` text NOT NULL,
	`updated` text NOT NULL,
	CONSTRAINT "word_serial_target" CHECK("word_serial_slots"."target_kind" IN ('article','local_word')),
	CONSTRAINT "word_serial_state" CHECK("word_serial_slots"."state" IN ('held','waiting_safe_stop')),
	CONSTRAINT "word_serial_hashes" CHECK(length("word_serial_slots"."input_sha256")=64 AND length("word_serial_slots"."claim_hash")=64 AND length("word_serial_slots"."token_hash")=64),
	CONSTRAINT "word_serial_versions" CHECK("word_serial_slots"."epoch">0 AND "word_serial_slots"."version">0)
);
--> statement-breakpoint
DROP INDEX `word_candidate_url_once`;--> statement-breakpoint
ALTER TABLE `word_image_candidates` ADD `attempt_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `word_candidate_url_once` ON `word_image_candidates` (`owner`,`target_kind`,`target_id`,`attempt_id`,`source_url`);--> statement-breakpoint
ALTER TABLE `word_checkpoints` ADD `attempt_id` text;--> statement-breakpoint
ALTER TABLE `word_progress_events` ADD `attempt_id` text;--> statement-breakpoint
ALTER TABLE `word_recovery` ADD `attempt_id` text;
--> statement-breakpoint
CREATE TRIGGER word_attempt_request_immutable BEFORE UPDATE ON word_attempt_requests BEGIN SELECT RAISE(ABORT,'immutable_word_attempt_request'); END;
--> statement-breakpoint
CREATE TRIGGER word_attempt_request_no_delete BEFORE DELETE ON word_attempt_requests WHEN (OLD.target_kind='article' AND EXISTS(SELECT 1 FROM articles WHERE owner=OLD.owner AND id=OLD.target_id AND state<>'deleting')) OR (OLD.target_kind='local_word' AND EXISTS(SELECT 1 FROM local_word_jobs WHERE owner=OLD.owner AND id=OLD.target_id)) BEGIN SELECT RAISE(ABORT,'immutable_word_attempt_request'); END;
--> statement-breakpoint
CREATE TRIGGER word_attempt_identity_immutable BEFORE UPDATE OF owner,target_kind,target_id,attempt_id,generation,input_sha256,creation_request_key,previous_attempt_id,strategy_sha256,strategy_reference,initial_manifest_json,created ON word_attempts BEGIN SELECT RAISE(ABORT,'immutable_word_attempt_identity'); END;
--> statement-breakpoint
CREATE TRIGGER word_attempts_cleanup_deleted_article AFTER DELETE ON articles BEGIN DELETE FROM word_serial_slots WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; DELETE FROM word_attempts WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; DELETE FROM word_attempt_requests WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER word_attempts_cleanup_deleted_local AFTER DELETE ON local_word_jobs BEGIN DELETE FROM word_serial_slots WHERE owner=OLD.owner AND target_kind='local_word' AND target_id=OLD.id; DELETE FROM word_attempts WHERE owner=OLD.owner AND target_kind='local_word' AND target_id=OLD.id; DELETE FROM word_attempt_requests WHERE owner=OLD.owner AND target_kind='local_word' AND target_id=OLD.id; END;

--> statement-breakpoint
CREATE TABLE `word_claim_origins` (
	`owner` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`claim_hash` text NOT NULL,
	`origin` text NOT NULL,
	`proof_reference` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `target_kind`, `target_id`, `claim_hash`),
	CONSTRAINT "word_claim_origin_target" CHECK("word_claim_origins"."target_kind" IN ('article','local_word')),
	CONSTRAINT "word_claim_origin_hash" CHECK(length("word_claim_origins"."claim_hash")=64),
	CONSTRAINT "word_claim_origin_kind" CHECK("word_claim_origins"."origin"='fresh_claim')
);
--> statement-breakpoint
ALTER TABLE `articles` ADD `word_claim_origin_hash` text;
--> statement-breakpoint
CREATE TRIGGER word_claim_origin_immutable BEFORE UPDATE ON word_claim_origins BEGIN SELECT RAISE(ABORT,'immutable_word_claim_origin'); END;
--> statement-breakpoint
CREATE TRIGGER word_claim_origin_no_delete BEFORE DELETE ON word_claim_origins WHEN (OLD.target_kind='article' AND EXISTS(SELECT 1 FROM articles WHERE owner=OLD.owner AND id=OLD.target_id AND state<>'deleting')) OR (OLD.target_kind='local_word' AND EXISTS(SELECT 1 FROM local_word_jobs WHERE owner=OLD.owner AND id=OLD.target_id)) BEGIN SELECT RAISE(ABORT,'immutable_word_claim_origin'); END;
--> statement-breakpoint
CREATE TRIGGER word_claim_origin_cleanup_article AFTER DELETE ON articles BEGIN DELETE FROM word_claim_origins WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER word_claim_origin_cleanup_local AFTER DELETE ON local_word_jobs BEGIN DELETE FROM word_claim_origins WHERE owner=OLD.owner AND target_kind='local_word' AND target_id=OLD.id; END;
