-- History migration: old columns/rows are never rewritten and old receipts are retained.
ALTER TABLE article_upload_attempts ADD attempt_version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE article_upload_attempts ADD previous_attempt_id text;
--> statement-breakpoint
ALTER TABLE article_upload_attempts ADD authorization_key text;
--> statement-breakpoint
ALTER TABLE article_upload_attempts ADD reimport_authorization text;
--> statement-breakpoint
ALTER TABLE article_upload_attempts ADD consume_token_sha256 text;
--> statement-breakpoint
ALTER TABLE article_upload_attempts ADD confirmation_message_id text;
--> statement-breakpoint
DROP INDEX article_upload_owner_article_platform;
--> statement-breakpoint
CREATE UNIQUE INDEX article_upload_scope_version ON article_upload_attempts(owner,article_id,platform,attempt_version);
--> statement-breakpoint
CREATE UNIQUE INDEX article_upload_root_scope ON article_upload_attempts(owner,article_id,platform) WHERE previous_attempt_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX article_upload_source_once ON article_upload_attempts(owner,previous_attempt_id) WHERE previous_attempt_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX article_upload_owner_authorization ON article_upload_attempts(owner,authorization_key) WHERE authorization_key IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX article_upload_consume_token ON article_upload_attempts(consume_token_sha256) WHERE consume_token_sha256 IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX article_upload_scope_confirmation ON article_upload_attempts(owner,article_id,platform,confirmation_message_id) WHERE confirmation_message_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE article_upload_executor_ends (
 attempt_id text PRIMARY KEY NOT NULL,owner text NOT NULL,article_id text NOT NULL,platform text NOT NULL,
 attempt_sha256 text NOT NULL,attempt_snapshot text NOT NULL,claim_sha256 text NOT NULL,execution_end_reference text NOT NULL,created text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER article_upload_ended_immutable BEFORE UPDATE ON article_upload_attempts
WHEN EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.attempt_id=OLD.id)
 OR EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Ended upload attempt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER article_upload_history_no_delete BEFORE DELETE ON article_upload_attempts
BEGIN SELECT RAISE(ABORT,'Upload history cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER article_upload_executor_end_no_update BEFORE UPDATE ON article_upload_executor_ends
BEGIN SELECT RAISE(ABORT,'Executor end acknowledgement is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER article_upload_executor_end_no_delete BEFORE DELETE ON article_upload_executor_ends
BEGIN SELECT RAISE(ABORT,'Executor end acknowledgement is immutable'); END;
--> statement-breakpoint
-- Never permit a second root, cross-scope child, changed Word/account, or child without an end receipt.
CREATE TRIGGER article_upload_child_lineage BEFORE INSERT ON article_upload_attempts
WHEN NEW.previous_attempt_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM article_upload_attempts p JOIN article_upload_executor_ends e ON e.attempt_id=p.id
 WHERE p.id=NEW.previous_attempt_id AND p.owner=NEW.owner AND p.article_id=NEW.article_id AND p.platform=NEW.platform
 AND p.target_account=NEW.target_account AND p.word_sha256=NEW.word_sha256 AND p.word_size=NEW.word_size
 AND p.attempt_version+1=NEW.attempt_version AND p.consumed_at IS NOT NULL
 AND NEW.authorization_kind='owner_confirmed_reimport' AND NEW.authorization_key IS NOT NULL
 AND NEW.reimport_authorization IS NOT NULL AND NEW.consume_token_sha256 IS NOT NULL AND NEW.confirmation_message_id IS NOT NULL
 AND e.owner=p.owner AND e.article_id=p.article_id AND e.platform=p.platform
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=p.owner AND newer.article_id=p.article_id AND newer.platform=p.platform AND newer.attempt_version>p.attempt_version)
)
BEGIN SELECT RAISE(ABORT,'Upload child lineage is invalid'); END;
--> statement-breakpoint
CREATE TRIGGER article_upload_identity_immutable BEFORE UPDATE ON article_upload_attempts
WHEN NEW.id IS NOT OLD.id OR NEW.owner IS NOT OLD.owner OR NEW.article_id IS NOT OLD.article_id
 OR NEW.platform IS NOT OLD.platform OR NEW.target_account IS NOT OLD.target_account
 OR NEW.word_sha256 IS NOT OLD.word_sha256 OR NEW.word_size IS NOT OLD.word_size
 OR NEW.authorization_kind IS NOT OLD.authorization_kind OR NEW.claim_hash IS NOT OLD.claim_hash
 OR NEW.preflight IS NOT OLD.preflight OR NEW.baseline IS NOT OLD.baseline OR NEW.created IS NOT OLD.created
 OR NEW.attempt_version IS NOT OLD.attempt_version OR NEW.previous_attempt_id IS NOT OLD.previous_attempt_id
 OR NEW.authorization_key IS NOT OLD.authorization_key OR NEW.reimport_authorization IS NOT OLD.reimport_authorization
 OR NEW.consume_token_sha256 IS NOT OLD.consume_token_sha256 OR NEW.confirmation_message_id IS NOT OLD.confirmation_message_id
BEGIN SELECT RAISE(ABORT,'Upload attempt identity is immutable'); END;
