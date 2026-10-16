CREATE TABLE `local_word_queue_claims` (
	`owner` text NOT NULL,
	`claim_request_key` text NOT NULL,
	`execution_id` text NOT NULL,
	`job_id` text,
	`input_sha256` text,
	`claim_hash` text,
	`grant_ciphertext` text,
	`expires` text,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `claim_request_key`),
	CONSTRAINT "local_word_queue_identity" CHECK(("local_word_queue_claims"."job_id" IS NULL AND "local_word_queue_claims"."input_sha256" IS NULL AND "local_word_queue_claims"."claim_hash" IS NULL AND "local_word_queue_claims"."grant_ciphertext" IS NULL AND "local_word_queue_claims"."expires" IS NULL) OR ("local_word_queue_claims"."job_id" IS NOT NULL AND substr("local_word_queue_claims"."job_id",1,10)='localword_' AND "local_word_queue_claims"."input_sha256" IS NOT NULL AND length("local_word_queue_claims"."input_sha256")=64 AND "local_word_queue_claims"."claim_hash" IS NOT NULL AND length("local_word_queue_claims"."claim_hash")=64 AND "local_word_queue_claims"."grant_ciphertext" IS NOT NULL AND "local_word_queue_claims"."expires" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_word_queue_owner_job` ON `local_word_queue_claims` (`owner`,`job_id`);
--> statement-breakpoint
CREATE TRIGGER `local_word_queue_claims_immutable` BEFORE UPDATE ON `local_word_queue_claims`
BEGIN SELECT RAISE(ABORT, 'local_word_queue_receipt_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `local_word_queue_claims_retained` BEFORE DELETE ON `local_word_queue_claims`
BEGIN SELECT RAISE(ABORT, 'local_word_queue_receipt_retained'); END;
