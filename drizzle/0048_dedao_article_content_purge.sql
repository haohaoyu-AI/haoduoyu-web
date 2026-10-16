-- A permanent pair identity outlives the downloaded item. Only an explicitly
-- confirmed article/Dedao scope with the exact frozen pair and live owner locks
-- may create it. The shared batch and its other ordinals are never fenced.
CREATE TRIGGER dedao_article_purge_pair_fence_insert BEFORE INSERT ON article_content_fences
WHEN NEW.entity_kind='dedao_items.batch_ordinal' AND NOT EXISTS(
 SELECT 1 FROM dedao_batches b JOIN article_deletions x ON x.owner=b.owner
 JOIN article_list_deletions o ON o.id=x.operation_id AND o.owner=x.owner
 WHERE b.owner=NEW.owner AND b.id=json_extract(CASE WHEN json_valid(NEW.entity_key) THEN NEW.entity_key ELSE '[null,null]' END,'$[0]') AND NEW.operation_id=o.id
 AND typeof(json_extract(CASE WHEN json_valid(NEW.entity_key) THEN NEW.entity_key ELSE '[null,null]' END,'$[1]'))='integer' AND json_extract(CASE WHEN json_valid(NEW.entity_key) THEN NEW.entity_key ELSE '[null,null]' END,'$[1]')>0 AND json_array(json_extract(CASE WHEN json_valid(NEW.entity_key) THEN NEW.entity_key ELSE '[null,null]' END,'$[0]'),json_extract(CASE WHEN json_valid(NEW.entity_key) THEN NEW.entity_key ELSE '[null,null]' END,'$[1]'))=NEW.entity_key
 AND x.owner=b.owner AND x.id=NEW.article_id AND x.state='deleting' AND o.scope='all_articles' AND o.state='deleting'
 AND o.confirmed_at IS NOT NULL AND o.lock_token IS NOT NULL AND x.lock_token=o.lock_token
 AND x.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND o.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND json_extract(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].include_dedao_articles')=1
 AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END) t, json_each(t.value,'$.dedao_pairs') p WHERE json_extract(t.value,'$.id')=NEW.article_id AND json_extract(p.value,'$.batch_id')=json_extract(CASE WHEN json_valid(NEW.entity_key) THEN NEW.entity_key ELSE '[null,null]' END,'$[0]') AND json_extract(p.value,'$.ordinal')=json_extract(CASE WHEN json_valid(NEW.entity_key) THEN NEW.entity_key ELSE '[null,null]' END,'$[1]') AND json_extract(p.value,'$.article_id')=NEW.article_id)
 AND (EXISTS(SELECT 1 FROM dedao_items i WHERE i.batch_id=b.id AND i.ordinal=json_extract(CASE WHEN json_valid(NEW.entity_key) THEN NEW.entity_key ELSE '[null,null]' END,'$[1]') AND i.owner=b.owner AND i.article_id=NEW.article_id)
 OR EXISTS(SELECT 1 FROM article_content_fences prior WHERE prior.owner=b.owner AND prior.entity_kind=NEW.entity_kind AND prior.entity_key=NEW.entity_key AND prior.article_id=NEW.article_id)))
BEGIN SELECT RAISE(ABORT,'dedao_article_purge_pair_confirmation_required'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_batch_identity_update BEFORE UPDATE ON dedao_batches WHEN (NEW.id IS NOT OLD.id OR NEW.owner IS NOT OLD.owner) AND EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=OLD.owner AND f.entity_kind='dedao_items.batch_ordinal' AND json_extract(CASE WHEN json_valid(f.entity_key) THEN f.entity_key ELSE '[]' END,'$[0]')=OLD.id) BEGIN SELECT RAISE(ABORT,'immutable_dedao_article_purge_owner_mapping'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_batch_identity_delete BEFORE DELETE ON dedao_batches WHEN EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=OLD.owner AND f.entity_kind='dedao_items.batch_ordinal' AND json_extract(CASE WHEN json_valid(f.entity_key) THEN f.entity_key ELSE '[]' END,'$[0]')=OLD.id) BEGIN SELECT RAISE(ABORT,'immutable_dedao_article_purge_owner_mapping'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_batch_regrant_update BEFORE UPDATE ON dedao_batches
WHEN (EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=OLD.owner AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(OLD.id,OLD.current_ordinal)) OR EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=NEW.owner AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(NEW.id,NEW.current_ordinal))) AND (
 NEW.queue_revision IS NOT OLD.queue_revision
 OR (OLD.executor_ended=1 AND NEW.executor_ended<>1)
 OR (NEW.state IN ('queued','launching','running') AND (NEW.state IS NOT OLD.state OR NEW.current_ordinal IS NOT OLD.current_ordinal OR NEW.claim_hash IS NOT OLD.claim_hash OR NEW.execution_id IS NOT OLD.execution_id OR NEW.executor_id IS NOT OLD.executor_id))
 OR (((NEW.claim_hash IS NOT NULL AND NEW.claim_hash IS NOT OLD.claim_hash) OR (NEW.execution_id IS NOT NULL AND NEW.execution_id IS NOT OLD.execution_id) OR (NEW.executor_id IS NOT NULL AND NEW.executor_id IS NOT OLD.executor_id)) AND NOT (OLD.state='queued' AND OLD.claim_hash IS NULL AND OLD.execution_id IS NULL AND OLD.executor_id IS NULL AND NEW.state='paused' AND NEW.executor_ended=1 AND NEW.claim_hash IS NULL)))
BEGIN SELECT RAISE(ABORT,'dedao_article_purge_regrant_forbidden'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_items_insert BEFORE INSERT ON dedao_items
WHEN (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=NEW.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(NEW.batch_id,NEW.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=NEW.batch_id AND i.ordinal=NEW.ordinal)) OR NOT EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=NEW.batch_id AND b.owner=NEW.owner) OR EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner WHERE b.id=NEW.batch_id AND f.entity_kind='dedao_items' AND f.entity_key=NEW.id) OR EXISTS(SELECT 1 FROM dedao_batches b JOIN article_deletions x ON x.owner=b.owner WHERE b.id=NEW.batch_id AND x.id=NEW.article_id)
BEGIN SELECT RAISE(ABORT,'ARTICLE_CONTENT_PERMANENTLY_DELETED'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_items_update BEFORE UPDATE ON dedao_items
WHEN (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=OLD.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(OLD.batch_id,OLD.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=OLD.batch_id AND i.ordinal=OLD.ordinal)) OR (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=NEW.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(NEW.batch_id,NEW.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=NEW.batch_id AND i.ordinal=NEW.ordinal)) OR NOT EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=NEW.batch_id AND b.owner=NEW.owner) OR EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner WHERE b.id=OLD.batch_id AND f.entity_kind='dedao_items' AND f.entity_key=OLD.id) OR EXISTS(SELECT 1 FROM dedao_batches b JOIN article_deletions x ON x.owner=b.owner WHERE b.id=OLD.batch_id AND x.id=OLD.article_id) OR EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner WHERE b.id=NEW.batch_id AND f.entity_kind='dedao_items' AND f.entity_key=NEW.id) OR EXISTS(SELECT 1 FROM dedao_batches b JOIN article_deletions x ON x.owner=b.owner WHERE b.id=NEW.batch_id AND x.id=NEW.article_id)
BEGIN SELECT RAISE(ABORT,'ARTICLE_CONTENT_PERMANENTLY_DELETED'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_items_delete BEFORE DELETE ON dedao_items
WHEN NOT EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=f.article_id
 JOIN article_list_deletions o ON o.id=x.operation_id AND o.owner=x.owner
 WHERE b.id=OLD.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(OLD.batch_id,OLD.ordinal) AND OLD.owner=b.owner AND OLD.article_id=f.article_id
 AND x.owner=b.owner AND x.id=f.article_id AND x.state='deleting' AND o.scope='all_articles' AND o.state='deleting'
 AND o.confirmed_at IS NOT NULL AND o.lock_token IS NOT NULL AND x.lock_token=o.lock_token
 AND x.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND o.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND json_extract(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].include_dedao_articles')=1
 AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END) t, json_each(t.value,'$.dedao_pairs') p WHERE json_extract(t.value,'$.id')=f.article_id AND json_extract(p.value,'$.batch_id')=OLD.batch_id AND json_extract(p.value,'$.ordinal')=OLD.ordinal AND json_extract(p.value,'$.article_id')=f.article_id)
 AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].graph') g
 WHERE json_extract(g.value,'$.table')='dedao_items' AND json_extract(g.value,'$.article_id')=f.article_id
 AND json_extract(g.value,'$.values[0]')=OLD.batch_id AND json_extract(g.value,'$.values[1]')=OLD.ordinal))
BEGIN SELECT RAISE(ABORT,'dedao_article_purge_exact_confirmation_required'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_actions_insert BEFORE INSERT ON dedao_actions
WHEN (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=NEW.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(NEW.batch_id,NEW.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=NEW.batch_id AND i.ordinal=NEW.ordinal))
BEGIN SELECT RAISE(ABORT,'ARTICLE_CONTENT_PERMANENTLY_DELETED'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_actions_update BEFORE UPDATE ON dedao_actions
WHEN (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=OLD.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(OLD.batch_id,OLD.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=OLD.batch_id AND i.ordinal=OLD.ordinal)) OR (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=NEW.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(NEW.batch_id,NEW.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=NEW.batch_id AND i.ordinal=NEW.ordinal))
BEGIN SELECT RAISE(ABORT,'ARTICLE_CONTENT_PERMANENTLY_DELETED'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_actions_delete BEFORE DELETE ON dedao_actions
WHEN NOT EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=f.article_id
 JOIN article_list_deletions o ON o.id=x.operation_id AND o.owner=x.owner
 WHERE b.id=OLD.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(OLD.batch_id,OLD.ordinal)
 AND x.owner=b.owner AND x.id=f.article_id AND x.state='deleting' AND o.scope='all_articles' AND o.state='deleting'
 AND o.confirmed_at IS NOT NULL AND o.lock_token IS NOT NULL AND x.lock_token=o.lock_token
 AND x.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND o.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND json_extract(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].include_dedao_articles')=1
 AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END) t, json_each(t.value,'$.dedao_pairs') p WHERE json_extract(t.value,'$.id')=f.article_id AND json_extract(p.value,'$.batch_id')=OLD.batch_id AND json_extract(p.value,'$.ordinal')=OLD.ordinal AND json_extract(p.value,'$.article_id')=f.article_id)
 AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].graph') g
 WHERE json_extract(g.value,'$.table')='dedao_actions' AND json_extract(g.value,'$.article_id')=f.article_id
 AND json_extract(g.value,'$.values[0]')=OLD.batch_id AND json_extract(g.value,'$.values[1]')=OLD.ordinal AND json_extract(g.value,'$.values[2]') IS OLD.action))
BEGIN SELECT RAISE(ABORT,'dedao_article_purge_exact_confirmation_required'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_chunks_insert BEFORE INSERT ON dedao_chunks
WHEN (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=NEW.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(NEW.batch_id,NEW.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=NEW.batch_id AND i.ordinal=NEW.ordinal))
BEGIN SELECT RAISE(ABORT,'ARTICLE_CONTENT_PERMANENTLY_DELETED'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_chunks_update BEFORE UPDATE ON dedao_chunks
WHEN (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=OLD.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(OLD.batch_id,OLD.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=OLD.batch_id AND i.ordinal=OLD.ordinal)) OR (EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 WHERE b.id=NEW.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(NEW.batch_id,NEW.ordinal))
 OR EXISTS(SELECT 1 FROM dedao_batches b JOIN dedao_items i ON i.batch_id=b.id AND i.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=i.article_id WHERE b.id=NEW.batch_id AND i.ordinal=NEW.ordinal))
BEGIN SELECT RAISE(ABORT,'ARTICLE_CONTENT_PERMANENTLY_DELETED'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_article_purge_dedao_chunks_delete BEFORE DELETE ON dedao_chunks
WHEN NOT EXISTS(SELECT 1 FROM dedao_batches b JOIN article_content_fences f ON f.owner=b.owner
 JOIN article_deletions x ON x.owner=b.owner AND x.id=f.article_id
 JOIN article_list_deletions o ON o.id=x.operation_id AND o.owner=x.owner
 WHERE b.id=OLD.batch_id AND f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(OLD.batch_id,OLD.ordinal)
 AND x.owner=b.owner AND x.id=f.article_id AND x.state='deleting' AND o.scope='all_articles' AND o.state='deleting'
 AND o.confirmed_at IS NOT NULL AND o.lock_token IS NOT NULL AND x.lock_token=o.lock_token
 AND x.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND o.lock_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND json_extract(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].include_dedao_articles')=1
 AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END) t, json_each(t.value,'$.dedao_pairs') p WHERE json_extract(t.value,'$.id')=f.article_id AND json_extract(p.value,'$.batch_id')=OLD.batch_id AND json_extract(p.value,'$.ordinal')=OLD.ordinal AND json_extract(p.value,'$.article_id')=f.article_id)
 AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.snapshot_json) THEN o.snapshot_json ELSE '[]' END,'$[0].graph') g
 WHERE json_extract(g.value,'$.table')='dedao_chunks' AND json_extract(g.value,'$.article_id')=f.article_id
 AND json_extract(g.value,'$.values[0]')=OLD.batch_id AND json_extract(g.value,'$.values[1]')=OLD.ordinal AND json_extract(g.value,'$.values[2]') IS OLD.offset))
BEGIN SELECT RAISE(ABORT,'dedao_article_purge_exact_confirmation_required'); END;
