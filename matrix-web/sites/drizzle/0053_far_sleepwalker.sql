CREATE TABLE `topic_research_control_keys` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`research_id` text,
	`receipt_table` text,
	`payload_sha256` text,
	`result_json` text,
	`legacy_conflict` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`)
);
--> statement-breakpoint
-- Existing receipt keys participate immediately, including conflicts, without data migration.
CREATE VIEW topic_research_effective_control_keys AS
 SELECT owner,request_key,research_id,receipt_table,payload_sha256,result_json,legacy_conflict,created FROM topic_research_control_keys
 UNION ALL SELECT owner,request_key,CASE WHEN count(*)=1 THEN min(research_id) END,CASE WHEN count(*)=1 THEN min(receipt_table) END,
 CASE WHEN count(*)=1 THEN min(payload_sha256) END,CASE WHEN count(*)=1 THEN min(result_json) END,CASE WHEN count(*)=1 THEN 0 ELSE 1 END,min(created)
 FROM (SELECT owner,request_key,research_id,'control' AS receipt_table,payload_sha256,result_json,created FROM topic_research_control_receipts
 UNION ALL SELECT owner,request_key,research_id,'settlement' AS receipt_table,payload_sha256,result_json,created FROM topic_research_execution_settlements) old
 WHERE NOT EXISTS(SELECT 1 FROM topic_research_control_keys k WHERE k.owner=old.owner AND k.request_key=old.request_key)
 GROUP BY owner,request_key;
--> statement-breakpoint
CREATE TRIGGER topic_control_key_no_update BEFORE UPDATE ON topic_research_control_keys BEGIN SELECT RAISE(ABORT,'immutable_topic_control_key'); END;
--> statement-breakpoint
CREATE TRIGGER topic_control_key_no_delete BEFORE DELETE ON topic_research_control_keys BEGIN SELECT RAISE(ABORT,'immutable_topic_control_key'); END;
--> statement-breakpoint
-- AFTER fires only for a real inserted receipt, so same-table identical retries
-- retain INSERT OR IGNORE idempotency. Explicit ABORT cannot be swallowed by the
-- outer INSERT OR IGNORE conflict policy and rolls back the entire D1 batch.
CREATE TRIGGER topic_control_receipt_claim_key AFTER INSERT ON topic_research_control_receipts BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM topic_research_control_keys WHERE owner=NEW.owner AND request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM topic_research_execution_settlements WHERE owner=NEW.owner AND request_key=NEW.request_key) THEN RAISE(ABORT,'topic_control_request_conflict') END;
 INSERT INTO topic_research_control_keys(owner,request_key,research_id,receipt_table,payload_sha256,result_json,legacy_conflict,created) VALUES(NEW.owner,NEW.request_key,NEW.research_id,'control',NEW.payload_sha256,NEW.result_json,0,NEW.created); END;
--> statement-breakpoint
CREATE TRIGGER topic_settlement_claim_key AFTER INSERT ON topic_research_execution_settlements BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM topic_research_control_keys WHERE owner=NEW.owner AND request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM topic_research_control_receipts WHERE owner=NEW.owner AND request_key=NEW.request_key) THEN RAISE(ABORT,'topic_control_request_conflict') END;
 INSERT INTO topic_research_control_keys(owner,request_key,research_id,receipt_table,payload_sha256,result_json,legacy_conflict,created) VALUES(NEW.owner,NEW.request_key,NEW.research_id,'settlement',NEW.payload_sha256,NEW.result_json,0,NEW.created); END;
