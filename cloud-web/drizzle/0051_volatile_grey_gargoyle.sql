CREATE TABLE `topic_research_control_receipts` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`research_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`result_json` text NOT NULL,
	`evidence_json` text,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "topic_research_control_operation" CHECK("topic_research_control_receipts"."operation" IN ('renew','recover'))
);
--> statement-breakpoint
CREATE TABLE `topic_research_holders` (
	`owner` text NOT NULL,
	`research_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`claim_sha256` text NOT NULL,
	`execution_id` text,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `research_id`, `epoch`),
	CONSTRAINT "topic_research_holder_epoch" CHECK("topic_research_holders"."epoch">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_research_holder_hash` ON `topic_research_holders` (`owner`,`research_id`,`claim_sha256`);
--> statement-breakpoint
CREATE TRIGGER topic_holder_no_update BEFORE UPDATE ON topic_research_holders BEGIN SELECT RAISE(ABORT,'immutable_topic_holder'); END;
--> statement-breakpoint
CREATE TRIGGER topic_holder_no_delete BEFORE DELETE ON topic_research_holders BEGIN SELECT RAISE(ABORT,'immutable_topic_holder'); END;
--> statement-breakpoint
CREATE TRIGGER topic_control_no_update BEFORE UPDATE ON topic_research_control_receipts BEGIN SELECT RAISE(ABORT,'immutable_topic_control'); END;
--> statement-breakpoint
CREATE TRIGGER topic_control_no_delete BEFORE DELETE ON topic_research_control_receipts BEGIN SELECT RAISE(ABORT,'immutable_topic_control'); END;
