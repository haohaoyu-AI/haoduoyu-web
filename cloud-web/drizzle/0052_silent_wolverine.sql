CREATE TABLE `topic_research_execution_fences` (
	`owner` text NOT NULL,
	`research_id` text NOT NULL,
	`holder_key` text NOT NULL,
	`claim_sha256` text,
	`input_sha256` text NOT NULL,
	`held_at` text NOT NULL,
	PRIMARY KEY(`owner`, `research_id`, `holder_key`)
);
--> statement-breakpoint
CREATE TABLE `topic_research_execution_settlements` (
	`owner` text NOT NULL,
	`research_id` text NOT NULL,
	`holder_key` text NOT NULL,
	`claim_sha256` text,
	`input_sha256` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`evidence_json` text NOT NULL,
	`result_json` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `research_id`, `holder_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_research_settlement_request` ON `topic_research_execution_settlements` (`owner`,`request_key`);--> statement-breakpoint
-- Schema-only compatibility projection: old evidence remains blocking before materialization.
CREATE VIEW topic_research_effective_fences AS
 SELECT owner,research_id,holder_key,claim_sha256,input_sha256,held_at FROM topic_research_execution_fences
 UNION ALL SELECT h.owner,h.research_id,h.claim_sha256,h.claim_sha256,COALESCE(r.input_hash,'unknown'),h.created
 FROM topic_research_holders h LEFT JOIN topic_research_runs r ON r.owner=h.owner AND r.id=h.research_id
 WHERE NOT EXISTS(SELECT 1 FROM topic_research_execution_fences f WHERE f.owner=h.owner AND f.research_id=h.research_id AND f.holder_key=h.claim_sha256)
 UNION ALL SELECT r.owner,r.id,r.claim_hash,r.claim_hash,r.input_hash,r.updated FROM topic_research_runs r WHERE r.claim_hash IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM topic_research_execution_fences f WHERE f.owner=r.owner AND f.research_id=r.id AND f.holder_key=r.claim_hash)
 AND NOT EXISTS(SELECT 1 FROM topic_research_holders h WHERE h.owner=r.owner AND h.research_id=r.id AND h.claim_sha256=r.claim_hash)
 UNION ALL SELECT r.owner,r.id,'legacy-unknown',NULL,r.input_hash,r.updated FROM topic_research_runs r WHERE r.state IN ('researching','completed','failed') AND r.claim_hash IS NULL
 AND NOT EXISTS(SELECT 1 FROM topic_research_execution_fences f WHERE f.owner=r.owner AND f.research_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM topic_research_holders h WHERE h.owner=r.owner AND h.research_id=r.id);
--> statement-breakpoint
CREATE TRIGGER topic_fence_no_update BEFORE UPDATE ON topic_research_execution_fences BEGIN SELECT RAISE(ABORT,'immutable_topic_execution_fence'); END;
--> statement-breakpoint
CREATE TRIGGER topic_fence_no_delete BEFORE DELETE ON topic_research_execution_fences BEGIN SELECT RAISE(ABORT,'immutable_topic_execution_fence'); END;
--> statement-breakpoint
CREATE TRIGGER topic_settlement_no_update BEFORE UPDATE ON topic_research_execution_settlements BEGIN SELECT RAISE(ABORT,'immutable_topic_execution_settlement'); END;
--> statement-breakpoint
CREATE TRIGGER topic_settlement_no_delete BEFORE DELETE ON topic_research_execution_settlements BEGIN SELECT RAISE(ABORT,'immutable_topic_execution_settlement'); END;
--> statement-breakpoint
CREATE TRIGGER topic_settlement_scope BEFORE INSERT ON topic_research_execution_settlements WHEN NOT EXISTS(
 SELECT 1 FROM topic_research_effective_fences f JOIN topic_research_holders h ON h.owner=f.owner AND h.research_id=f.research_id AND h.claim_sha256=f.claim_sha256
 WHERE f.owner=NEW.owner AND f.research_id=NEW.research_id AND f.holder_key=NEW.holder_key AND f.claim_sha256=NEW.claim_sha256 AND f.input_sha256=NEW.input_sha256
 AND json_valid(NEW.evidence_json) AND json_extract(NEW.evidence_json,'$.verified')=1 AND json_extract(NEW.evidence_json,'$.verification_source')='authenticated_executor_terminal'
 AND json_extract(NEW.evidence_json,'$.owner')=f.owner AND json_extract(NEW.evidence_json,'$.research_id')=f.research_id AND json_extract(NEW.evidence_json,'$.input_hash')=f.input_sha256 AND json_extract(NEW.evidence_json,'$.claim_sha256')=f.claim_sha256
 AND json_extract(NEW.evidence_json,'$.claimed_at')=h.created AND json_extract(NEW.evidence_json,'$.epoch')=h.epoch AND json_extract(NEW.evidence_json,'$.execution_id')=h.execution_id AND h.execution_id IS NOT NULL
 AND json_extract(NEW.evidence_json,'$.mapping_verified')=1 AND json_extract(NEW.evidence_json,'$.complete_action_inventory')=1 AND json_extract(NEW.evidence_json,'$.all_actions_stopped')=1
 AND json_extract(NEW.evidence_json,'$.terminal_state') IN ('completed','failed','cancelled') AND json_type(NEW.evidence_json,'$.actions')='array'
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.evidence_json,'$.actions') a WHERE json_extract(a.value,'$.state') IS NOT 'settled' OR length(trim(json_extract(a.value,'$.settled_reference')))=0)
 AND julianday(json_extract(NEW.evidence_json,'$.ended_at'))>=julianday(h.created)
) BEGIN SELECT RAISE(ABORT,'topic_settlement_requires_verified_exact_execution'); END;
--> statement-breakpoint
CREATE TRIGGER topic_claim_capture_fence AFTER UPDATE OF claim_hash ON topic_research_runs WHEN NEW.claim_hash IS NOT NULL AND NEW.claim_hash IS NOT OLD.claim_hash BEGIN
 INSERT OR IGNORE INTO topic_research_execution_fences(owner,research_id,holder_key,claim_sha256,input_sha256,held_at) VALUES(NEW.owner,NEW.id,NEW.claim_hash,NEW.claim_hash,NEW.input_hash,NEW.updated); END;
--> statement-breakpoint
CREATE TRIGGER topic_holder_capture_fence AFTER INSERT ON topic_research_holders BEGIN
 INSERT OR IGNORE INTO topic_research_execution_fences(owner,research_id,holder_key,claim_sha256,input_sha256,held_at) SELECT NEW.owner,NEW.research_id,NEW.claim_sha256,NEW.claim_sha256,input_hash,NEW.created FROM topic_research_runs WHERE owner=NEW.owner AND id=NEW.research_id; END;
--> statement-breakpoint
CREATE TRIGGER topic_new_run_execution_fence BEFORE INSERT ON topic_research_runs WHEN EXISTS(
 SELECT 1 FROM topic_research_effective_fences f WHERE f.owner=NEW.owner AND NOT EXISTS(SELECT 1 FROM topic_research_execution_settlements s WHERE s.owner=f.owner AND s.research_id=f.research_id AND s.holder_key=f.holder_key AND s.claim_sha256 IS f.claim_sha256 AND s.input_sha256=f.input_sha256)
) BEGIN SELECT RAISE(ABORT,'topic_execution_unsettled'); END;
--> statement-breakpoint
CREATE TRIGGER topic_new_claim_execution_fence BEFORE UPDATE OF claim_hash ON topic_research_runs WHEN NEW.claim_hash IS NOT NULL AND NEW.claim_hash IS NOT OLD.claim_hash AND EXISTS(
 SELECT 1 FROM topic_research_effective_fences f WHERE f.owner=NEW.owner AND NOT EXISTS(SELECT 1 FROM topic_research_execution_settlements s WHERE s.owner=f.owner AND s.research_id=f.research_id AND s.holder_key=f.holder_key AND s.claim_sha256 IS f.claim_sha256 AND s.input_sha256=f.input_sha256)
) BEGIN SELECT RAISE(ABORT,'topic_execution_unsettled'); END;
--> statement-breakpoint
CREATE TRIGGER topic_clear_claim_execution_fence BEFORE UPDATE OF claim_hash ON topic_research_runs WHEN NEW.claim_hash IS NULL AND OLD.claim_hash IS NOT NULL AND EXISTS(
 SELECT 1 FROM topic_research_effective_fences f WHERE f.owner=OLD.owner AND f.research_id=OLD.id AND f.claim_sha256=OLD.claim_hash AND NOT EXISTS(SELECT 1 FROM topic_research_execution_settlements s WHERE s.owner=f.owner AND s.research_id=f.research_id AND s.holder_key=f.holder_key AND s.claim_sha256 IS f.claim_sha256 AND s.input_sha256=f.input_sha256)
) BEGIN SELECT RAISE(ABORT,'topic_execution_unsettled'); END;
--> statement-breakpoint
CREATE TRIGGER topic_run_no_delete BEFORE DELETE ON topic_research_runs BEGIN SELECT RAISE(ABORT,'topic_execution_audit_retained'); END;
--> statement-breakpoint
-- Also protect legacy writers that insert a claimed/terminal row directly.
CREATE TRIGGER topic_insert_capture_fence AFTER INSERT ON topic_research_runs WHEN NEW.claim_hash IS NOT NULL OR NEW.state IN ('researching','completed','failed') BEGIN
 INSERT OR IGNORE INTO topic_research_execution_fences(owner,research_id,holder_key,claim_sha256,input_sha256,held_at) VALUES(NEW.owner,NEW.id,COALESCE(NEW.claim_hash,'legacy-unknown'),NEW.claim_hash,NEW.input_hash,NEW.updated); END;
--> statement-breakpoint
CREATE TRIGGER topic_terminal_capture_missing_fence AFTER UPDATE OF state ON topic_research_runs WHEN NEW.state IN ('completed','failed') AND NOT EXISTS(SELECT 1 FROM topic_research_effective_fences f WHERE f.owner=NEW.owner AND f.research_id=NEW.id) BEGIN
 INSERT OR IGNORE INTO topic_research_execution_fences(owner,research_id,holder_key,claim_sha256,input_sha256,held_at) VALUES(NEW.owner,NEW.id,COALESCE(NEW.claim_hash,'legacy-unknown'),NEW.claim_hash,NEW.input_hash,NEW.updated); END;

--> statement-breakpoint
-- Keep the implicit legacy row durable before an old writer changes business state.
-- At most one OLD-row identity is copied by this ordinary runtime mutation.
CREATE TRIGGER topic_preserve_legacy_before_update BEFORE UPDATE ON topic_research_runs BEGIN
 INSERT OR IGNORE INTO topic_research_execution_fences(owner,research_id,holder_key,claim_sha256,input_sha256,held_at)
 SELECT OLD.owner,OLD.id,COALESCE(OLD.claim_hash,'legacy-unknown'),OLD.claim_hash,OLD.input_hash,OLD.updated
 WHERE OLD.claim_hash IS NOT NULL OR (OLD.state IN ('researching','completed','failed')
 AND NOT EXISTS(SELECT 1 FROM topic_research_execution_fences f WHERE f.owner=OLD.owner AND f.research_id=OLD.id)
 AND NOT EXISTS(SELECT 1 FROM topic_research_holders h WHERE h.owner=OLD.owner AND h.research_id=OLD.id)); END;
--> statement-breakpoint
CREATE TRIGGER topic_frozen_input_no_change BEFORE UPDATE OF input_hash ON topic_research_runs WHEN NEW.input_hash IS NOT OLD.input_hash BEGIN SELECT RAISE(ABORT,'immutable_topic_frozen_input'); END;
