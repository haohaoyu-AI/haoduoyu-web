import { sql } from 'drizzle-orm';
import { sqliteTable,text,integer,index,uniqueIndex,primaryKey,foreignKey,check } from 'drizzle-orm/sqlite-core';

export const matrixAccounts=sqliteTable('matrix_accounts',{
  id:text('id').primaryKey(),platform:text('platform').notNull(),name:text('name').notNull(),active:integer('active').notNull().default(1),created_at:text('created_at').notNull(),
},t=>[check('matrix_account_active',sql`${t.active} IN (0,1)`)]);
export const matrixArticles=sqliteTable('matrix_articles',{
  id:text('id').primaryKey(),account_id:text('account_id').notNull().references(()=>matrixAccounts.id),title:text('title').notNull(),url:text('url').notNull(),platform_article_id:text('platform_article_id'),published_at:text('published_at').notNull(),started_at:text('started_at'),production_mode:text('production_mode').notNull().default('unknown'),summary:text('summary').notNull().default(''),notes:text('notes').notNull().default(''),version:integer('version').notNull().default(1),created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[uniqueIndex('matrix_article_url').on(t.account_id,t.url),uniqueIndex('matrix_article_platform_id').on(t.account_id,t.platform_article_id).where(sql`${t.platform_article_id} IS NOT NULL AND ${t.platform_article_id} != ''`),index('matrix_article_account_date').on(t.account_id,t.published_at),check('matrix_article_mode',sql`${t.production_mode} IN ('manual','automatic','mixed','unknown')`)]);
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
