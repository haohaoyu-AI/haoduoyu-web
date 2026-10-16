CREATE TABLE `word_progress_events` (
	`owner` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`version` integer NOT NULL,
	`event_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `target_kind`, `target_id`, `version`),
	CONSTRAINT "word_progress_target" CHECK("word_progress_events"."target_kind" IN ('article','local_word')),
	CONSTRAINT "word_progress_version" CHECK(typeof("word_progress_events"."version")='integer' AND "word_progress_events"."version">0),
	CONSTRAINT "word_progress_hashes" CHECK(length("word_progress_events"."input_sha256")=64 AND length("word_progress_events"."payload_sha256")=64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_progress_event_identity` ON `word_progress_events` (`owner`,`target_kind`,`target_id`,`event_id`);
--> statement-breakpoint
CREATE TRIGGER word_progress_no_update BEFORE UPDATE ON word_progress_events BEGIN SELECT RAISE(ABORT, 'word_progress_append_only'); END;
--> statement-breakpoint
CREATE TRIGGER word_progress_no_delete BEFORE DELETE ON word_progress_events
WHEN NOT (
 OLD.target_kind='article'
 AND NOT EXISTS(SELECT 1 FROM articles a WHERE a.id=OLD.target_id AND a.owner=OLD.owner)
 AND EXISTS(
  SELECT 1 FROM article_deletions x
  WHERE x.id=OLD.target_id AND x.owner=OLD.owner AND x.state='deleted' AND x.deleted_at IS NOT NULL
   AND (x.operation_id IS NULL OR EXISTS(
    SELECT 1 FROM article_list_deletions o
    WHERE o.id=x.operation_id AND o.owner=x.owner AND o.state='deleting'
     AND o.confirmed_at IS NOT NULL AND o.lock_token IS NOT NULL
     AND o.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')
     AND EXISTS(SELECT 1 FROM json_each(o.snapshot_json) j WHERE json_extract(j.value,'$.id')=x.id)
   ))
 )
)
BEGIN SELECT RAISE(ABORT, 'word_progress_append_only'); END;
--> statement-breakpoint
CREATE TRIGGER word_progress_delete_article_guard BEFORE DELETE ON articles
WHEN EXISTS(SELECT 1 FROM word_progress_events p WHERE p.owner=OLD.owner AND p.target_kind='article' AND p.target_id=OLD.id)
AND (OLD.state!='deleting' OR NOT EXISTS(
  SELECT 1 FROM article_deletions x
  WHERE x.id=OLD.id AND x.owner=OLD.owner AND x.state='deleted' AND x.deleted_at IS NOT NULL
   AND (x.operation_id IS NULL OR EXISTS(
    SELECT 1 FROM article_list_deletions o
    WHERE o.id=x.operation_id AND o.owner=x.owner AND o.state='deleting'
     AND o.confirmed_at IS NOT NULL AND o.lock_token IS NOT NULL
     AND o.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')
     AND EXISTS(SELECT 1 FROM json_each(o.snapshot_json) j WHERE json_extract(j.value,'$.id')=x.id)
   ))
 ))
BEGIN SELECT RAISE(ABORT, 'word_progress_delete_requires_confirmed_article'); END;
--> statement-breakpoint
CREATE TRIGGER word_progress_purge_deleted_article AFTER DELETE ON articles
WHEN EXISTS(SELECT 1 FROM word_progress_events p WHERE p.owner=OLD.owner AND p.target_kind='article' AND p.target_id=OLD.id)
BEGIN DELETE FROM word_progress_events WHERE owner=OLD.owner AND target_kind='article' AND target_id=OLD.id; END;
