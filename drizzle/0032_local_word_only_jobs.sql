CREATE TABLE `local_word_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`source_kind` text NOT NULL,
	`output_mode` text NOT NULL,
	`destinations_json` text NOT NULL,
	`filename` text NOT NULL,
	`title` text NOT NULL,
	`leading_blank_paragraphs` integer DEFAULT 0 NOT NULL,
	`source_sha256` text NOT NULL,
	`original_sha256` text NOT NULL,
	`input_sha256` text NOT NULL,
	`input_json` text NOT NULL,
	`artifact_manifest` text NOT NULL,
	`state` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`claim_hash` text,
	`claim_expires` text,
	`output_meta` text,
	`result_key` text,
	`error` text,
	`dispatch_state` text NOT NULL,
	`dispatch_until` text,
	`dispatch_lease` text,
	`dispatch_attempts` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "local_word_jobs_scope" CHECK("local_word_jobs"."source_kind"='local_desktop' AND "local_word_jobs"."output_mode"='word_only' AND "local_word_jobs"."destinations_json"='[]' AND substr("local_word_jobs"."id",1,10)='localword_'),
	CONSTRAINT "local_word_jobs_state" CHECK("local_word_jobs"."state" IN ('queued','processing','word_completed','failed')),
	CONSTRAINT "local_word_jobs_dispatch" CHECK("local_word_jobs"."dispatch_state" IN ('pending','sending','accepted','unknown')),
	CONSTRAINT "local_word_jobs_leading_blanks" CHECK(typeof("local_word_jobs"."leading_blank_paragraphs")='integer' AND "local_word_jobs"."leading_blank_paragraphs" BETWEEN 0 AND 4998)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_word_jobs_owner_request` ON `local_word_jobs` (`owner`,`request_key`);--> statement-breakpoint
CREATE INDEX `local_word_jobs_owner_state` ON `local_word_jobs` (`owner`,`state`,`created`);
--> statement-breakpoint
CREATE TRIGGER `local_word_jobs_frozen_input` BEFORE UPDATE ON `local_word_jobs`
WHEN OLD.id IS NOT NEW.id OR OLD.owner IS NOT NEW.owner OR OLD.request_key IS NOT NEW.request_key
 OR OLD.source_kind IS NOT NEW.source_kind OR OLD.output_mode IS NOT NEW.output_mode OR OLD.destinations_json IS NOT NEW.destinations_json
 OR OLD.filename IS NOT NEW.filename OR OLD.title IS NOT NEW.title OR OLD.leading_blank_paragraphs IS NOT NEW.leading_blank_paragraphs OR OLD.source_sha256 IS NOT NEW.source_sha256
 OR OLD.original_sha256 IS NOT NEW.original_sha256 OR OLD.input_sha256 IS NOT NEW.input_sha256 OR OLD.input_json IS NOT NEW.input_json OR OLD.created IS NOT NEW.created
BEGIN SELECT RAISE(ABORT, 'local_word_frozen_input'); END;
--> statement-breakpoint
CREATE TRIGGER `local_word_jobs_terminal` BEFORE UPDATE ON `local_word_jobs`
WHEN OLD.state IN ('word_completed','failed') AND (OLD.state IS NOT NEW.state OR OLD.result_key IS NOT NEW.result_key OR OLD.output_meta IS NOT NEW.output_meta OR OLD.artifact_manifest IS NOT NEW.artifact_manifest)
BEGIN SELECT RAISE(ABORT, 'local_word_terminal'); END;
