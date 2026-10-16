-- Atomic D1 migration only: preserve every pre-existing end row and restore
-- the original seven trigger definitions byte-for-byte. Runtime never disables
-- capacity guards or removes immutable blocks/fences.
CREATE TABLE `article_purge_executor_observations` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`article_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`purge_snapshot_sha256` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`claim_sha256` text NOT NULL,
	`input_sha256` text NOT NULL,
	`acquisition_request_key` text NOT NULL,
	`original_receipt_sha256` text NOT NULL,
	`observed_execution_sha256` text NOT NULL,
	`thread_sha256` text NOT NULL,
	`turn_sha256` text NOT NULL,
	`mapping_reference_sha256` text NOT NULL,
	`end_reference_sha256` text NOT NULL,
	`settled_reference_sha256` text NOT NULL,
	`acquired_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`observed_at` text NOT NULL,
	`terminal_state` text NOT NULL,
	`evidence_source` text NOT NULL,
	`all_actions_stopped` integer NOT NULL,
	`all_actions_settled` integer NOT NULL,
	`server_verified` integer NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "article_purge_observation_hashes" CHECK(length("article_purge_executor_observations"."snapshot_sha256")=64 AND "article_purge_executor_observations"."snapshot_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."purge_snapshot_sha256")=64 AND "article_purge_executor_observations"."purge_snapshot_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."payload_sha256")=64 AND "article_purge_executor_observations"."payload_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."claim_sha256")=64 AND "article_purge_executor_observations"."claim_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."input_sha256")=64 AND "article_purge_executor_observations"."input_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."original_receipt_sha256")=64 AND "article_purge_executor_observations"."original_receipt_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."observed_execution_sha256")=64 AND "article_purge_executor_observations"."observed_execution_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."thread_sha256")=64 AND "article_purge_executor_observations"."thread_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."turn_sha256")=64 AND "article_purge_executor_observations"."turn_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."mapping_reference_sha256")=64 AND "article_purge_executor_observations"."mapping_reference_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."end_reference_sha256")=64 AND "article_purge_executor_observations"."end_reference_sha256" NOT GLOB '*[^a-f0-9]*' AND length("article_purge_executor_observations"."settled_reference_sha256")=64 AND "article_purge_executor_observations"."settled_reference_sha256" NOT GLOB '*[^a-f0-9]*'),
	CONSTRAINT "article_purge_observation_evidence" CHECK("article_purge_executor_observations"."terminal_state" IN ('completed','failed','cancelled') AND "article_purge_executor_observations"."evidence_source"='codex_app_tools' AND "article_purge_executor_observations"."all_actions_stopped"=1 AND "article_purge_executor_observations"."all_actions_settled"=1 AND "article_purge_executor_observations"."server_verified"=0),
	CONSTRAINT "article_purge_observation_chronology" CHECK(julianday("article_purge_executor_observations"."acquired_at") IS NOT NULL AND julianday("article_purge_executor_observations"."ended_at") IS NOT NULL AND julianday("article_purge_executor_observations"."observed_at") IS NOT NULL AND julianday("article_purge_executor_observations"."created") IS NOT NULL AND julianday("article_purge_executor_observations"."ended_at")>=julianday("article_purge_executor_observations"."acquired_at") AND julianday("article_purge_executor_observations"."observed_at")>=julianday("article_purge_executor_observations"."ended_at") AND julianday("article_purge_executor_observations"."created")>=julianday("article_purge_executor_observations"."observed_at"))
);
--> statement-breakpoint
CREATE INDEX `article_purge_executor_observations_article` ON `article_purge_executor_observations` (`owner`,`article_id`,`operation_id`);--> statement-breakpoint
DROP TRIGGER article_purge_external_holder_word_execution_receipts_insert;
--> statement-breakpoint
DROP TRIGGER article_purge_external_holder_word_serial_slots_insert;
--> statement-breakpoint
DROP TRIGGER article_purge_external_holder_word_recovery_update;
--> statement-breakpoint
DROP TRIGGER article_purge_external_holder_word_recovery_insert;
--> statement-breakpoint
CREATE TABLE `__new_article_purge_executor_ends` (
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`claim_sha256` text NOT NULL,
	`execution_sha256` text,
	`input_sha256` text NOT NULL,
	`grant_request_key` text,
	`token_sha256` text,
	`epoch` integer,
	`acquisition_request_key` text,
	`holder_mode` text NOT NULL,
	`observed_execution_sha256` text NOT NULL,
	`evidence_kind` text NOT NULL,
	`end_reference_sha256` text NOT NULL,
	`settled_reference_sha256` text NOT NULL,
	`all_actions_stopped` integer NOT NULL,
	`all_actions_settled` integer NOT NULL,
	`server_verified` integer NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "article_purge_end_hashes" CHECK(length("__new_article_purge_executor_ends"."payload_sha256")=64 AND length("__new_article_purge_executor_ends"."claim_sha256")=64 AND length("__new_article_purge_executor_ends"."input_sha256")=64 AND length("__new_article_purge_executor_ends"."observed_execution_sha256")=64 AND length("__new_article_purge_executor_ends"."end_reference_sha256")=64 AND length("__new_article_purge_executor_ends"."settled_reference_sha256")=64 AND ("__new_article_purge_executor_ends"."execution_sha256" IS NULL OR length("__new_article_purge_executor_ends"."execution_sha256")=64) AND ("__new_article_purge_executor_ends"."token_sha256" IS NULL OR length("__new_article_purge_executor_ends"."token_sha256")=64)),
	CONSTRAINT "article_purge_end_evidence" CHECK("__new_article_purge_executor_ends"."holder_mode" IN ('mapped_executor','manual_help') AND "__new_article_purge_executor_ends"."evidence_kind" IN ('holder_acknowledgement','owner_observed_codex_terminal') AND ("__new_article_purge_executor_ends"."evidence_kind"='holder_acknowledgement' OR "__new_article_purge_executor_ends"."holder_mode"='manual_help') AND "__new_article_purge_executor_ends"."all_actions_stopped"=1 AND "__new_article_purge_executor_ends"."all_actions_settled"=1 AND "__new_article_purge_executor_ends"."server_verified"=0)
);
--> statement-breakpoint
INSERT INTO `__new_article_purge_executor_ends`("owner", "article_id", "operation_id", "request_key", "payload_sha256", "claim_sha256", "execution_sha256", "input_sha256", "grant_request_key", "token_sha256", "epoch", "acquisition_request_key", "holder_mode", "observed_execution_sha256", "evidence_kind", "end_reference_sha256", "settled_reference_sha256", "all_actions_stopped", "all_actions_settled", "server_verified", "created") SELECT "owner", "article_id", "operation_id", "request_key", "payload_sha256", "claim_sha256", "execution_sha256", "input_sha256", "grant_request_key", "token_sha256", "epoch", "acquisition_request_key", "holder_mode", "observed_execution_sha256", "evidence_kind", "end_reference_sha256", "settled_reference_sha256", "all_actions_stopped", "all_actions_settled", "server_verified", "created" FROM `article_purge_executor_ends`;--> statement-breakpoint
DROP TABLE `article_purge_executor_ends`;--> statement-breakpoint
ALTER TABLE `__new_article_purge_executor_ends` RENAME TO `article_purge_executor_ends`;--> statement-breakpoint
CREATE INDEX `article_purge_executor_ends_article` ON `article_purge_executor_ends` (`owner`,`article_id`,`operation_id`);
--> statement-breakpoint
CREATE TRIGGER article_purge_executor_ends_original_holder_insert BEFORE INSERT ON article_purge_executor_ends
WHEN NOT EXISTS(SELECT 1 FROM article_purge_serial_blocks b WHERE NEW.owner IS b.owner AND NEW.article_id IS b.article_id AND NEW.operation_id IS b.operation_id AND NEW.claim_sha256 IS b.claim_sha256 AND NEW.execution_sha256 IS b.execution_sha256 AND NEW.input_sha256 IS b.input_sha256 AND NEW.grant_request_key IS b.grant_request_key AND NEW.token_sha256 IS b.token_sha256 AND NEW.epoch IS b.epoch AND NEW.acquisition_request_key IS b.acquisition_request_key AND NEW.holder_mode IS b.holder_mode AND NEW.all_actions_stopped=1 AND NEW.all_actions_settled=1 AND NEW.server_verified=0 AND ((b.holder_mode='mapped_executor' AND b.claim_sha256 IS NOT NULL AND b.execution_sha256 IS NOT NULL AND b.input_sha256 IS NOT NULL AND b.grant_request_key IS NOT NULL AND b.token_sha256 IS NOT NULL AND b.epoch>=1 AND NEW.observed_execution_sha256=b.execution_sha256) OR (b.holder_mode='manual_help' AND b.claim_sha256 IS NOT NULL AND b.input_sha256 IS NOT NULL AND b.acquisition_request_key IS NOT NULL AND b.execution_sha256 IS NULL AND b.token_sha256 IS NULL AND b.epoch IS NULL AND b.grant_request_key IS NULL)))
BEGIN SELECT RAISE(ABORT,'article_purge_original_holder_settlement_required'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_executor_ends_immutable_update BEFORE UPDATE ON article_purge_executor_ends BEGIN SELECT RAISE(ABORT,'immutable_article_purge_end_evidence'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_executor_ends_immutable_delete BEFORE DELETE ON article_purge_executor_ends BEGIN SELECT RAISE(ABORT,'immutable_article_purge_end_evidence'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_external_holder_word_execution_receipts_insert BEFORE INSERT ON word_execution_receipts WHEN EXISTS(SELECT 1 FROM article_purge_serial_blocks b WHERE b.owner=NEW.owner AND NOT EXISTS(SELECT 1 FROM article_purge_executor_ends e WHERE e.owner IS b.owner AND e.article_id IS b.article_id AND e.operation_id IS b.operation_id AND e.claim_sha256 IS b.claim_sha256 AND e.execution_sha256 IS b.execution_sha256 AND e.input_sha256 IS b.input_sha256 AND e.grant_request_key IS b.grant_request_key AND e.token_sha256 IS b.token_sha256 AND e.epoch IS b.epoch AND e.acquisition_request_key IS b.acquisition_request_key AND e.holder_mode IS b.holder_mode AND e.all_actions_stopped=1 AND e.all_actions_settled=1 AND e.server_verified=0)) BEGIN SELECT RAISE(ABORT,'external_word_executor_end_unconfirmed'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_external_holder_word_serial_slots_insert BEFORE INSERT ON word_serial_slots WHEN EXISTS(SELECT 1 FROM article_purge_serial_blocks b WHERE b.owner=NEW.owner AND NOT EXISTS(SELECT 1 FROM article_purge_executor_ends e WHERE e.owner IS b.owner AND e.article_id IS b.article_id AND e.operation_id IS b.operation_id AND e.claim_sha256 IS b.claim_sha256 AND e.execution_sha256 IS b.execution_sha256 AND e.input_sha256 IS b.input_sha256 AND e.grant_request_key IS b.grant_request_key AND e.token_sha256 IS b.token_sha256 AND e.epoch IS b.epoch AND e.acquisition_request_key IS b.acquisition_request_key AND e.holder_mode IS b.holder_mode AND e.all_actions_stopped=1 AND e.all_actions_settled=1 AND e.server_verified=0)) BEGIN SELECT RAISE(ABORT,'external_word_executor_end_unconfirmed'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_external_holder_word_recovery_update BEFORE UPDATE ON word_recovery WHEN NEW.token_hash IS NOT NULL AND (NEW.token_hash IS NOT OLD.token_hash OR NEW.execution_id IS NOT OLD.execution_id OR NEW.epoch IS NOT OLD.epoch) AND EXISTS(SELECT 1 FROM article_purge_serial_blocks b WHERE b.owner=NEW.owner AND NOT EXISTS(SELECT 1 FROM article_purge_executor_ends e WHERE e.owner IS b.owner AND e.article_id IS b.article_id AND e.operation_id IS b.operation_id AND e.claim_sha256 IS b.claim_sha256 AND e.execution_sha256 IS b.execution_sha256 AND e.input_sha256 IS b.input_sha256 AND e.grant_request_key IS b.grant_request_key AND e.token_sha256 IS b.token_sha256 AND e.epoch IS b.epoch AND e.acquisition_request_key IS b.acquisition_request_key AND e.holder_mode IS b.holder_mode AND e.all_actions_stopped=1 AND e.all_actions_settled=1 AND e.server_verified=0)) BEGIN SELECT RAISE(ABORT,'external_word_executor_end_unconfirmed'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_external_holder_word_recovery_insert BEFORE INSERT ON word_recovery WHEN NEW.token_hash IS NOT NULL AND EXISTS(SELECT 1 FROM article_purge_serial_blocks b WHERE b.owner=NEW.owner AND NOT EXISTS(SELECT 1 FROM article_purge_executor_ends e WHERE e.owner IS b.owner AND e.article_id IS b.article_id AND e.operation_id IS b.operation_id AND e.claim_sha256 IS b.claim_sha256 AND e.execution_sha256 IS b.execution_sha256 AND e.input_sha256 IS b.input_sha256 AND e.grant_request_key IS b.grant_request_key AND e.token_sha256 IS b.token_sha256 AND e.epoch IS b.epoch AND e.acquisition_request_key IS b.acquisition_request_key AND e.holder_mode IS b.holder_mode AND e.all_actions_stopped=1 AND e.all_actions_settled=1 AND e.server_verified=0)) BEGIN SELECT RAISE(ABORT,'external_word_executor_end_unconfirmed'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_executor_observations_bound_insert BEFORE INSERT ON article_purge_executor_observations
WHEN NOT EXISTS(SELECT 1 FROM article_purge_serial_blocks b
 JOIN article_list_deletions o ON o.owner=b.owner AND o.id=b.operation_id
 JOIN article_deletions x ON x.owner=b.owner AND x.id=b.article_id AND x.operation_id=b.operation_id
 WHERE ((((((NEW.owner IS b.owner) AND (NEW.article_id IS b.article_id)) AND ((NEW.operation_id IS b.operation_id) AND (NEW.claim_sha256 IS b.claim_sha256))) AND (((NEW.input_sha256 IS b.input_sha256) AND (NEW.acquisition_request_key IS b.acquisition_request_key)) AND ((b.holder_mode='manual_help') AND ((b.claim_sha256 IS NOT NULL) AND (b.input_sha256 IS NOT NULL))))) AND ((((b.acquisition_request_key IS NOT NULL) AND (b.execution_sha256 IS NULL)) AND ((b.token_sha256 IS NULL) AND (b.epoch IS NULL))) AND (((b.grant_request_key IS NULL) AND (o.scope='all_articles')) AND ((o.state='deleted') AND ((o.confirmed_at IS NOT NULL) AND (o.deleted_at IS NOT NULL)))))) AND (((((x.state='deleted') AND (x.deleted_at IS NOT NULL)) AND ((NEW.purge_snapshot_sha256 IS o.snapshot_sha256) AND (julianday(NEW.acquired_at)<=julianday(o.created)))) AND (((NEW.evidence_source='codex_app_tools') AND (NEW.terminal_state IN ('completed','failed','cancelled'))) AND ((NEW.all_actions_stopped=1) AND ((NEW.all_actions_settled=1) AND (NEW.server_verified=0))))) AND ((((EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=b.owner AND f.article_id=b.article_id AND f.operation_id=b.operation_id AND f.entity_kind='article_help_queue_claims' AND f.entity_key=b.acquisition_request_key)) AND (EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].graph') h
 JOIN article_content_fences f ON f.owner=b.owner AND f.article_id=b.article_id AND f.operation_id=b.operation_id AND f.entity_kind='article_handoffs' AND f.entity_key=json_extract(h.value,'$.values[0]')
 WHERE json_extract(h.value,'$.table')='article_handoffs' AND json_extract(h.value,'$.article_id')=b.article_id AND json_extract(h.value,'$.keys')=json_array('id') AND json_extract(h.value,'$.action')='delete'))) AND ((EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].graph') g
 WHERE json_extract(g.value,'$.table')='article_help_queue_claims' AND json_extract(g.value,'$.article_id')=b.article_id
 AND json_extract(g.value,'$.keys')=json_array('request_key') AND json_extract(g.value,'$.values')=json_array(b.acquisition_request_key)
 AND json_extract(g.value,'$.fingerprint')=NEW.original_receipt_sha256 AND json_extract(g.value,'$.action')='delete')) AND (EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].safety') z
 WHERE json_extract(z.value,'$.article_id')=b.article_id AND json_extract(z.value,'$.holder_mode')='manual_help'
 AND json_extract(z.value,'$.claim_sha256') IS b.claim_sha256 AND json_extract(z.value,'$.input_sha256') IS b.input_sha256
 AND json_extract(z.value,'$.acquisition_request_key') IS b.acquisition_request_key
 AND json_extract(z.value,'$.execution_sha256') IS NULL AND json_extract(z.value,'$.token_sha256') IS NULL
 AND json_extract(z.value,'$.epoch') IS NULL AND json_extract(z.value,'$.grant_request_key') IS NULL)))) AND (((NOT EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].graph') g
 WHERE json_extract(g.value,'$.article_id')=b.article_id AND json_extract(g.value,'$.table') IN ('word_execution_receipts','word_serial_slots'))) AND (NOT EXISTS(SELECT 1 FROM word_execution_receipts r WHERE r.owner=b.owner AND r.target_kind='article' AND r.target_id=b.article_id))) AND ((NOT EXISTS(SELECT 1 FROM word_serial_slots r WHERE r.owner=b.owner AND r.target_kind='article' AND r.target_id=b.article_id)) AND ((NOT EXISTS(SELECT 1 FROM word_recovery r WHERE r.owner=b.owner AND r.target_kind='article' AND r.target_id=b.article_id AND (r.token_hash IS NOT NULL OR r.execution_id IS NOT NULL))) AND (NOT EXISTS(SELECT 1 FROM articles a WHERE a.owner=b.owner AND a.id=b.article_id)))))))))
BEGIN SELECT RAISE(ABORT,'article_purge_owner_observation_binding_required'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_executor_observations_immutable_update BEFORE UPDATE ON article_purge_executor_observations BEGIN SELECT RAISE(ABORT,'immutable_article_purge_owner_observation'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_executor_observations_immutable_delete BEFORE DELETE ON article_purge_executor_observations BEGIN SELECT RAISE(ABORT,'immutable_article_purge_owner_observation'); END;
--> statement-breakpoint
CREATE TRIGGER article_purge_executor_ends_owner_observation_insert BEFORE INSERT ON article_purge_executor_ends
WHEN NEW.evidence_kind='owner_observed_codex_terminal' AND NOT EXISTS(
 SELECT 1 FROM article_purge_executor_observations p JOIN article_purge_serial_blocks b ON p.owner IS b.owner AND p.article_id IS b.article_id AND p.operation_id IS b.operation_id
 JOIN article_list_deletions o ON o.owner=b.owner AND o.id=b.operation_id
 JOIN article_deletions x ON x.owner=b.owner AND x.id=b.article_id AND x.operation_id=b.operation_id
 WHERE ((((((NEW.owner IS p.owner) AND (NEW.request_key IS p.request_key)) AND ((NEW.article_id IS p.article_id) AND ((NEW.operation_id IS p.operation_id) AND (NEW.payload_sha256 IS p.payload_sha256)))) AND (((NEW.claim_sha256 IS p.claim_sha256) AND (NEW.input_sha256 IS p.input_sha256)) AND ((NEW.acquisition_request_key IS p.acquisition_request_key) AND ((NEW.observed_execution_sha256 IS p.observed_execution_sha256) AND (NEW.end_reference_sha256 IS p.end_reference_sha256))))) AND ((((NEW.settled_reference_sha256 IS p.settled_reference_sha256) AND (NEW.created IS p.created)) AND ((NEW.all_actions_stopped=p.all_actions_stopped) AND ((NEW.all_actions_settled=p.all_actions_settled) AND (NEW.server_verified=p.server_verified)))) AND (((NEW.holder_mode='manual_help') AND ((b.holder_mode='manual_help') AND (NEW.execution_sha256 IS NULL))) AND ((NEW.token_sha256 IS NULL) AND ((NEW.epoch IS NULL) AND (NEW.grant_request_key IS NULL)))))) AND (((((NEW.claim_sha256 IS b.claim_sha256) AND (NEW.input_sha256 IS b.input_sha256)) AND ((NEW.acquisition_request_key IS b.acquisition_request_key) AND ((b.execution_sha256 IS NULL) AND (b.token_sha256 IS NULL)))) AND (((b.epoch IS NULL) AND (b.grant_request_key IS NULL)) AND ((p.evidence_source='codex_app_tools') AND ((p.terminal_state IN ('completed','failed','cancelled')) AND (p.all_actions_stopped=1))))) AND ((((p.all_actions_settled=1) AND (p.server_verified=0)) AND ((p.purge_snapshot_sha256 IS o.snapshot_sha256) AND ((o.scope='all_articles') AND (o.state='deleted')))) AND (((o.confirmed_at IS NOT NULL) AND ((o.deleted_at IS NOT NULL) AND (x.state='deleted'))) AND ((x.deleted_at IS NOT NULL) AND ((NOT EXISTS(SELECT 1 FROM word_execution_receipts r WHERE r.owner=b.owner AND r.target_kind='article' AND r.target_id=b.article_id)) AND (NOT EXISTS(SELECT 1 FROM word_serial_slots r WHERE r.owner=b.owner AND r.target_kind='article' AND r.target_id=b.article_id)))))))))
BEGIN SELECT RAISE(ABORT,'article_purge_owner_observation_required'); END;
