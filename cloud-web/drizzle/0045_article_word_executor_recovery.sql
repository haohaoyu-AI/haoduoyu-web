CREATE TABLE `article_word_claim_recoveries` (
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`request_key` text NOT NULL,
	`input_sha256` text NOT NULL,
	`old_claim_hash` text NOT NULL,
	`next_claim_hash` text NOT NULL,
	`expected_fingerprint` text NOT NULL,
	`termination_json` text NOT NULL,
	`confirmation_reference` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`control_version` integer NOT NULL,
	`control_epoch` integer NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "article_word_recovery_hashes" CHECK(length("article_word_claim_recoveries"."input_sha256")=64 AND length("article_word_claim_recoveries"."old_claim_hash")=64 AND length("article_word_claim_recoveries"."next_claim_hash")=64 AND length("article_word_claim_recoveries"."expected_fingerprint")=64 AND length("article_word_claim_recoveries"."payload_sha256")=64 AND "article_word_claim_recoveries"."old_claim_hash"<>"article_word_claim_recoveries"."next_claim_hash"),
	CONSTRAINT "article_word_recovery_proof" CHECK(json_valid("article_word_claim_recoveries"."termination_json")),
	CONSTRAINT "article_word_recovery_version" CHECK("article_word_claim_recoveries"."control_version">=0 AND "article_word_claim_recoveries"."control_epoch">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_word_recovery_old_claim` ON `article_word_claim_recoveries` (`owner`,`old_claim_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `article_word_recovery_next_claim` ON `article_word_claim_recoveries` (`owner`,`next_claim_hash`);--> statement-breakpoint
CREATE TABLE `article_word_executor_ends` (
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`request_key` text NOT NULL,
	`input_sha256` text NOT NULL,
	`claim_hash` text NOT NULL,
	`execution_id` text NOT NULL,
	`epoch` integer,
	`token_hash` text,
	`lease_fingerprint` text NOT NULL,
	`proof_json` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "article_word_end_hashes" CHECK(length("article_word_executor_ends"."input_sha256")=64 AND length("article_word_executor_ends"."claim_hash")=64 AND length("article_word_executor_ends"."lease_fingerprint")=64 AND length("article_word_executor_ends"."payload_sha256")=64 AND ("article_word_executor_ends"."token_hash" IS NULL OR length("article_word_executor_ends"."token_hash")=64)),
	CONSTRAINT "article_word_end_proof" CHECK(json_valid("article_word_executor_ends"."proof_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_word_end_original_executor` ON `article_word_executor_ends` (`owner`,`article_id`,`claim_hash`,`execution_id`);
--> statement-breakpoint
CREATE TRIGGER article_word_end_immutable_update BEFORE UPDATE ON article_word_executor_ends BEGIN SELECT RAISE(ABORT,'article_word_end_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER article_word_end_immutable_delete BEFORE DELETE ON article_word_executor_ends BEGIN SELECT RAISE(ABORT,'article_word_end_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER article_word_recovery_immutable_update BEFORE UPDATE ON article_word_claim_recoveries BEGIN SELECT RAISE(ABORT,'article_word_recovery_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER article_word_recovery_immutable_delete BEFORE DELETE ON article_word_claim_recoveries BEGIN SELECT RAISE(ABORT,'article_word_recovery_immutable'); END;
