CREATE TABLE `article_list_deletions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`scope` text NOT NULL,
	`request_key` text NOT NULL,
	`state` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`confirmed_at` text,
	`deleted_at` text,
	`lock_token` text,
	`lock_expires` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_list_deletions_owner_request` ON `article_list_deletions` (`owner`,`request_key`);--> statement-breakpoint
ALTER TABLE `article_deletions` ADD `operation_id` text;
--> statement-breakpoint
CREATE TRIGGER article_deleted_insert_fence BEFORE INSERT ON articles
WHEN EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=NEW.id AND x.owner=NEW.owner)
BEGIN
  SELECT RAISE(ABORT, 'ARTICLE_PERMANENTLY_DELETED');
END;
--> statement-breakpoint
CREATE TRIGGER article_deleting_content_fence BEFORE UPDATE ON articles
WHEN OLD.state='deleting' AND (NEW.state<>'deleting' OR NEW.paragraphs IS NOT OLD.paragraphs
  OR NEW.source_key IS NOT OLD.source_key OR NEW.result_key IS NOT OLD.result_key
  OR NEW.result_meta IS NOT OLD.result_meta OR NEW.artifact_manifest IS NOT OLD.artifact_manifest)
BEGIN
  SELECT RAISE(ABORT, 'ARTICLE_DELETION_IN_PROGRESS');
END;
