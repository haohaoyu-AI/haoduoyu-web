import { sql } from 'drizzle-orm';
import { sqliteTable,text,integer,real,index,uniqueIndex,primaryKey,foreignKey,check } from 'drizzle-orm/sqlite-core';

export const matrixAccounts=sqliteTable('matrix_accounts',{
  id:text('id').primaryKey(),platform:text('platform').notNull(),name:text('name').notNull(),active:integer('active').notNull().default(1),created_at:text('created_at').notNull(),
},t=>[check('matrix_account_active',sql`${t.active} IN (0,1)`)]);
export const matrixArticles=sqliteTable('matrix_articles',{
  id:text('id').primaryKey(),account_id:text('account_id').notNull().references(()=>matrixAccounts.id),title:text('title').notNull(),url:text('url'),platform_article_id:text('platform_article_id'),published_at:text('published_at'),started_at:text('started_at'),production_mode:text('production_mode').notNull().default('unknown'),summary:text('summary').notNull().default(''),notes:text('notes').notNull().default(''),version:integer('version').notNull().default(1),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
  status:text('status').default('published'),slot:text('slot'),run_dir:text('run_dir'),run_date:text('run_date'),series_no:integer('series_no'),writer:text('writer'),illustrator:text('illustrator'),sample_json:text('sample_json'),char_count:integer('char_count'),subheading_count:integer('subheading_count'),image_count:integer('image_count'),cover_desc:text('cover_desc'),draft_ref_json:text('draft_ref_json'),timings_json:text('timings_json'),reruns_json:text('reruns_json'),blockers_json:text('blockers_json'),verify_items_json:text('verify_items_json'),
},t=>[
  uniqueIndex('matrix_article_url').on(t.account_id,t.url),
  uniqueIndex('matrix_article_platform_id').on(t.account_id,t.platform_article_id).where(sql`${t.platform_article_id} IS NOT NULL AND ${t.platform_article_id} != ''`),
  index('matrix_article_account_date').on(t.account_id,t.published_at),
  uniqueIndex('matrix_article_run_dir').on(t.run_dir).where(sql`${t.run_dir} IS NOT NULL`),
  uniqueIndex('matrix_article_slot_date').on(t.slot,t.run_date).where(sql`${t.slot} IS NOT NULL AND ${t.run_date} IS NOT NULL`),
  check('matrix_article_mode',sql`${t.production_mode} IN ('manual','automatic','mixed','unknown')`),
  check('matrix_article_pipeline_status',sql`${t.status} IS NULL OR ${t.status} IN ('drafting','illustrated','draft_saved','published','failed')`),
  check('matrix_article_pipeline_slot',sql`${t.slot} IS NULL OR ${t.slot} IN ('zh1','zh2','tt1','tt2','zh3','tt3','gzh')`),
  check('matrix_article_pipeline_writer',sql`${t.writer} IS NULL OR ${t.writer} IN ('dedao','gemini_web','human','other')`),
  check('matrix_article_pipeline_illustrator',sql`${t.illustrator} IS NULL OR ${t.illustrator} IN ('codex','pil','human')`),
  check('matrix_article_pipeline_series_no',sql`${t.series_no} IS NULL OR (typeof(${t.series_no})='integer' AND ${t.series_no} BETWEEN 1 AND 9007199254740991)`),
  check('matrix_article_pipeline_char_count',sql`${t.char_count} IS NULL OR (typeof(${t.char_count})='integer' AND ${t.char_count} BETWEEN 0 AND 9007199254740991)`),
  check('matrix_article_pipeline_subheading_count',sql`${t.subheading_count} IS NULL OR (typeof(${t.subheading_count})='integer' AND ${t.subheading_count} BETWEEN 0 AND 9007199254740991)`),
  check('matrix_article_pipeline_image_count',sql`${t.image_count} IS NULL OR (typeof(${t.image_count})='integer' AND ${t.image_count} BETWEEN 0 AND 9007199254740991)`),
  check('matrix_article_pipeline_sample_json',sql`${t.sample_json} IS NULL OR CASE WHEN json_valid(${t.sample_json}) THEN json_type(${t.sample_json})='object' ELSE 0 END`),
  check('matrix_article_pipeline_draft_ref_json',sql`${t.draft_ref_json} IS NULL OR CASE WHEN json_valid(${t.draft_ref_json}) THEN json_type(${t.draft_ref_json})='object' ELSE 0 END`),
  check('matrix_article_pipeline_timings_json',sql`${t.timings_json} IS NULL OR CASE WHEN json_valid(${t.timings_json}) THEN json_type(${t.timings_json})='object' ELSE 0 END`),
  check('matrix_article_pipeline_reruns_json',sql`${t.reruns_json} IS NULL OR CASE WHEN json_valid(${t.reruns_json}) THEN json_type(${t.reruns_json})='object' ELSE 0 END`),
  check('matrix_article_pipeline_blockers_json',sql`${t.blockers_json} IS NULL OR CASE WHEN json_valid(${t.blockers_json}) THEN json_type(${t.blockers_json})='array' ELSE 0 END`),
  check('matrix_article_pipeline_verify_items_json',sql`${t.verify_items_json} IS NULL OR CASE WHEN json_valid(${t.verify_items_json}) THEN json_type(${t.verify_items_json})='array' ELSE 0 END`),
]);
export const matrixObservations=sqliteTable('matrix_observations',{
  id:text('id').primaryKey(),article_id:text('article_id').notNull().references(()=>matrixArticles.id),as_of:text('as_of').notNull(),collected_at:text('collected_at').notNull(),kind:text('kind').notNull(),metrics_json:text('metrics_json').notNull(),source:text('source').notNull(),note:text('note').notNull().default(''),created_at:text('created_at').notNull(),
},t=>[index('matrix_observation_article_time').on(t.article_id,t.as_of),check('matrix_observation_kind',sql`${t.kind} IN ('latest','d1','d3','d7')`)]);
export const matrixDaily=sqliteTable('matrix_daily_metrics',{
  id:text('id').primaryKey(),account_id:text('account_id').notNull().references(()=>matrixAccounts.id),article_id:text('article_id').references(()=>matrixArticles.id),date:text('date').notNull(),metrics_json:text('metrics_json').notNull(),source:text('source').notNull(),updated_at:text('updated_at').notNull(),
},t=>[uniqueIndex('matrix_daily_account_day').on(t.account_id,t.date).where(sql`${t.article_id} IS NULL`),uniqueIndex('matrix_daily_article_day').on(t.account_id,t.article_id,t.date).where(sql`${t.article_id} IS NOT NULL`)]);
export const matrixUsers=sqliteTable('matrix_users',{
  id:text('id').primaryKey(),username:text('username').notNull(),password_hash:text('password_hash').notNull(),created_at:text('created_at').notNull(),
},t=>[uniqueIndex('matrix_username').on(t.username)]);
export const matrixTodos=sqliteTable('matrix_todos',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),date:text('date').notNull(),text:text('text').notNull(),completed:integer('completed').notNull().default(0),version:integer('version').notNull().default(1),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),index('matrix_todo_user_date').on(t.user_id,t.date,t.created_at),check('matrix_todo_completed',sql`${t.completed} IN (0,1)`),check('matrix_todo_text',sql`length(${t.text}) BETWEEN 1 AND 500`),check('matrix_todo_version',sql`${t.version} >= 1`)]);
export const matrixUnscheduledTodos=sqliteTable('matrix_unscheduled_todos',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),text:text('text').notNull(),completed:integer('completed').notNull().default(0),version:integer('version').notNull().default(1),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),index('matrix_unscheduled_todo_user_created').on(t.user_id,t.created_at,t.id),check('matrix_unscheduled_todo_completed',sql`${t.completed} IN (0,1)`),check('matrix_unscheduled_todo_text',sql`length(${t.text}) BETWEEN 1 AND 500`),check('matrix_unscheduled_todo_version',sql`${t.version} >= 1`)]);
export const matrixTodoTemplates=sqliteTable('matrix_todo_templates',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),text:text('text').notNull(),version:integer('version').notNull().default(1),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),index('matrix_todo_template_user').on(t.user_id,t.deleted_at,t.created_at),check('matrix_todo_template_text',sql`length(${t.text}) BETWEEN 1 AND 500`),check('matrix_todo_template_version',sql`${t.version} >= 1`)]);
export const matrixTodoPreferences=sqliteTable('matrix_todo_preferences',{
  user_id:text('user_id').primaryKey().references(()=>matrixUsers.id,{onDelete:'cascade'}),completed_mode:text('completed_mode').notNull().default('strike'),version:integer('version').notNull().default(1),updated_at:text('updated_at').notNull(),
},t=>[check('matrix_todo_completed_mode',sql`${t.completed_mode} IN ('strike','hide')`),check('matrix_todo_preferences_version',sql`${t.version} >= 1`)]);
export const matrixTodoTemplateLinks=sqliteTable('matrix_todo_template_links',{
  user_id:text('user_id').notNull(),todo_id:text('todo_id').notNull(),template_id:text('template_id').notNull(),created_with_todo:integer('created_with_todo').notNull().default(1),
},t=>[primaryKey({columns:[t.user_id,t.todo_id]}),index('matrix_todo_template_link').on(t.user_id,t.template_id),foreignKey({columns:[t.user_id,t.todo_id],foreignColumns:[matrixTodos.user_id,matrixTodos.id]}).onDelete('cascade'),foreignKey({columns:[t.user_id,t.template_id],foreignColumns:[matrixTodoTemplates.user_id,matrixTodoTemplates.id]})]);
export const matrixDailyNotes=sqliteTable('matrix_daily_notes',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),date:text('date').notNull(),text:text('text').notNull().default(''),version:integer('version').notNull(),change_seq:integer('change_seq').notNull(),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.date]}),index('matrix_daily_notes_user_changes').on(t.user_id,t.change_seq,t.date),check('matrix_daily_notes_version',sql`${t.version} >= 1`),check('matrix_daily_notes_change_seq',sql`${t.change_seq} >= 1`)]);
export const matrixDailyWorkNotes=sqliteTable('matrix_daily_work_notes',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),date:text('date').notNull(),text:text('text').notNull().default(''),version:integer('version').notNull(),change_seq:integer('change_seq').notNull(),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.date]}),index('matrix_daily_work_notes_user_changes').on(t.user_id,t.change_seq,t.date),check('matrix_daily_work_notes_version',sql`${t.version} >= 1`),check('matrix_daily_work_notes_change_seq',sql`${t.change_seq} >= 1`)]);
export const matrixNoteEntries=sqliteTable('matrix_note_entries',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),
  category:text('category').notNull(),date:text('date').notNull(),text:text('text').notNull().default(''),
  version:integer('version').notNull(),change_seq:integer('change_seq').notNull(),
  created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),
  index('matrix_note_entry_day').on(t.user_id,t.category,t.date,t.created_at,t.id),
  check('matrix_note_entry_category',sql`${t.category} IN ('life','work')`),
  check('matrix_note_entry_version',sql`${t.version} >= 1`),check('matrix_note_entry_changes',sql`${t.change_seq} >= 1`)]);
export const matrixNoteLabels=sqliteTable('matrix_note_labels',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),name:text('name').notNull(),created_at:text('created_at').notNull(),
},t=>[primaryKey({columns:[t.user_id,t.name]}),check('matrix_note_label_name',sql`length(${t.name}) BETWEEN 1 AND 32`)]);
export const matrixNoteLabelArchives=sqliteTable('matrix_note_label_archives',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),name:text('name').notNull(),archived_at:text('archived_at').notNull(),
},t=>[primaryKey({columns:[t.user_id,t.name]}),check('matrix_note_label_archive_name',sql`length(${t.name}) BETWEEN 1 AND 32`)]);
export const matrixNoteEntryLabels=sqliteTable('matrix_note_entry_labels',{
  user_id:text('user_id').notNull(),entry_id:text('entry_id').notNull(),label:text('label').notNull(),
},t=>[primaryKey({columns:[t.user_id,t.entry_id]}),
  foreignKey({columns:[t.user_id,t.entry_id],foreignColumns:[matrixNoteEntries.user_id,matrixNoteEntries.id]}).onDelete('cascade'),
  foreignKey({columns:[t.user_id,t.label],foreignColumns:[matrixNoteLabels.user_id,matrixNoteLabels.name]}),
  index('matrix_note_entry_label_lookup').on(t.user_id,t.label,t.entry_id)]);
export const matrixNoteEntryLabelOverrides=sqliteTable('matrix_note_entry_label_overrides',{
  user_id:text('user_id').notNull(),entry_id:text('entry_id').notNull(),labels_json:text('labels_json').notNull(),
},t=>[primaryKey({columns:[t.user_id,t.entry_id]}),
  foreignKey({columns:[t.user_id,t.entry_id],foreignColumns:[matrixNoteEntries.user_id,matrixNoteEntries.id]}).onDelete('cascade'),
  check('matrix_note_entry_override_json',sql`json_valid(${t.labels_json}) AND json_type(${t.labels_json}) = 'array'`)]);
export const matrixNoteEntryLabelSets=sqliteTable('matrix_note_entry_label_sets',{
  user_id:text('user_id').notNull(),entry_id:text('entry_id').notNull(),labels_json:text('labels_json').notNull(),
},t=>[primaryKey({columns:[t.user_id,t.entry_id]}),
  foreignKey({columns:[t.user_id,t.entry_id],foreignColumns:[matrixNoteEntries.user_id,matrixNoteEntries.id]}).onDelete('cascade'),
  check('matrix_note_entry_label_sets_json',sql`json_valid(${t.labels_json}) AND json_type(${t.labels_json}) = 'array'`)]);
export const matrixWorkReminders=sqliteTable('matrix_work_reminders',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),
  date:text('date').notNull(),source_key:text('source_key').notNull(),summary:text('summary').notNull(),
  version:integer('version').notNull(),change_seq:integer('change_seq').notNull(),
  created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),uniqueIndex('matrix_work_reminder_source').on(t.user_id,t.date,t.source_key),
  check('matrix_work_reminder_version',sql`${t.version} >= 1`),check('matrix_work_reminder_changes',sql`${t.change_seq} >= 1`)]);
export const matrixAccountProfiles=sqliteTable('matrix_account_profiles',{
  account_id:text('account_id').primaryKey().references(()=>matrixAccounts.id,{onDelete:'cascade'}),
  profile_url:text('profile_url').notNull(),platform_identity:text('platform_identity').notNull(),
  created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[uniqueIndex('matrix_account_profile_url').on(t.profile_url),uniqueIndex('matrix_account_profile_identity').on(t.platform_identity)]);
export const matrixMemoGroups=sqliteTable('matrix_memo_groups',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id),id:text('id').notNull(),title:text('title').notNull(),
  position:integer('position').notNull(),version:integer('version').notNull(),change_seq:integer('change_seq').notNull(),
  created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[
  primaryKey({columns:[t.user_id,t.id]}),index('matrix_memo_group_owner_order').on(t.user_id,t.deleted_at,t.position,t.id),
  check('matrix_memo_group_title',sql`length(${t.title}) BETWEEN 1 AND 120`),
  check('matrix_memo_group_position',sql`typeof(${t.position})='integer' AND ${t.position} BETWEEN 0 AND 1000000`),
  check('matrix_memo_group_version',sql`typeof(${t.version})='integer' AND ${t.version} BETWEEN 1 AND 9007199254740991`),
  check('matrix_memo_group_change_seq',sql`typeof(${t.change_seq})='integer' AND ${t.change_seq} BETWEEN 1 AND 9007199254740991`),
]);
export const matrixMemoNotes=sqliteTable('matrix_memo_notes',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id),id:text('id').notNull(),group_id:text('group_id').notNull(),
  title:text('title').notNull(),body:text('body').notNull().default(''),position:integer('position').notNull(),
  version:integer('version').notNull(),change_seq:integer('change_seq').notNull(),
  created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[
  primaryKey({columns:[t.user_id,t.id]}),
  foreignKey({columns:[t.user_id,t.group_id],foreignColumns:[matrixMemoGroups.user_id,matrixMemoGroups.id]}),
  index('matrix_memo_note_owner_order').on(t.user_id,t.group_id,t.deleted_at,t.position,t.id),
  check('matrix_memo_note_title',sql`length(${t.title}) BETWEEN 1 AND 120`),
  check('matrix_memo_note_body',sql`length(CAST(${t.body} AS BLOB)) <= 65536`),
  check('matrix_memo_note_position',sql`typeof(${t.position})='integer' AND ${t.position} BETWEEN 0 AND 1000000`),
  check('matrix_memo_note_version',sql`typeof(${t.version})='integer' AND ${t.version} BETWEEN 1 AND 9007199254740991`),
  check('matrix_memo_note_change_seq',sql`typeof(${t.change_seq})='integer' AND ${t.change_seq} BETWEEN 1 AND 9007199254740991`),
]);
export const matrixSessions=sqliteTable('matrix_sessions',{
  token_hash:text('token_hash').primaryKey(),user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),expires_at:text('expires_at').notNull(),
},t=>[index('matrix_session_user').on(t.user_id)]);
export const matrixKeys=sqliteTable('matrix_api_keys',{
  id:text('id').primaryKey(),name:text('name').notNull(),token_hash:text('token_hash').notNull(),account_ids_json:text('account_ids_json').notNull(),permissions_json:text('permissions_json').notNull(),created_at:text('created_at').notNull(),revoked_at:text('revoked_at'),last_used_at:text('last_used_at'),
},t=>[uniqueIndex('matrix_key_hash').on(t.token_hash)]);
export const matrixAudit=sqliteTable('matrix_audit',{
  id:text('id').primaryKey(),actor:text('actor').notNull(),action:text('action').notNull(),entity_id:text('entity_id'),detail_json:text('detail_json').notNull(),created_at:text('created_at').notNull(),
},t=>[index('matrix_audit_entity_time').on(t.entity_id,t.created_at)]);
export const matrixIdempotency=sqliteTable('matrix_idempotency',{
  actor:text('actor').notNull(),key:text('key').notNull(),request_hash:text('request_hash').notNull(),response_json:text('response_json').notNull(),status:integer('status').notNull(),created_at:text('created_at').notNull(),
},t=>[primaryKey({columns:[t.actor,t.key]})]);
export const matrixAttempts=sqliteTable('matrix_login_attempts',{
  bucket:text('bucket').primaryKey(),attempts:integer('attempts').notNull(),window_start:integer('window_start').notNull(),
});
export const matrixControl=sqliteTable('matrix_control',{
  id:integer('id').primaryKey(),revision:integer('revision').notNull().default(0),initialized:integer('initialized').notNull().default(0),revision_guard:integer('revision_guard').notNull().default(1),auth_guard:integer('auth_guard').notNull().default(1),setup_guard:integer('setup_guard').notNull().default(1),
},t=>[check('matrix_single_control',sql`${t.id}=1`),check('matrix_revision_match',sql`${t.revision_guard}=1`),check('matrix_auth_match',sql`${t.auth_guard}=1`),check('matrix_setup_match',sql`${t.setup_guard}=1`)]);

export const matrixAiReports=sqliteTable('matrix_ai_reports',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),
  author:text('author').notNull(),content:text('content').notNull(),created_at:text('created_at').notNull(),
},t=>[primaryKey({columns:[t.user_id,t.id]}),index('matrix_ai_reports_owner_time').on(t.user_id,t.created_at,t.id)]);

// Content review is a separate, initially empty collection; legacy articles stay intact.
export const matrixReviewArticles=sqliteTable('matrix_review_articles',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),
  account:text('account').notNull().default('V字'),platform:text('platform').notNull().default('toutiao'),
  platform_article_id:text('platform_article_id'),title:text('title').notNull(),url:text('url'),published_at:text('published_at'),
  topic_category:text('topic_category'),title_pattern:text('title_pattern'),sample_title:text('sample_title'),sample_url:text('sample_url'),reference_article_id:text('reference_article_id'),
  image_count:integer('image_count'),source_chat:text('source_chat'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
  playbook_version_used:integer('playbook_version_used'),applied_rule_ids_json:text('applied_rule_ids_json'),
},t=>[
  primaryKey({columns:[t.user_id,t.id]}),
  uniqueIndex('matrix_review_article_platform_id').on(t.user_id,t.account,t.platform_article_id),
  index('matrix_review_article_account_date').on(t.user_id,t.account,t.published_at,t.id),
  check('matrix_review_article_platform',sql`${t.platform} = 'toutiao'`),
  check('matrix_review_article_image_count',sql`${t.image_count} IS NULL OR (typeof(${t.image_count})='integer' AND ${t.image_count} BETWEEN 0 AND 9007199254740991)`),
  check('matrix_review_article_playbook_version_used',sql`${t.playbook_version_used} IS NULL OR (typeof(${t.playbook_version_used})='integer' AND ${t.playbook_version_used} BETWEEN 1 AND 9007199254740991)`),
  check('matrix_review_article_applied_rule_ids_json',sql`${t.applied_rule_ids_json} IS NULL OR CASE WHEN json_valid(${t.applied_rule_ids_json}) THEN json_type(${t.applied_rule_ids_json})='array' ELSE 0 END`),
]);
export const matrixReviewSnapshots=sqliteTable('matrix_review_snapshots',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),
  article_id:text('article_id').notNull(),snapshot_date:text('snapshot_date').notNull(),
  age_hours:integer('age_hours'),source:text('source'),
  impressions:integer('impressions'),fan_impressions:integer('fan_impressions'),
  reads:integer('reads'),fan_reads:integer('fan_reads'),
  ctr:real('ctr'),completion_rate:real('completion_rate'),avg_read_seconds:real('avg_read_seconds'),
  likes:integer('likes'),comments:integer('comments'),reposts:integer('reposts'),
  shares:integer('shares'),favorites:integer('favorites'),revenue:real('revenue'),
  traffic_sources_json:text('traffic_sources_json'),completion_curve_json:text('completion_curve_json'),audience_json:text('audience_json'),
},t=>[
  primaryKey({columns:[t.user_id,t.id]}),
  foreignKey({columns:[t.user_id,t.article_id],foreignColumns:[matrixReviewArticles.user_id,matrixReviewArticles.id]}).onDelete('cascade'),
  uniqueIndex('matrix_review_snapshot_article_date').on(t.user_id,t.article_id,t.snapshot_date),
  check('matrix_review_snapshot_counts',sql`(${t.impressions} IS NULL OR (typeof(${t.impressions})='integer' AND ${t.impressions} BETWEEN 0 AND 9007199254740991)) AND (${t.fan_impressions} IS NULL OR (typeof(${t.fan_impressions})='integer' AND ${t.fan_impressions} BETWEEN 0 AND 9007199254740991)) AND (${t.reads} IS NULL OR (typeof(${t.reads})='integer' AND ${t.reads} BETWEEN 0 AND 9007199254740991)) AND (${t.fan_reads} IS NULL OR (typeof(${t.fan_reads})='integer' AND ${t.fan_reads} BETWEEN 0 AND 9007199254740991)) AND (${t.likes} IS NULL OR (typeof(${t.likes})='integer' AND ${t.likes} BETWEEN 0 AND 9007199254740991)) AND (${t.comments} IS NULL OR (typeof(${t.comments})='integer' AND ${t.comments} BETWEEN 0 AND 9007199254740991)) AND (${t.reposts} IS NULL OR (typeof(${t.reposts})='integer' AND ${t.reposts} BETWEEN 0 AND 9007199254740991)) AND (${t.shares} IS NULL OR (typeof(${t.shares})='integer' AND ${t.shares} BETWEEN 0 AND 9007199254740991)) AND (${t.favorites} IS NULL OR (typeof(${t.favorites})='integer' AND ${t.favorites} BETWEEN 0 AND 9007199254740991))`),
  check('matrix_review_snapshot_rates',sql`(${t.ctr} IS NULL OR ${t.ctr} >= 0) AND (${t.completion_rate} IS NULL OR ${t.completion_rate} >= 0) AND (${t.avg_read_seconds} IS NULL OR ${t.avg_read_seconds} >= 0) AND (${t.revenue} IS NULL OR ${t.revenue} >= 0)`),
  check('matrix_review_snapshot_traffic_json',sql`${t.traffic_sources_json} IS NULL OR json_valid(${t.traffic_sources_json})`),
  check('matrix_review_snapshot_curve_json',sql`${t.completion_curve_json} IS NULL OR json_valid(${t.completion_curve_json})`),
  check('matrix_review_snapshot_audience_json',sql`${t.audience_json} IS NULL OR json_valid(${t.audience_json})`),
  check('matrix_review_snapshot_age_hours',sql`${t.age_hours} IS NULL OR (typeof(${t.age_hours})='integer' AND ${t.age_hours} BETWEEN 0 AND 9007199254740991)`),
  check('matrix_review_snapshot_source',sql`${t.source} IS NULL OR ${t.source} IN ('toutiao_excel','manual')`),
]);
export const matrixReviewReports=sqliteTable('matrix_review_reports',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),
  account:text('account').notNull().default('V字'),period_type:text('period_type').notNull(),period_start:text('period_start').notNull(),period_end:text('period_end').notNull(),
  verdicts_json:text('verdicts_json').notNull().default('{}'),findings_json:text('findings_json').notNull().default('{}'),summary_md:text('summary_md').notNull().default(''),
  metrics_json:text('metrics_json').notNull().default('{}'),playbook_version:integer('playbook_version'),created_at:text('created_at').notNull(),
},t=>[
  primaryKey({columns:[t.user_id,t.id]}),
  uniqueIndex('matrix_review_report_account_period').on(t.user_id,t.account,t.period_type,t.period_start),
  index('matrix_review_report_account_date').on(t.user_id,t.account,t.period_start,t.id),
  check('matrix_review_report_period_type',sql`${t.period_type} IN ('daily','three_day','weekly')`),
  check('matrix_review_report_period_order',sql`${t.period_start} <= ${t.period_end}`),
  check('matrix_review_report_playbook_version',sql`${t.playbook_version} IS NULL OR (typeof(${t.playbook_version})='integer' AND ${t.playbook_version} BETWEEN 1 AND 9007199254740991)`),
  check('matrix_review_report_verdicts_json',sql`CASE WHEN json_valid(${t.verdicts_json}) THEN json_type(${t.verdicts_json})='object' ELSE 0 END`),
  check('matrix_review_report_findings_json',sql`CASE WHEN json_valid(${t.findings_json}) THEN json_type(${t.findings_json})='object' ELSE 0 END`),
  check('matrix_review_report_metrics_json',sql`CASE WHEN json_valid(${t.metrics_json}) THEN json_type(${t.metrics_json})='object' ELSE 0 END`),
]);
export const matrixReviewPlaybooks=sqliteTable('matrix_review_playbooks',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),
  account:text('account').notNull().default('V字'),version:integer('version').notNull(),published_on:text('published_on').notNull(),content_md:text('content_md').notNull().default(''),
  status:text('status'),rules_json:text('rules_json').notNull().default('[]'),changelog_md:text('changelog_md').notNull().default(''),sent_to_gemini_at:text('sent_to_gemini_at'),created_at:text('created_at').notNull(),
},t=>[
  primaryKey({columns:[t.user_id,t.id]}),uniqueIndex('matrix_review_playbook_account_version').on(t.user_id,t.account,t.version),
  check('matrix_review_playbook_status',sql`${t.status} IS NULL OR ${t.status} IN ('draft','active','archived')`),
  check('matrix_review_playbook_version',sql`typeof(${t.version})='integer' AND ${t.version} BETWEEN 1 AND 9007199254740991`),
  check('matrix_review_playbook_rules_json',sql`CASE WHEN json_valid(${t.rules_json}) THEN json_type(${t.rules_json})='array' ELSE 0 END`),
]);

export const matrixReviewBenchmarkAccounts=sqliteTable('matrix_review_benchmark_accounts',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),account:text('account').notNull(),platform:text('platform').notNull(),name:text('name').notNull(),profile_url:text('profile_url'),fans:integer('fans'),is_featured_author:integer('is_featured_author'),posting_cadence:text('posting_cadence'),topic_focus:text('topic_focus'),title_patterns_json:text('title_patterns_json'),structure_notes_md:text('structure_notes_md'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),uniqueIndex('review_benchmark_account_key').on(t.user_id,t.account,t.platform,t.name)]);
export const matrixReviewBenchmarkArticles=sqliteTable('matrix_review_benchmark_articles',{
  user_id:text('user_id').notNull(),id:text('id').notNull(),benchmark_account_id:text('benchmark_account_id').notNull(),title:text('title').notNull(),url:text('url').notNull(),reads:integer('reads'),published_at:text('published_at'),title_pattern:text('title_pattern'),topic:text('topic'),news_hook:text('news_hook'),word_count:integer('word_count'),image_count:integer('image_count'),collected_on:text('collected_on'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),foreignKey({columns:[t.user_id,t.benchmark_account_id],foreignColumns:[matrixReviewBenchmarkAccounts.user_id,matrixReviewBenchmarkAccounts.id]}),uniqueIndex('review_benchmark_article_key').on(t.user_id,t.benchmark_account_id,t.url)]);
export const matrixReviewNotes=sqliteTable('matrix_review_notes',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),account:text('account').notNull(),note_date:text('note_date').notNull(),kind:text('kind').notNull(),title:text('title').notNull(),body_md:text('body_md'),tags_json:text('tags_json'),related_article_ids_json:text('related_article_ids_json'),related_rule_ids_json:text('related_rule_ids_json'),decided_by:text('decided_by'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),index('review_notes_account_date').on(t.user_id,t.account,t.note_date,t.id)]);
export const matrixReviewAccountHealth=sqliteTable('matrix_review_account_health',{
  user_id:text('user_id').notNull().references(()=>matrixUsers.id,{onDelete:'cascade'}),id:text('id').notNull(),account:text('account').notNull(),platform:text('platform').notNull(),observed_on:text('observed_on').notNull(),impressions_per_day:integer('impressions_per_day'),reads_per_day:integer('reads_per_day'),ctr:real('ctr'),since_date:text('since_date'),platform_notice_json:text('platform_notice_json'),judgement:text('judgement'),action:text('action'),resume_on:text('resume_on'),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),deleted_at:text('deleted_at'),
},t=>[primaryKey({columns:[t.user_id,t.id]}),index('review_health_account_date').on(t.user_id,t.account,t.observed_on,t.id)]);
