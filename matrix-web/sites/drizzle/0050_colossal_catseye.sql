CREATE TABLE `article_history` (
	`owner` text NOT NULL,
	`history_key` text NOT NULL,
	`article_id` text,
	`record_json` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`completed_at` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `history_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_history_evidence` ON `article_history` (`owner`,`evidence_sha256`,`history_key`);--> statement-breakpoint
CREATE TABLE `article_metrics_observations` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`history_key` text NOT NULL,
	`platform` text NOT NULL,
	`published_at` text,
	`observed_at` text NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`),
	CONSTRAINT "article_metrics_platform" CHECK("article_metrics_observations"."platform" IN ('toutiao','zhihu'))
);
--> statement-breakpoint
CREATE TABLE `article_workspace_archives` (
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`archived_at` text NOT NULL,
	`request_key` text NOT NULL,
	PRIMARY KEY(`owner`, `article_id`)
);
--> statement-breakpoint
CREATE TABLE `article_workspace_requests` (
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`payload` text NOT NULL,
	`result` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`owner`, `request_key`)
);

--> statement-breakpoint
CREATE TRIGGER article_history_no_update BEFORE UPDATE ON article_history BEGIN SELECT RAISE(ABORT,'immutable_article_history'); END;
--> statement-breakpoint
CREATE TRIGGER article_history_no_delete BEFORE DELETE ON article_history BEGIN SELECT RAISE(ABORT,'immutable_article_history'); END;
--> statement-breakpoint
CREATE TRIGGER article_metrics_no_update BEFORE UPDATE ON article_metrics_observations BEGIN SELECT RAISE(ABORT,'immutable_article_metrics'); END;
--> statement-breakpoint
CREATE TRIGGER article_metrics_no_delete BEFORE DELETE ON article_metrics_observations BEGIN SELECT RAISE(ABORT,'immutable_article_metrics'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_receipt_no_update BEFORE UPDATE ON article_workspace_requests BEGIN SELECT RAISE(ABORT,'immutable_workspace_receipt'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_receipt_no_delete BEFORE DELETE ON article_workspace_requests BEGIN SELECT RAISE(ABORT,'immutable_workspace_receipt'); END;

--> statement-breakpoint
CREATE TABLE `dedao_cloud_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`state` text NOT NULL,
	`conversation_url` text NOT NULL,
	`article_id` text,
	`execution_id` text,
	`claim_hash` text,
	`claim_expires` text,
	`dispatch_state` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`end_reference` text,
	CONSTRAINT "dedao_cloud_state" CHECK("dedao_cloud_requests"."state" IN ('queued','writing','processing','completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_cloud_owner_request` ON `dedao_cloud_requests` (`owner`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_cloud_one_active` ON `dedao_cloud_requests` (`owner`) WHERE "dedao_cloud_requests"."state"<>'completed';
--> statement-breakpoint
CREATE TABLE `dedao_cloud_actions` (
	`owner` text NOT NULL,
	`task_id` text NOT NULL,
	`action` text NOT NULL,
	`action_id` text NOT NULL,
	`state` text NOT NULL,
	`message` text,
	`observation_json` text,
	`created` text NOT NULL,
	`confirmed_at` text,
	PRIMARY KEY(`owner`, `task_id`, `action`),
	CONSTRAINT "dedao_cloud_action_kind" CHECK("dedao_cloud_actions"."action" IN ('recommend','adopt','framework','finalize','download')),
	CONSTRAINT "dedao_cloud_action_state" CHECK("dedao_cloud_actions"."state" IN ('reserved','confirmed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dedao_cloud_action_identity` ON `dedao_cloud_actions` (`action_id`);
--> statement-breakpoint
CREATE TRIGGER dedao_cloud_confirmed_action_no_update BEFORE UPDATE ON dedao_cloud_actions WHEN OLD.state='confirmed' BEGIN SELECT RAISE(ABORT,'immutable_dedao_cloud_action'); END;
--> statement-breakpoint
CREATE TRIGGER dedao_cloud_action_no_delete BEFORE DELETE ON dedao_cloud_actions BEGIN SELECT RAISE(ABORT,'immutable_dedao_cloud_action'); END;

--> statement-breakpoint
-- Copy verified metadata only. No source body, credential, grant or platform action.
CREATE VIEW article_history_backfill_candidates(owner,history_key,article_id,record_json,evidence_sha256,completed_at,created) AS SELECT a.owner,'website:'||a.id,a.id,json_object('history_key','website:'||a.id,'website_article_id',a.id,
 'mode',CASE WHEN EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id) OR EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=a.owner AND i.article_id=a.id) THEN 'website_full_auto' ELSE 'website_semi_auto' END,
 'title',CASE WHEN json_valid(a.paragraphs) THEN (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) ELSE a.title END,'topic_label',a.title,'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),'completed_at_precision','second','status','private_drafts_verified',
 'word',json_object('sha256',json_extract(a.result_meta,'$.sha256'),'size_bytes',json_extract(a.result_meta,'$.size'),'image_count',CASE WHEN json_valid(a.artifact_manifest) THEN json_array_length(a.artifact_manifest,'$.layout.images') ELSE NULL END),
 'platforms',json_object('toutiao',json_object('account_id','61556093362','draft_id',substr(a.draft_url,instr(a.draft_url,'pgc_id=')+7),'draft_url',a.draft_url,'status','verified_private_draft','last_verified_at',json_extract(a.draft_readback,'$.read_at'),'current_existence_rechecked',json('false')),
 'zhihu',json_object('account_id','ren-zhe-ai-chi-yu-52','draft_id',substr(d.draft_url,30,length(d.draft_url)-34),'draft_url',d.draft_url,'status','verified_private_draft','last_verified_at',json_extract(d.readback,'$.read_at'),'current_existence_rechecked',json('false'))),
 'timing',json_object('elapsed_seconds',CAST(ROUND((julianday(strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))))-julianday(a.created))*86400) AS INTEGER),'basis','source_upload_to_verified_drafts'),
 'evidence',json_object('level','site_receipt'),
 'public_publication',json_object('status','not_observed','published_at',NULL,'published_url',NULL,'metrics_24h',NULL)),json_extract(a.result_meta,'$.sha256'),strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM articles a JOIN article_deliveries d ON a.owner=d.owner AND a.id=d.article_id AND d.platform='zhihu' AND a.state='completed' AND d.state='saved'
 AND strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at'))))>='2026-10-11T16:00:00.000Z' AND a.result_key IS NOT NULL
 AND json_valid(a.result_meta) AND json_type(a.result_meta,'$.sha256')='text' AND length(json_extract(a.result_meta,'$.sha256'))=64 AND json_extract(a.result_meta,'$.sha256') NOT GLOB '*[^a-f0-9]*'
 AND json_valid(a.draft_readback) AND json_valid(d.readback)
 AND json_extract(a.draft_readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256') AND json_extract(d.readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_valid(a.paragraphs) AND json_type(a.paragraphs)='array' AND (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) IS NOT NULL AND length(trim((SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)))>0
 AND json_extract(a.draft_readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_extract(d.readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)
 AND json_extract(a.draft_readback,'$.target_account')='61556093362' AND json_extract(d.readback,'$.target_account')='ren-zhe-ai-chi-yu-52'
 AND json_extract(a.draft_readback,'$.draft_url')=a.draft_url AND json_extract(d.readback,'$.draft_url')=d.draft_url
 AND json_extract(a.result_meta,'$.verification.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_type(a.result_meta,'$.size')='integer' AND json_extract(a.result_meta,'$.size')>0
 AND json_extract(a.draft_readback,'$.verification_method')='agent_readback' AND json_extract(d.readback,'$.verification_method')='agent_readback'
 AND json_extract(a.draft_readback,'$.independently_reopened')=1 AND json_extract(d.readback,'$.independently_reopened')=1
 AND json_extract(a.draft_readback,'$.saved_indicator_observed')=1 AND json_extract(d.readback,'$.saved_indicator_observed')=1
 AND json_extract(a.draft_readback,'$.images_loaded')=1 AND json_extract(d.readback,'$.images_loaded')=1
 AND julianday(json_extract(a.draft_readback,'$.saved_at'))<=julianday(json_extract(a.draft_readback,'$.reopened_at')) AND julianday(json_extract(a.draft_readback,'$.reopened_at'))<=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND julianday(json_extract(d.readback,'$.saved_at'))<=julianday(json_extract(d.readback,'$.reopened_at')) AND julianday(json_extract(d.readback,'$.reopened_at'))<=julianday(json_extract(d.readback,'$.read_at'))
 AND julianday(json_extract(a.draft_readback,'$.read_at'))>=julianday(a.created) AND julianday(json_extract(d.readback,'$.read_at'))>=julianday(a.created)
 AND julianday(json_extract(a.draft_readback,'$.read_at'))<=julianday('now')+1.0/1440 AND julianday(json_extract(d.readback,'$.read_at'))<=julianday('now')+1.0/1440
 AND length(substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1)) BETWEEN 1 AND 24 AND substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1) NOT GLOB '*[^0-9]*'
 AND length(substr(d.draft_url,30,length(d.draft_url)-34)) BETWEEN 1 AND 24 AND substr(d.draft_url,30,length(d.draft_url)-34) NOT GLOB '*[^0-9]*'
 AND NOT EXISTS(SELECT 1 FROM word_serial_slots ws WHERE ws.owner=a.owner AND ws.target_kind='article' AND ws.target_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM word_attempts wa WHERE wa.owner=a.owner AND wa.target_kind='article' AND wa.target_id=a.id AND wa.state IN ('running','stop_requested','waiting_safe_stop'))
 AND NOT EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id AND (c.state<>'completed' OR c.end_reference IS NULL OR length(trim(c.end_reference))=0 OR EXISTS(SELECT 1 FROM dedao_cloud_actions ca WHERE ca.owner=c.owner AND ca.task_id=c.id AND ca.state<>'confirmed')))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='toutiao' AND u.state='verified' AND u.target_account='61556093362' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=a.draft_readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='zhihu' AND u.state='verified' AND u.target_account='ren-zhe-ai-chi-yu-52' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=d.readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(d.readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND julianday(json_extract(a.draft_readback,'$.read_at')) IS NOT NULL AND julianday(json_extract(d.readback,'$.read_at')) IS NOT NULL
 AND a.draft_url GLOB 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=[0-9]*'
 AND d.draft_url GLOB 'https://zhuanlan.zhihu.com/p/[0-9]*/edit';
--> statement-breakpoint
CREATE TRIGGER article_history_capture_main AFTER UPDATE OF state,draft_readback ON articles WHEN NEW.state='completed' BEGIN INSERT OR IGNORE INTO article_history(owner,history_key,article_id,record_json,evidence_sha256,completed_at,created) SELECT a.owner,'website:'||a.id,a.id,json_object('history_key','website:'||a.id,'website_article_id',a.id,
 'mode',CASE WHEN EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id) OR EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=a.owner AND i.article_id=a.id) THEN 'website_full_auto' ELSE 'website_semi_auto' END,
 'title',CASE WHEN json_valid(a.paragraphs) THEN (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) ELSE a.title END,'topic_label',a.title,'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),'completed_at_precision','second','status','private_drafts_verified',
 'word',json_object('sha256',json_extract(a.result_meta,'$.sha256'),'size_bytes',json_extract(a.result_meta,'$.size'),'image_count',CASE WHEN json_valid(a.artifact_manifest) THEN json_array_length(a.artifact_manifest,'$.layout.images') ELSE NULL END),
 'platforms',json_object('toutiao',json_object('account_id','61556093362','draft_id',substr(a.draft_url,instr(a.draft_url,'pgc_id=')+7),'draft_url',a.draft_url,'status','verified_private_draft','last_verified_at',json_extract(a.draft_readback,'$.read_at'),'current_existence_rechecked',json('false')),
 'zhihu',json_object('account_id','ren-zhe-ai-chi-yu-52','draft_id',substr(d.draft_url,30,length(d.draft_url)-34),'draft_url',d.draft_url,'status','verified_private_draft','last_verified_at',json_extract(d.readback,'$.read_at'),'current_existence_rechecked',json('false'))),
 'timing',json_object('elapsed_seconds',CAST(ROUND((julianday(strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))))-julianday(a.created))*86400) AS INTEGER),'basis','source_upload_to_verified_drafts'),
 'evidence',json_object('level','site_receipt'),
 'public_publication',json_object('status','not_observed','published_at',NULL,'published_url',NULL,'metrics_24h',NULL)),json_extract(a.result_meta,'$.sha256'),strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM articles a JOIN article_deliveries d ON a.owner=d.owner AND a.id=d.article_id AND d.platform='zhihu' AND a.state='completed' AND d.state='saved'
 AND strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at'))))>='2026-10-11T16:00:00.000Z' AND a.result_key IS NOT NULL
 AND json_valid(a.result_meta) AND json_type(a.result_meta,'$.sha256')='text' AND length(json_extract(a.result_meta,'$.sha256'))=64 AND json_extract(a.result_meta,'$.sha256') NOT GLOB '*[^a-f0-9]*'
 AND json_valid(a.draft_readback) AND json_valid(d.readback)
 AND json_extract(a.draft_readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256') AND json_extract(d.readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_valid(a.paragraphs) AND json_type(a.paragraphs)='array' AND (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) IS NOT NULL AND length(trim((SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)))>0
 AND json_extract(a.draft_readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_extract(d.readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)
 AND json_extract(a.draft_readback,'$.target_account')='61556093362' AND json_extract(d.readback,'$.target_account')='ren-zhe-ai-chi-yu-52'
 AND json_extract(a.draft_readback,'$.draft_url')=a.draft_url AND json_extract(d.readback,'$.draft_url')=d.draft_url
 AND json_extract(a.result_meta,'$.verification.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_type(a.result_meta,'$.size')='integer' AND json_extract(a.result_meta,'$.size')>0
 AND json_extract(a.draft_readback,'$.verification_method')='agent_readback' AND json_extract(d.readback,'$.verification_method')='agent_readback'
 AND json_extract(a.draft_readback,'$.independently_reopened')=1 AND json_extract(d.readback,'$.independently_reopened')=1
 AND json_extract(a.draft_readback,'$.saved_indicator_observed')=1 AND json_extract(d.readback,'$.saved_indicator_observed')=1
 AND json_extract(a.draft_readback,'$.images_loaded')=1 AND json_extract(d.readback,'$.images_loaded')=1
 AND julianday(json_extract(a.draft_readback,'$.saved_at'))<=julianday(json_extract(a.draft_readback,'$.reopened_at')) AND julianday(json_extract(a.draft_readback,'$.reopened_at'))<=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND julianday(json_extract(d.readback,'$.saved_at'))<=julianday(json_extract(d.readback,'$.reopened_at')) AND julianday(json_extract(d.readback,'$.reopened_at'))<=julianday(json_extract(d.readback,'$.read_at'))
 AND julianday(json_extract(a.draft_readback,'$.read_at'))>=julianday(a.created) AND julianday(json_extract(d.readback,'$.read_at'))>=julianday(a.created)
 AND julianday(json_extract(a.draft_readback,'$.read_at'))<=julianday('now')+1.0/1440 AND julianday(json_extract(d.readback,'$.read_at'))<=julianday('now')+1.0/1440
 AND length(substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1)) BETWEEN 1 AND 24 AND substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1) NOT GLOB '*[^0-9]*'
 AND length(substr(d.draft_url,30,length(d.draft_url)-34)) BETWEEN 1 AND 24 AND substr(d.draft_url,30,length(d.draft_url)-34) NOT GLOB '*[^0-9]*'
 AND NOT EXISTS(SELECT 1 FROM word_serial_slots ws WHERE ws.owner=a.owner AND ws.target_kind='article' AND ws.target_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM word_attempts wa WHERE wa.owner=a.owner AND wa.target_kind='article' AND wa.target_id=a.id AND wa.state IN ('running','stop_requested','waiting_safe_stop'))
 AND NOT EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id AND (c.state<>'completed' OR c.end_reference IS NULL OR length(trim(c.end_reference))=0 OR EXISTS(SELECT 1 FROM dedao_cloud_actions ca WHERE ca.owner=c.owner AND ca.task_id=c.id AND ca.state<>'confirmed')))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='toutiao' AND u.state='verified' AND u.target_account='61556093362' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=a.draft_readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='zhihu' AND u.state='verified' AND u.target_account='ren-zhe-ai-chi-yu-52' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=d.readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(d.readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND julianday(json_extract(a.draft_readback,'$.read_at')) IS NOT NULL AND julianday(json_extract(d.readback,'$.read_at')) IS NOT NULL
 AND a.draft_url GLOB 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=[0-9]*'
 AND d.draft_url GLOB 'https://zhuanlan.zhihu.com/p/[0-9]*/edit' WHERE a.id=NEW.id AND a.owner=NEW.owner; END;
--> statement-breakpoint
CREATE TRIGGER article_history_capture_delivery AFTER UPDATE OF state,readback ON article_deliveries WHEN NEW.platform='zhihu' AND NEW.state='saved' BEGIN INSERT OR IGNORE INTO article_history(owner,history_key,article_id,record_json,evidence_sha256,completed_at,created) SELECT a.owner,'website:'||a.id,a.id,json_object('history_key','website:'||a.id,'website_article_id',a.id,
 'mode',CASE WHEN EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id) OR EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=a.owner AND i.article_id=a.id) THEN 'website_full_auto' ELSE 'website_semi_auto' END,
 'title',CASE WHEN json_valid(a.paragraphs) THEN (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) ELSE a.title END,'topic_label',a.title,'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),'completed_at_precision','second','status','private_drafts_verified',
 'word',json_object('sha256',json_extract(a.result_meta,'$.sha256'),'size_bytes',json_extract(a.result_meta,'$.size'),'image_count',CASE WHEN json_valid(a.artifact_manifest) THEN json_array_length(a.artifact_manifest,'$.layout.images') ELSE NULL END),
 'platforms',json_object('toutiao',json_object('account_id','61556093362','draft_id',substr(a.draft_url,instr(a.draft_url,'pgc_id=')+7),'draft_url',a.draft_url,'status','verified_private_draft','last_verified_at',json_extract(a.draft_readback,'$.read_at'),'current_existence_rechecked',json('false')),
 'zhihu',json_object('account_id','ren-zhe-ai-chi-yu-52','draft_id',substr(d.draft_url,30,length(d.draft_url)-34),'draft_url',d.draft_url,'status','verified_private_draft','last_verified_at',json_extract(d.readback,'$.read_at'),'current_existence_rechecked',json('false'))),
 'timing',json_object('elapsed_seconds',CAST(ROUND((julianday(strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))))-julianday(a.created))*86400) AS INTEGER),'basis','source_upload_to_verified_drafts'),
 'evidence',json_object('level','site_receipt'),
 'public_publication',json_object('status','not_observed','published_at',NULL,'published_url',NULL,'metrics_24h',NULL)),json_extract(a.result_meta,'$.sha256'),strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM articles a JOIN article_deliveries d ON a.owner=d.owner AND a.id=d.article_id AND d.platform='zhihu' AND a.state='completed' AND d.state='saved'
 AND strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at'))))>='2026-10-11T16:00:00.000Z' AND a.result_key IS NOT NULL
 AND json_valid(a.result_meta) AND json_type(a.result_meta,'$.sha256')='text' AND length(json_extract(a.result_meta,'$.sha256'))=64 AND json_extract(a.result_meta,'$.sha256') NOT GLOB '*[^a-f0-9]*'
 AND json_valid(a.draft_readback) AND json_valid(d.readback)
 AND json_extract(a.draft_readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256') AND json_extract(d.readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_valid(a.paragraphs) AND json_type(a.paragraphs)='array' AND (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) IS NOT NULL AND length(trim((SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)))>0
 AND json_extract(a.draft_readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_extract(d.readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)
 AND json_extract(a.draft_readback,'$.target_account')='61556093362' AND json_extract(d.readback,'$.target_account')='ren-zhe-ai-chi-yu-52'
 AND json_extract(a.draft_readback,'$.draft_url')=a.draft_url AND json_extract(d.readback,'$.draft_url')=d.draft_url
 AND json_extract(a.result_meta,'$.verification.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_type(a.result_meta,'$.size')='integer' AND json_extract(a.result_meta,'$.size')>0
 AND json_extract(a.draft_readback,'$.verification_method')='agent_readback' AND json_extract(d.readback,'$.verification_method')='agent_readback'
 AND json_extract(a.draft_readback,'$.independently_reopened')=1 AND json_extract(d.readback,'$.independently_reopened')=1
 AND json_extract(a.draft_readback,'$.saved_indicator_observed')=1 AND json_extract(d.readback,'$.saved_indicator_observed')=1
 AND json_extract(a.draft_readback,'$.images_loaded')=1 AND json_extract(d.readback,'$.images_loaded')=1
 AND julianday(json_extract(a.draft_readback,'$.saved_at'))<=julianday(json_extract(a.draft_readback,'$.reopened_at')) AND julianday(json_extract(a.draft_readback,'$.reopened_at'))<=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND julianday(json_extract(d.readback,'$.saved_at'))<=julianday(json_extract(d.readback,'$.reopened_at')) AND julianday(json_extract(d.readback,'$.reopened_at'))<=julianday(json_extract(d.readback,'$.read_at'))
 AND julianday(json_extract(a.draft_readback,'$.read_at'))>=julianday(a.created) AND julianday(json_extract(d.readback,'$.read_at'))>=julianday(a.created)
 AND julianday(json_extract(a.draft_readback,'$.read_at'))<=julianday('now')+1.0/1440 AND julianday(json_extract(d.readback,'$.read_at'))<=julianday('now')+1.0/1440
 AND length(substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1)) BETWEEN 1 AND 24 AND substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1) NOT GLOB '*[^0-9]*'
 AND length(substr(d.draft_url,30,length(d.draft_url)-34)) BETWEEN 1 AND 24 AND substr(d.draft_url,30,length(d.draft_url)-34) NOT GLOB '*[^0-9]*'
 AND NOT EXISTS(SELECT 1 FROM word_serial_slots ws WHERE ws.owner=a.owner AND ws.target_kind='article' AND ws.target_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM word_attempts wa WHERE wa.owner=a.owner AND wa.target_kind='article' AND wa.target_id=a.id AND wa.state IN ('running','stop_requested','waiting_safe_stop'))
 AND NOT EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id AND (c.state<>'completed' OR c.end_reference IS NULL OR length(trim(c.end_reference))=0 OR EXISTS(SELECT 1 FROM dedao_cloud_actions ca WHERE ca.owner=c.owner AND ca.task_id=c.id AND ca.state<>'confirmed')))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='toutiao' AND u.state='verified' AND u.target_account='61556093362' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=a.draft_readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='zhihu' AND u.state='verified' AND u.target_account='ren-zhe-ai-chi-yu-52' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=d.readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(d.readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND julianday(json_extract(a.draft_readback,'$.read_at')) IS NOT NULL AND julianday(json_extract(d.readback,'$.read_at')) IS NOT NULL
 AND a.draft_url GLOB 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=[0-9]*'
 AND d.draft_url GLOB 'https://zhuanlan.zhihu.com/p/[0-9]*/edit' WHERE a.id=NEW.article_id AND a.owner=NEW.owner; END;

--> statement-breakpoint
CREATE TRIGGER article_history_capture_upload_end AFTER INSERT ON article_upload_executor_ends BEGIN INSERT OR IGNORE INTO article_history(owner,history_key,article_id,record_json,evidence_sha256,completed_at,created) SELECT a.owner,'website:'||a.id,a.id,json_object('history_key','website:'||a.id,'website_article_id',a.id,
 'mode',CASE WHEN EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id) OR EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=a.owner AND i.article_id=a.id) THEN 'website_full_auto' ELSE 'website_semi_auto' END,
 'title',CASE WHEN json_valid(a.paragraphs) THEN (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) ELSE a.title END,'topic_label',a.title,'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),'completed_at_precision','second','status','private_drafts_verified',
 'word',json_object('sha256',json_extract(a.result_meta,'$.sha256'),'size_bytes',json_extract(a.result_meta,'$.size'),'image_count',CASE WHEN json_valid(a.artifact_manifest) THEN json_array_length(a.artifact_manifest,'$.layout.images') ELSE NULL END),
 'platforms',json_object('toutiao',json_object('account_id','61556093362','draft_id',substr(a.draft_url,instr(a.draft_url,'pgc_id=')+7),'draft_url',a.draft_url,'status','verified_private_draft','last_verified_at',json_extract(a.draft_readback,'$.read_at'),'current_existence_rechecked',json('false')),
 'zhihu',json_object('account_id','ren-zhe-ai-chi-yu-52','draft_id',substr(d.draft_url,30,length(d.draft_url)-34),'draft_url',d.draft_url,'status','verified_private_draft','last_verified_at',json_extract(d.readback,'$.read_at'),'current_existence_rechecked',json('false'))),
 'timing',json_object('elapsed_seconds',CAST(ROUND((julianday(strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))))-julianday(a.created))*86400) AS INTEGER),'basis','source_upload_to_verified_drafts'),
 'evidence',json_object('level','site_receipt'),
 'public_publication',json_object('status','not_observed','published_at',NULL,'published_url',NULL,'metrics_24h',NULL)),json_extract(a.result_meta,'$.sha256'),strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM articles a JOIN article_deliveries d ON a.owner=d.owner AND a.id=d.article_id AND d.platform='zhihu' AND a.state='completed' AND d.state='saved'
 AND strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at'))))>='2026-10-11T16:00:00.000Z' AND a.result_key IS NOT NULL
 AND json_valid(a.result_meta) AND json_type(a.result_meta,'$.sha256')='text' AND length(json_extract(a.result_meta,'$.sha256'))=64 AND json_extract(a.result_meta,'$.sha256') NOT GLOB '*[^a-f0-9]*'
 AND json_valid(a.draft_readback) AND json_valid(d.readback)
 AND json_extract(a.draft_readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256') AND json_extract(d.readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_valid(a.paragraphs) AND json_type(a.paragraphs)='array' AND (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) IS NOT NULL AND length(trim((SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)))>0
 AND json_extract(a.draft_readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_extract(d.readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)
 AND json_extract(a.draft_readback,'$.target_account')='61556093362' AND json_extract(d.readback,'$.target_account')='ren-zhe-ai-chi-yu-52'
 AND json_extract(a.draft_readback,'$.draft_url')=a.draft_url AND json_extract(d.readback,'$.draft_url')=d.draft_url
 AND json_extract(a.result_meta,'$.verification.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_type(a.result_meta,'$.size')='integer' AND json_extract(a.result_meta,'$.size')>0
 AND json_extract(a.draft_readback,'$.verification_method')='agent_readback' AND json_extract(d.readback,'$.verification_method')='agent_readback'
 AND json_extract(a.draft_readback,'$.independently_reopened')=1 AND json_extract(d.readback,'$.independently_reopened')=1
 AND json_extract(a.draft_readback,'$.saved_indicator_observed')=1 AND json_extract(d.readback,'$.saved_indicator_observed')=1
 AND json_extract(a.draft_readback,'$.images_loaded')=1 AND json_extract(d.readback,'$.images_loaded')=1
 AND julianday(json_extract(a.draft_readback,'$.saved_at'))<=julianday(json_extract(a.draft_readback,'$.reopened_at')) AND julianday(json_extract(a.draft_readback,'$.reopened_at'))<=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND julianday(json_extract(d.readback,'$.saved_at'))<=julianday(json_extract(d.readback,'$.reopened_at')) AND julianday(json_extract(d.readback,'$.reopened_at'))<=julianday(json_extract(d.readback,'$.read_at'))
 AND julianday(json_extract(a.draft_readback,'$.read_at'))>=julianday(a.created) AND julianday(json_extract(d.readback,'$.read_at'))>=julianday(a.created)
 AND julianday(json_extract(a.draft_readback,'$.read_at'))<=julianday('now')+1.0/1440 AND julianday(json_extract(d.readback,'$.read_at'))<=julianday('now')+1.0/1440
 AND length(substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1)) BETWEEN 1 AND 24 AND substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1) NOT GLOB '*[^0-9]*'
 AND length(substr(d.draft_url,30,length(d.draft_url)-34)) BETWEEN 1 AND 24 AND substr(d.draft_url,30,length(d.draft_url)-34) NOT GLOB '*[^0-9]*'
 AND NOT EXISTS(SELECT 1 FROM word_serial_slots ws WHERE ws.owner=a.owner AND ws.target_kind='article' AND ws.target_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM word_attempts wa WHERE wa.owner=a.owner AND wa.target_kind='article' AND wa.target_id=a.id AND wa.state IN ('running','stop_requested','waiting_safe_stop'))
 AND NOT EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id AND (c.state<>'completed' OR c.end_reference IS NULL OR length(trim(c.end_reference))=0 OR EXISTS(SELECT 1 FROM dedao_cloud_actions ca WHERE ca.owner=c.owner AND ca.task_id=c.id AND ca.state<>'confirmed')))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='toutiao' AND u.state='verified' AND u.target_account='61556093362' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=a.draft_readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='zhihu' AND u.state='verified' AND u.target_account='ren-zhe-ai-chi-yu-52' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=d.readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(d.readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND julianday(json_extract(a.draft_readback,'$.read_at')) IS NOT NULL AND julianday(json_extract(d.readback,'$.read_at')) IS NOT NULL
 AND a.draft_url GLOB 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=[0-9]*'
 AND d.draft_url GLOB 'https://zhuanlan.zhihu.com/p/[0-9]*/edit' WHERE a.id=NEW.article_id AND a.owner=NEW.owner; END;

--> statement-breakpoint
CREATE TRIGGER article_history_capture_cloud_end AFTER UPDATE OF state,end_reference ON dedao_cloud_requests WHEN NEW.state='completed' AND NEW.end_reference IS NOT NULL BEGIN INSERT OR IGNORE INTO article_history(owner,history_key,article_id,record_json,evidence_sha256,completed_at,created) SELECT a.owner,'website:'||a.id,a.id,json_object('history_key','website:'||a.id,'website_article_id',a.id,
 'mode',CASE WHEN EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id) OR EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=a.owner AND i.article_id=a.id) THEN 'website_full_auto' ELSE 'website_semi_auto' END,
 'title',CASE WHEN json_valid(a.paragraphs) THEN (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) ELSE a.title END,'topic_label',a.title,'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),'completed_at_precision','second','status','private_drafts_verified',
 'word',json_object('sha256',json_extract(a.result_meta,'$.sha256'),'size_bytes',json_extract(a.result_meta,'$.size'),'image_count',CASE WHEN json_valid(a.artifact_manifest) THEN json_array_length(a.artifact_manifest,'$.layout.images') ELSE NULL END),
 'platforms',json_object('toutiao',json_object('account_id','61556093362','draft_id',substr(a.draft_url,instr(a.draft_url,'pgc_id=')+7),'draft_url',a.draft_url,'status','verified_private_draft','last_verified_at',json_extract(a.draft_readback,'$.read_at'),'current_existence_rechecked',json('false')),
 'zhihu',json_object('account_id','ren-zhe-ai-chi-yu-52','draft_id',substr(d.draft_url,30,length(d.draft_url)-34),'draft_url',d.draft_url,'status','verified_private_draft','last_verified_at',json_extract(d.readback,'$.read_at'),'current_existence_rechecked',json('false'))),
 'timing',json_object('elapsed_seconds',CAST(ROUND((julianday(strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))))-julianday(a.created))*86400) AS INTEGER),'basis','source_upload_to_verified_drafts'),
 'evidence',json_object('level','site_receipt'),
 'public_publication',json_object('status','not_observed','published_at',NULL,'published_url',NULL,'metrics_24h',NULL)),json_extract(a.result_meta,'$.sha256'),strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at')))),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM articles a JOIN article_deliveries d ON a.owner=d.owner AND a.id=d.article_id AND d.platform='zhihu' AND a.state='completed' AND d.state='saved'
 AND strftime('%Y-%m-%dT%H:%M:%fZ',MAX(julianday(json_extract(a.draft_readback,'$.read_at')),julianday(json_extract(d.readback,'$.read_at'))))>='2026-10-11T16:00:00.000Z' AND a.result_key IS NOT NULL
 AND json_valid(a.result_meta) AND json_type(a.result_meta,'$.sha256')='text' AND length(json_extract(a.result_meta,'$.sha256'))=64 AND json_extract(a.result_meta,'$.sha256') NOT GLOB '*[^a-f0-9]*'
 AND json_valid(a.draft_readback) AND json_valid(d.readback)
 AND json_extract(a.draft_readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256') AND json_extract(d.readback,'$.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_valid(a.paragraphs) AND json_type(a.paragraphs)='array' AND (SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) IS NOT NULL AND length(trim((SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)))>0
 AND json_extract(a.draft_readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_extract(d.readback,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1)
 AND json_extract(a.draft_readback,'$.target_account')='61556093362' AND json_extract(d.readback,'$.target_account')='ren-zhe-ai-chi-yu-52'
 AND json_extract(a.draft_readback,'$.draft_url')=a.draft_url AND json_extract(d.readback,'$.draft_url')=d.draft_url
 AND json_extract(a.result_meta,'$.verification.word_sha256')=json_extract(a.result_meta,'$.sha256')
 AND json_type(a.result_meta,'$.size')='integer' AND json_extract(a.result_meta,'$.size')>0
 AND json_extract(a.draft_readback,'$.verification_method')='agent_readback' AND json_extract(d.readback,'$.verification_method')='agent_readback'
 AND json_extract(a.draft_readback,'$.independently_reopened')=1 AND json_extract(d.readback,'$.independently_reopened')=1
 AND json_extract(a.draft_readback,'$.saved_indicator_observed')=1 AND json_extract(d.readback,'$.saved_indicator_observed')=1
 AND json_extract(a.draft_readback,'$.images_loaded')=1 AND json_extract(d.readback,'$.images_loaded')=1
 AND julianday(json_extract(a.draft_readback,'$.saved_at'))<=julianday(json_extract(a.draft_readback,'$.reopened_at')) AND julianday(json_extract(a.draft_readback,'$.reopened_at'))<=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND julianday(json_extract(d.readback,'$.saved_at'))<=julianday(json_extract(d.readback,'$.reopened_at')) AND julianday(json_extract(d.readback,'$.reopened_at'))<=julianday(json_extract(d.readback,'$.read_at'))
 AND julianday(json_extract(a.draft_readback,'$.read_at'))>=julianday(a.created) AND julianday(json_extract(d.readback,'$.read_at'))>=julianday(a.created)
 AND julianday(json_extract(a.draft_readback,'$.read_at'))<=julianday('now')+1.0/1440 AND julianday(json_extract(d.readback,'$.read_at'))<=julianday('now')+1.0/1440
 AND length(substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1)) BETWEEN 1 AND 24 AND substr(a.draft_url,length('https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=')+1) NOT GLOB '*[^0-9]*'
 AND length(substr(d.draft_url,30,length(d.draft_url)-34)) BETWEEN 1 AND 24 AND substr(d.draft_url,30,length(d.draft_url)-34) NOT GLOB '*[^0-9]*'
 AND NOT EXISTS(SELECT 1 FROM word_serial_slots ws WHERE ws.owner=a.owner AND ws.target_kind='article' AND ws.target_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM word_attempts wa WHERE wa.owner=a.owner AND wa.target_kind='article' AND wa.target_id=a.id AND wa.state IN ('running','stop_requested','waiting_safe_stop'))
 AND NOT EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=a.owner AND c.article_id=a.id AND (c.state<>'completed' OR c.end_reference IS NULL OR length(trim(c.end_reference))=0 OR EXISTS(SELECT 1 FROM dedao_cloud_actions ca WHERE ca.owner=c.owner AND ca.task_id=c.id AND ca.state<>'confirmed')))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='toutiao' AND u.state='verified' AND u.target_account='61556093362' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=a.draft_readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(a.draft_readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND EXISTS(SELECT 1 FROM article_upload_attempts u JOIN article_upload_executor_ends e ON e.owner=u.owner AND e.attempt_id=u.id AND e.article_id=u.article_id AND e.platform=u.platform
 WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform='zhihu' AND u.state='verified' AND u.target_account='ren-zhe-ai-chi-yu-52' AND u.word_sha256=json_extract(a.result_meta,'$.sha256') AND u.word_size=json_extract(a.result_meta,'$.size') AND u.readback=d.readback
 AND json_valid(u.baseline) AND json_extract(u.baseline,'$.title')=(SELECT jt.value FROM json_each(a.paragraphs) jt WHERE jt.type='text' AND trim(jt.value,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>'' ORDER BY CAST(jt.key AS INTEGER) LIMIT 1) AND json_valid(e.attempt_snapshot)
 AND json_extract(e.attempt_snapshot,'$.id')=u.id AND json_extract(e.attempt_snapshot,'$.owner')=u.owner AND json_extract(e.attempt_snapshot,'$.article_id')=u.article_id AND json_extract(e.attempt_snapshot,'$.platform')=u.platform
 AND json_extract(e.attempt_snapshot,'$.word_sha256')=u.word_sha256 AND json_extract(e.attempt_snapshot,'$.target_account')=u.target_account AND json_extract(e.attempt_snapshot,'$.readback')=u.readback AND e.claim_sha256=u.claim_hash
 AND length(e.execution_end_reference)>0 AND length(e.attempt_sha256)=64 AND julianday(e.created)>=julianday(json_extract(d.readback,'$.read_at'))
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts newer WHERE newer.owner=u.owner AND newer.article_id=u.article_id AND newer.platform=u.platform AND newer.attempt_version>u.attempt_version))
 AND julianday(json_extract(a.draft_readback,'$.read_at')) IS NOT NULL AND julianday(json_extract(d.readback,'$.read_at')) IS NOT NULL
 AND a.draft_url GLOB 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=[0-9]*'
 AND d.draft_url GLOB 'https://zhuanlan.zhihu.com/p/[0-9]*/edit' WHERE a.id=NEW.article_id AND a.owner=NEW.owner; END;
