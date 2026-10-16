-- Keep exact one-off owner approvals unique. Standing duplicate-tolerant manual-task
-- approvals may cover linked attempts; immutable source-once and version fences remain.
-- No historical row, receipt, URL, claim or delivery is rewritten.
DROP INDEX article_upload_scope_confirmation;
--> statement-breakpoint
CREATE UNIQUE INDEX article_upload_scope_confirmation ON article_upload_attempts(owner,article_id,platform,confirmation_message_id) WHERE confirmation_message_id IS NOT NULL AND COALESCE(json_extract(reimport_authorization,'$.request.authorization_scope'),'exact_reimport') != 'duplicate_tolerant_task';
