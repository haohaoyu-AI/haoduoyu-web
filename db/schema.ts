import { sql } from 'drizzle-orm';
import { sqliteTable,text,integer,index,uniqueIndex,primaryKey,foreignKey,check } from 'drizzle-orm/sqlite-core';

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
