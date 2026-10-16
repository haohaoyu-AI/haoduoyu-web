import {sql} from 'drizzle-orm';
import {sqliteTable, text, integer, uniqueIndex} from 'drizzle-orm/sqlite-core';
// No bearer credentials. One immutable root and at most one explicitly authorized child per source.
export const articleUploadAttempts = sqliteTable('article_upload_attempts', {
 id: text('id').primaryKey(),attemptVersion:integer('attempt_version').notNull().default(1),previousAttemptId:text('previous_attempt_id'),authorizationKey:text('authorization_key'),reimportAuthorization:text('reimport_authorization'),consumeTokenSha256:text('consume_token_sha256'),confirmationMessageId:text('confirmation_message_id'),revision:integer('revision').notNull().default(0), owner: text('owner').notNull(), articleId: text('article_id').notNull(), platform: text('platform').notNull(),
 targetAccount: text('target_account').notNull(), wordSha256: text('word_sha256').notNull(), wordSize: integer('word_size').notNull(),authorizationKind:text('authorization_kind').notNull(),claimHash:text('claim_hash').notNull(),
 preflight: text('preflight').notNull(), baseline: text('baseline').notNull(), state: text('state').notNull(),
 editorUrls: text('editor_urls').notNull(), readback: text('readback'), created: text('created').notNull(), consumedAt: text('consumed_at'), updated: text('updated').notNull()
}, t => [uniqueIndex('article_upload_scope_version').on(t.owner,t.articleId,t.platform,t.attemptVersion),uniqueIndex('article_upload_root_scope').on(t.owner,t.articleId,t.platform).where(sql`${t.previousAttemptId} IS NULL`),uniqueIndex('article_upload_source_once').on(t.owner,t.previousAttemptId).where(sql`${t.previousAttemptId} IS NOT NULL`),uniqueIndex('article_upload_owner_authorization').on(t.owner,t.authorizationKey).where(sql`${t.authorizationKey} IS NOT NULL`),uniqueIndex('article_upload_consume_token').on(t.consumeTokenSha256).where(sql`${t.consumeTokenSha256} IS NOT NULL`),uniqueIndex('article_upload_scope_confirmation').on(t.owner,t.articleId,t.platform,t.confirmationMessageId).where(sql`${t.confirmationMessageId} IS NOT NULL AND COALESCE(json_extract(${t.reimportAuthorization},'$.request.authorization_scope'),'exact_reimport') != 'duplicate_tolerant_task'`)]);

export const articleClaimCredentialHashes=sqliteTable('article_claim_credential_hashes',{
 owner:text('owner').notNull(),sha256:text('sha256').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('article_claim_owner_sha256').on(t.owner,t.sha256)]);

// Append-only executor acknowledgement; not server proof that a browser process exited.
export const articleUploadExecutorEnds=sqliteTable('article_upload_executor_ends',{
 attemptId:text('attempt_id').primaryKey(),owner:text('owner').notNull(),articleId:text('article_id').notNull(),platform:text('platform').notNull(),attemptSha256:text('attempt_sha256').notNull(),attemptSnapshot:text('attempt_snapshot').notNull(),claimSha256:text('claim_sha256').notNull(),executionEndReference:text('execution_end_reference').notNull(),created:text('created').notNull()
});
