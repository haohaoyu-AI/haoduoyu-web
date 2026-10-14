-- Preserve the consumed-only branch and all immutable history/index fences.
DROP TRIGGER article_upload_child_lineage;
--> statement-breakpoint
CREATE TRIGGER article_upload_child_lineage BEFORE INSERT ON article_upload_attempts
WHEN NEW.previous_attempt_id IS NOT NULL AND ((NEW.authorization_kind!='unconsumed_continuation' AND NOT EXISTS(
 SELECT 1 FROM article_upload_attempts p JOIN article_upload_executor_ends e ON e.attempt_id=p.id
 WHERE p.id=NEW.previous_attempt_id AND p.owner=NEW.owner AND p.article_id=NEW.article_id AND p.platform=NEW.platform
 AND p.target_account=NEW.target_account AND p.word_sha256=NEW.word_sha256 AND p.word_size=NEW.word_size
 AND p.attempt_version+1=NEW.attempt_version AND p.consumed_at IS NOT NULL
 AND NEW.authorization_kind='owner_confirmed_reimport' AND NEW.authorization_key IS NOT NULL
 AND NEW.reimport_authorization IS NOT NULL AND NEW.consume_token_sha256 IS NOT NULL AND NEW.confirmation_message_id IS NOT NULL
 AND e.owner=p.owner AND e.article_id=p.article_id AND e.platform=p.platform
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=p.owner AND newer.article_id=p.article_id AND newer.platform=p.platform AND newer.attempt_version>p.attempt_version)
)) OR (NEW.authorization_kind='unconsumed_continuation' AND NOT EXISTS(
 SELECT 1 FROM article_upload_attempts p
 WHERE p.id=NEW.previous_attempt_id AND p.owner=NEW.owner AND p.article_id=NEW.article_id AND p.platform=NEW.platform
 AND p.target_account=NEW.target_account AND p.word_sha256=NEW.word_sha256 AND p.word_size=NEW.word_size AND p.baseline=NEW.baseline
 AND p.attempt_version+1=NEW.attempt_version AND p.state='reserved' AND p.consumed_at IS NULL AND p.editor_urls='[]' AND p.readback IS NULL
 AND p.authorization_kind IN ('new_word','owner_confirmed_never_submitted','owner_confirmed_reimport','owner_confirmed_legacy_reimport','unconsumed_continuation')
 AND p.claim_hash!=NEW.claim_hash AND NEW.consume_token_sha256 IS NOT NULL AND NEW.authorization_key IS NOT NULL AND NEW.confirmation_message_id IS NULL
 AND json_extract(NEW.reimport_authorization,'$.request.confirm_unconsumed_recovery')=1
 AND json_extract(NEW.reimport_authorization,'$.request.prior_executor_stopped')=1
 AND json_extract(NEW.reimport_authorization,'$.request.preserve_existing_draft')=1
 AND json_extract(NEW.reimport_authorization,'$.request.confirm_new_draft')=1
 AND json_extract(NEW.reimport_authorization,'$.request.previous_attempt_id')=p.id
 AND json_extract(NEW.reimport_authorization,'$.request.expected_attempt_revision')=p.revision
 AND length(json_extract(NEW.reimport_authorization,'$.request.confirmation_message_id'))>0
 AND length(json_extract(NEW.reimport_authorization,'$.request.prior_executor_end_reference'))>0
 AND p.id IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.id')
 AND p.revision IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.revision')
 AND p.owner IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.owner')
 AND p.article_id IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.article_id')
 AND p.platform IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.platform')
 AND p.target_account IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.target_account')
 AND p.word_sha256 IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.word_sha256')
 AND p.word_size IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.word_size')
 AND p.authorization_kind IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.authorization_kind')
 AND p.claim_hash IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.claim_hash')
 AND p.preflight IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.preflight')
 AND p.baseline IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.baseline')
 AND p.state IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.state')
 AND p.editor_urls IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.editor_urls')
 AND p.readback IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.readback')
 AND p.created IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.created')
 AND p.consumed_at IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.consumed_at')
 AND p.updated IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.updated')
 AND p.attempt_version IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.attempt_version')
 AND p.previous_attempt_id IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.previous_attempt_id')
 AND p.authorization_key IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.authorization_key')
 AND p.reimport_authorization IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.reimport_authorization')
 AND p.consume_token_sha256 IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.consume_token_sha256')
 AND p.confirmation_message_id IS json_extract(NEW.reimport_authorization,'$.parent_snapshot.confirmation_message_id')
 AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.attempt_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts n WHERE n.owner=p.owner AND n.article_id=p.article_id AND n.platform=p.platform AND n.attempt_version>p.attempt_version)
)))
BEGIN SELECT RAISE(ABORT,'Upload child lineage is invalid'); END;

