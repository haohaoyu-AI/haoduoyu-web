import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, check, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
// Content-free, permanent source identities for explicitly confirmed article purges.
// They prevent delayed writers and retries from restoring deleted manuscript data.
export const articleContentFences=sqliteTable('article_content_fences',{
 owner:text('owner').notNull(),entityKind:text('entity_kind').notNull(),entityKey:text('entity_key').notNull(),articleId:text('article_id').notNull(),operationId:text('operation_id').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.entityKind,t.entityKey]}),index('article_content_fences_article').on(t.owner,t.articleId)]);
// Deleting content does not prove that an external executor stopped. Keep only
// one-way identity hashes, with no claim, manuscript, artifact or terminal proof.
export const articlePurgeSerialBlocks=sqliteTable('article_purge_serial_blocks',{
 owner:text('owner').notNull(),articleId:text('article_id').notNull(),operationId:text('operation_id').notNull(),reason:text('reason').notNull(),claimSha256:text('claim_sha256'),executionSha256:text('execution_sha256'),inputSha256:text('input_sha256'),grantRequestKey:text('grant_request_key'),tokenSha256:text('token_sha256'),epoch:integer('epoch'),acquisitionRequestKey:text('acquisition_request_key'),holderMode:text('holder_mode').notNull().default('unknown'),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.articleId]}),check('article_purge_serial_reason',sql`${t.reason}='external_end_unconfirmed'`),check('article_purge_serial_hashes',sql`(${t.claimSha256} IS NULL OR length(${t.claimSha256})=64) AND (${t.executionSha256} IS NULL OR length(${t.executionSha256})=64) AND (${t.inputSha256} IS NULL OR length(${t.inputSha256})=64) AND (${t.tokenSha256} IS NULL OR length(${t.tokenSha256})=64)`),check('article_purge_serial_holder',sql`${t.holderMode} IN ('mapped_executor','manual_help','unknown')`)]);
// Append-only settlement of the exact pre-purge holder, using the same original
// credential/mapping strength as the normal Word end path. No tokens, content,
// free-text references or server claim of external process verification survive.
export const articlePurgeExecutorEnds=sqliteTable('article_purge_executor_ends',{
 owner:text('owner').notNull(),articleId:text('article_id').notNull(),operationId:text('operation_id').notNull(),requestKey:text('request_key').notNull(),payloadSha256:text('payload_sha256').notNull(),claimSha256:text('claim_sha256').notNull(),executionSha256:text('execution_sha256'),inputSha256:text('input_sha256').notNull(),grantRequestKey:text('grant_request_key'),tokenSha256:text('token_sha256'),epoch:integer('epoch'),acquisitionRequestKey:text('acquisition_request_key'),holderMode:text('holder_mode').notNull(),observedExecutionSha256:text('observed_execution_sha256').notNull(),evidenceKind:text('evidence_kind').notNull(),endReferenceSha256:text('end_reference_sha256').notNull(),settledReferenceSha256:text('settled_reference_sha256').notNull(),allActionsStopped:integer('all_actions_stopped').notNull(),allActionsSettled:integer('all_actions_settled').notNull(),serverVerified:integer('server_verified').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),index('article_purge_executor_ends_article').on(t.owner,t.articleId,t.operationId),check('article_purge_end_hashes',sql`length(${t.payloadSha256})=64 AND length(${t.claimSha256})=64 AND length(${t.inputSha256})=64 AND length(${t.observedExecutionSha256})=64 AND length(${t.endReferenceSha256})=64 AND length(${t.settledReferenceSha256})=64 AND (${t.executionSha256} IS NULL OR length(${t.executionSha256})=64) AND (${t.tokenSha256} IS NULL OR length(${t.tokenSha256})=64)`),check('article_purge_end_evidence',sql`${t.holderMode} IN ('mapped_executor','manual_help') AND ${t.evidenceKind} IN ('holder_acknowledgement','owner_observed_codex_terminal') AND (${t.evidenceKind}='holder_acknowledgement' OR ${t.holderMode}='manual_help') AND ${t.allActionsStopped}=1 AND ${t.allActionsSettled}=1 AND ${t.serverVerified}=0`)]);
// Owner-observed Codex terminal receipts are distinct from holder acknowledgements.
// Only identities and one-way evidence hashes survive; database guards bind the
// original manual-help receipt, frozen purge snapshot and permanent source fence.
export const articlePurgeExecutorObservations=sqliteTable('article_purge_executor_observations',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),articleId:text('article_id').notNull(),operationId:text('operation_id').notNull(),snapshotSha256:text('snapshot_sha256').notNull(),purgeSnapshotSha256:text('purge_snapshot_sha256').notNull(),payloadSha256:text('payload_sha256').notNull(),claimSha256:text('claim_sha256').notNull(),inputSha256:text('input_sha256').notNull(),acquisitionRequestKey:text('acquisition_request_key').notNull(),originalReceiptSha256:text('original_receipt_sha256').notNull(),observedExecutionSha256:text('observed_execution_sha256').notNull(),threadSha256:text('thread_sha256').notNull(),turnSha256:text('turn_sha256').notNull(),mappingReferenceSha256:text('mapping_reference_sha256').notNull(),endReferenceSha256:text('end_reference_sha256').notNull(),settledReferenceSha256:text('settled_reference_sha256').notNull(),acquiredAt:text('acquired_at').notNull(),endedAt:text('ended_at').notNull(),observedAt:text('observed_at').notNull(),terminalState:text('terminal_state').notNull(),evidenceSource:text('evidence_source').notNull(),allActionsStopped:integer('all_actions_stopped').notNull(),allActionsSettled:integer('all_actions_settled').notNull(),serverVerified:integer('server_verified').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),index('article_purge_executor_observations_article').on(t.owner,t.articleId,t.operationId),check('article_purge_observation_hashes',sql`length(${t.snapshotSha256})=64 AND ${t.snapshotSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.purgeSnapshotSha256})=64 AND ${t.purgeSnapshotSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.payloadSha256})=64 AND ${t.payloadSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.claimSha256})=64 AND ${t.claimSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.inputSha256})=64 AND ${t.inputSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.originalReceiptSha256})=64 AND ${t.originalReceiptSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.observedExecutionSha256})=64 AND ${t.observedExecutionSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.threadSha256})=64 AND ${t.threadSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.turnSha256})=64 AND ${t.turnSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.mappingReferenceSha256})=64 AND ${t.mappingReferenceSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.endReferenceSha256})=64 AND ${t.endReferenceSha256} NOT GLOB '*[^a-f0-9]*' AND length(${t.settledReferenceSha256})=64 AND ${t.settledReferenceSha256} NOT GLOB '*[^a-f0-9]*'`),check('article_purge_observation_evidence',sql`${t.terminalState} IN ('completed','failed','cancelled') AND ${t.evidenceSource}='codex_app_tools' AND ${t.allActionsStopped}=1 AND ${t.allActionsSettled}=1 AND ${t.serverVerified}=0`),check('article_purge_observation_chronology',sql`julianday(${t.acquiredAt}) IS NOT NULL AND julianday(${t.endedAt}) IS NOT NULL AND julianday(${t.observedAt}) IS NOT NULL AND julianday(${t.created}) IS NOT NULL AND julianday(${t.endedAt})>=julianday(${t.acquiredAt}) AND julianday(${t.observedAt})>=julianday(${t.endedAt}) AND julianday(${t.created})>=julianday(${t.observedAt})`)]);
// Serial execution ownership is independent of expiring Word write leases.
// Mutable attempt state has immutable stop/settle/restart request receipts.
export const wordSerialSlots=sqliteTable('word_serial_slots',{
 owner:text('owner').primaryKey(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),inputSha256:text('input_sha256').notNull(),attemptId:text('attempt_id').notNull(),claimHash:text('claim_hash').notNull(),executionId:text('execution_id').notNull(),grantRequestKey:text('grant_request_key').notNull(),tokenHash:text('token_hash').notNull(),epoch:integer('epoch').notNull(),state:text('state').notNull(),version:integer('version').notNull(),heldAt:text('held_at').notNull(),updated:text('updated').notNull()
},t=>[check('word_serial_target',sql`${t.targetKind} IN ('article','local_word')`),check('word_serial_state',sql`${t.state} IN ('held','waiting_safe_stop')`),check('word_serial_hashes',sql`length(${t.inputSha256})=64 AND length(${t.claimHash})=64 AND length(${t.tokenHash})=64`),check('word_serial_versions',sql`${t.epoch}>0 AND ${t.version}>0`)]);
export const wordAttempts=sqliteTable('word_attempts',{
 owner:text('owner').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),attemptId:text('attempt_id').notNull(),generation:integer('generation').notNull(),inputSha256:text('input_sha256').notNull(),creationRequestKey:text('creation_request_key').notNull(),previousAttemptId:text('previous_attempt_id'),strategySha256:text('strategy_sha256').notNull(),strategyReference:text('strategy_reference').notNull(),state:text('state').notNull(),startedAt:text('started_at'),activeElapsedMs:integer('active_elapsed_ms').notNull().default(0),activeStartedAt:text('active_started_at'),stopRequestedAt:text('stop_requested_at'),endedAt:text('ended_at'),reason:text('reason').notNull(),initialManifestJson:text('initial_manifest_json'),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[primaryKey({columns:[t.owner,t.targetKind,t.targetId,t.attemptId]}),uniqueIndex('word_attempt_generation').on(t.owner,t.targetKind,t.targetId,t.generation),uniqueIndex('word_attempt_creation_request').on(t.owner,t.creationRequestKey),check('word_attempt_target',sql`${t.targetKind} IN ('article','local_word')`),check('word_attempt_generation_limit',sql`${t.generation} BETWEEN 1 AND 3`),check('word_attempt_timer',sql`${t.activeElapsedMs}>=0`),check('word_attempt_hashes',sql`length(${t.inputSha256})=64 AND length(${t.strategySha256})=64`),check('word_attempt_state',sql`${t.state} IN ('queued','running','stop_requested','waiting_safe_stop','paused_safe','ended','saved','blocked')`)]);
export const wordAttemptRequests=sqliteTable('word_attempt_requests',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),attemptId:text('attempt_id').notNull(),operation:text('operation').notNull(),payloadSha256:text('payload_sha256').notNull(),receiptJson:text('receipt_json').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),check('word_attempt_request_target',sql`${t.targetKind} IN ('article','local_word')`),check('word_attempt_request_operation',sql`${t.operation} IN ('stop','settle','restart')`),check('word_attempt_request_hash',sql`length(${t.payloadSha256})=64`),check('word_attempt_request_json',sql`json_valid(${t.receiptJson})`)]);
// Only a real never-claimed queued -> processing CAS may create this proof.
// Existing processing tasks are never backfilled from an intent/queue/timeout.
export const wordClaimOrigins=sqliteTable('word_claim_origins',{
 owner:text('owner').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),claimHash:text('claim_hash').notNull(),origin:text('origin').notNull(),proofReference:text('proof_reference').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.targetKind,t.targetId,t.claimHash]}),check('word_claim_origin_target',sql`${t.targetKind} IN ('article','local_word')`),check('word_claim_origin_hash',sql`length(${t.claimHash})=64`),check('word_claim_origin_kind',sql`${t.origin}='fresh_claim'`)]);
// Immutable manual Word executor-end acknowledgements and same-article recovery receipts.
// Credentials and manuscript bytes remain outside both audits.
export const articleWordExecutorEnds=sqliteTable('article_word_executor_ends',{
 owner:text('owner').notNull(),articleId:text('article_id').notNull(),requestKey:text('request_key').notNull(),
 inputSha256:text('input_sha256').notNull(),claimHash:text('claim_hash').notNull(),executionId:text('execution_id').notNull(),
 epoch:integer('epoch'),tokenHash:text('token_hash'),leaseFingerprint:text('lease_fingerprint').notNull(),
 proofJson:text('proof_json').notNull(),payloadSha256:text('payload_sha256').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),uniqueIndex('article_word_end_original_executor').on(t.owner,t.articleId,t.claimHash,t.executionId),
 check('article_word_end_hashes',sql`length(${t.inputSha256})=64 AND length(${t.claimHash})=64 AND length(${t.leaseFingerprint})=64 AND length(${t.payloadSha256})=64 AND (${t.tokenHash} IS NULL OR length(${t.tokenHash})=64)`),
 check('article_word_end_proof',sql`json_valid(${t.proofJson})`)]);
export const articleWordClaimRecoveries=sqliteTable('article_word_claim_recoveries',{
 owner:text('owner').notNull(),articleId:text('article_id').notNull(),requestKey:text('request_key').notNull(),
 inputSha256:text('input_sha256').notNull(),oldClaimHash:text('old_claim_hash').notNull(),nextClaimHash:text('next_claim_hash').notNull(),
 expectedFingerprint:text('expected_fingerprint').notNull(),terminationJson:text('termination_json').notNull(),
 confirmationReference:text('confirmation_reference').notNull(),payloadSha256:text('payload_sha256').notNull(),
 controlVersion:integer('control_version').notNull(),controlEpoch:integer('control_epoch').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),uniqueIndex('article_word_recovery_old_claim').on(t.owner,t.oldClaimHash),
 uniqueIndex('article_word_recovery_next_claim').on(t.owner,t.nextClaimHash),
 check('article_word_recovery_hashes',sql`length(${t.inputSha256})=64 AND length(${t.oldClaimHash})=64 AND length(${t.nextClaimHash})=64 AND length(${t.expectedFingerprint})=64 AND length(${t.payloadSha256})=64 AND ${t.oldClaimHash}<>${t.nextClaimHash}`),
 check('article_word_recovery_proof',sql`json_valid(${t.terminationJson})`),
 check('article_word_recovery_version',sql`${t.controlVersion}>=0 AND ${t.controlEpoch}>=0`)]);
export const dedaoNativeSessions=sqliteTable('dedao_native_sessions',{
 owner:text('owner').notNull(),executorId:text('executor_id').notNull(),threadId:text('thread_id').notNull(),sessionId:text('session_id').notNull(),turnId:text('turn_id'),state:text('state').notNull().default('pending'),credentialHash:text('credential_hash').notNull(),credentialExpires:text('credential_expires').notNull(),hooksReady:integer('hooks_ready').notNull().default(0),wakeReady:integer('wake_ready').notNull().default(0),wakeId:text('wake_id'),hooksConfigSha256:text('hooks_config_sha256'),lifecycleSource:text('lifecycle_source'),observationRef:text('observation_ref'),lastObservedAt:text('last_observed_at').notNull(),updated:text('updated').notNull()
},t=>[primaryKey({columns:[t.owner,t.executorId]}),uniqueIndex('dedao_native_credential').on(t.credentialHash),check('dedao_native_state',sql`${t.state} IN ('pending','active','idle','interrupted','ended')`)]);
export const dedaoBatchRuntime=sqliteTable('dedao_batch_runtime',{
 batchId:text('batch_id').primaryKey(),owner:text('owner').notNull(),runtime:text('runtime').notNull(),dispatchMode:text('dispatch_mode').notNull().default('fixed'),threadId:text('thread_id'),sessionId:text('session_id'),claimedTurnId:text('claimed_turn_id'),safeBoundary:integer('safe_boundary').notNull().default(1),boundaryReason:text('boundary_reason'),updated:text('updated').notNull()
},t=>[check('dedao_batch_runtime_kind',sql`${t.runtime} IN ('native_codex','cli_cdp')`),check('dedao_batch_dispatch_mode',sql`${t.dispatchMode} IN ('fixed','dynamic')`),check('dedao_batch_native_identity',sql`${t.runtime}='cli_cdp' OR (${t.threadId} IS NOT NULL AND ${t.sessionId} IS NOT NULL)`)]);
// IDs and actual tool references only; never native credentials or manuscript bytes.
export const dedaoWakeOutbox=sqliteTable('dedao_wake_outbox',{
 owner:text('owner').notNull(),batchId:text('batch_id').notNull(),queueRevision:text('queue_revision').notNull(),eventId:text('event_id').notNull(),state:text('state').notNull(),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[primaryKey({columns:[t.owner,t.batchId,t.queueRevision]}),uniqueIndex('dedao_wake_event').on(t.eventId),check('dedao_wake_state',sql`${t.state} IN ('pending','sending','accepted','unknown')`)]);
export const dedaoDispatches=sqliteTable('dedao_dispatches',{
 owner:text('owner').notNull(),batchId:text('batch_id').notNull(),queueRevision:text('queue_revision').notNull(),dispatchKey:text('dispatch_key').notNull(),dispatcherId:text('dispatcher_id').notNull(),targetEnvironment:text('target_environment').notNull(),selectionSha256:text('selection_sha256').notNull(),selectionRef:text('selection_ref').notNull(),state:text('state').notNull(),threadId:text('thread_id'),sessionId:text('session_id'),turnId:text('turn_id'),previousThreadId:text('previous_thread_id'),previousSessionId:text('previous_session_id'),previousTurnId:text('previous_turn_id'),creationJson:text('creation_json'),unknownJson:text('unknown_json'),stopJson:text('stop_json'),notCreatedJson:text('not_created_json'),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[primaryKey({columns:[t.owner,t.batchId,t.queueRevision]}),uniqueIndex('dedao_dispatch_key').on(t.owner,t.dispatchKey),check('dedao_dispatch_state',sql`${t.state} IN ('reserved','unknown','created','not_created','stopped')`),check('dedao_dispatch_identity',sql`${t.state} NOT IN ('created','stopped') OR (${t.threadId} IS NOT NULL AND ${t.sessionId} IS NOT NULL AND ${t.turnId} IS NOT NULL AND ${t.creationJson} IS NOT NULL)`)]);
export const dedaoNativeLifecycle=sqliteTable('dedao_native_lifecycle',{
 owner:text('owner').notNull(),eventId:text('event_id').notNull(),executorId:text('executor_id').notNull(),sessionId:text('session_id').notNull(),turnId:text('turn_id').notNull(),event:text('event').notNull(),payloadSha256:text('payload_sha256').notNull(),observedAt:text('observed_at').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.eventId]}),check('dedao_lifecycle_event',sql`${t.event} IN ('Stop','Interrupt','SessionEnd','UserPromptSubmit')`)]);
export const dedaoNativeObservations=sqliteTable('dedao_native_observations',{
 owner:text('owner').notNull(),eventId:text('event_id').notNull(),executorId:text('executor_id').notNull(),sessionId:text('session_id').notNull(),turnId:text('turn_id').notNull(),state:text('state').notNull(),payloadSha256:text('payload_sha256').notNull(),observationRef:text('observation_ref').notNull(),observedAt:text('observed_at').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.eventId]}),check('dedao_native_observation_state',sql`${t.state} IN ('active','completed','interrupted','idle','ended')`)]);
export const dedaoExecutors=sqliteTable('dedao_executors',{
 owner:text('owner').notNull(),id:text('id').notNull(),browserSession:text('browser_session').notNull(),capabilitiesJson:text('capabilities_json').notNull(),heartbeat:text('heartbeat').notNull(),ready:integer('ready').notNull()
},t=>[primaryKey({columns:[t.owner,t.id]})]);
export const dedaoBatches=sqliteTable('dedao_batches',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),requestKey:text('request_key').notNull(),queueRevision:text('queue_revision'),total:integer('total').notNull(),state:text('state').notNull(),currentOrdinal:integer('current_ordinal').notNull().default(1),created:text('created').notNull(),updated:text('updated').notNull(),started:text('started'),finished:text('finished'),executorId:text('executor_id'),executionId:text('execution_id'),claimHash:text('claim_hash'),leaseUntil:text('lease_until'),heartbeat:text('heartbeat'),executorEnded:integer('executor_ended').notNull().default(1),failure:text('failure'),dispatchState:text('dispatch_state').notNull().default('pending')
},t=>[uniqueIndex('dedao_owner_request').on(t.owner,t.requestKey),uniqueIndex('dedao_one_active_batch').on(t.owner).where(sql`${t.state} != 'completed'`),check('dedao_positive_total',sql`typeof(${t.total})='integer' AND ${t.total}>0`)]);
export const dedaoItems=sqliteTable('dedao_items',{
 batchId:text('batch_id').notNull(),owner:text('owner').notNull(),ordinal:integer('ordinal').notNull(),id:text('id').notNull(),title:text('title'),stage:integer('stage').notNull().default(0),version:integer('version').notNull().default(0),finalRef:text('final_ref'),downloadJson:text('download_json'),articleId:text('article_id'),uploadState:text('upload_state'),submittedHandoffId:text('submitted_handoff_id'),submitted:text('submitted'),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[primaryKey({columns:[t.batchId,t.ordinal]}),uniqueIndex('dedao_item_identity').on(t.id),uniqueIndex('dedao_item_article').on(t.articleId)]);
export const dedaoActions=sqliteTable('dedao_actions',{
 batchId:text('batch_id').notNull(),ordinal:integer('ordinal').notNull(),action:text('action').notNull(),actionId:text('action_id').notNull(),state:text('state').notNull(),observationJson:text('observation_json'),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[primaryKey({columns:[t.batchId,t.ordinal,t.action]}),uniqueIndex('dedao_action_identity').on(t.actionId)]);
export const dedaoChunks=sqliteTable('dedao_chunks',{
 batchId:text('batch_id').notNull(),ordinal:integer('ordinal').notNull(),offset:integer('offset').notNull(),size:integer('size').notNull(),sha256:text('sha256').notNull(),objectKey:text('object_key').notNull()
},t=>[primaryKey({columns:[t.batchId,t.ordinal,t.offset]})]);
// Append-only observations; no business job, claim, input, output or permission mutation.
export const wordProgressEvents=sqliteTable('word_progress_events',{
 attemptId:text('attempt_id'),
 owner:text('owner').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),version:integer('version').notNull(),eventId:text('event_id').notNull(),inputSha256:text('input_sha256').notNull(),payloadSha256:text('payload_sha256').notNull(),snapshotJson:text('snapshot_json').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.targetKind,t.targetId,t.version]}),uniqueIndex('word_progress_event_identity').on(t.owner,t.targetKind,t.targetId,t.eventId),check('word_progress_target',sql`${t.targetKind} IN ('article','local_word')`),check('word_progress_version',sql`typeof(${t.version})='integer' AND ${t.version}>0`),check('word_progress_hashes',sql`length(${t.inputSha256})=64 AND length(${t.payloadSha256})=64`)]);
// One immutable owner/execution-bound local Word acquisition, including empty.
export const localWordQueueClaims=sqliteTable('local_word_queue_claims',{
 owner:text('owner').notNull(),claimRequestKey:text('claim_request_key').notNull(),executionId:text('execution_id').notNull(),jobId:text('job_id'),inputSha256:text('input_sha256'),claimHash:text('claim_hash'),grantCiphertext:text('grant_ciphertext'),expires:text('expires'),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.claimRequestKey]}),uniqueIndex('local_word_queue_owner_job').on(t.owner,t.jobId),check('local_word_queue_identity',sql`(${t.jobId} IS NULL AND ${t.inputSha256} IS NULL AND ${t.claimHash} IS NULL AND ${t.grantCiphertext} IS NULL AND ${t.expires} IS NULL) OR (${t.jobId} IS NOT NULL AND substr(${t.jobId},1,10)='localword_' AND ${t.inputSha256} IS NOT NULL AND length(${t.inputSha256})=64 AND ${t.claimHash} IS NOT NULL AND length(${t.claimHash})=64 AND ${t.grantCiphertext} IS NOT NULL AND ${t.expires} IS NOT NULL)`)]);
export const localWordJobs=sqliteTable('local_word_jobs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),requestKey:text('request_key').notNull(),
 sourceKind:text('source_kind').notNull(),outputMode:text('output_mode').notNull(),destinationsJson:text('destinations_json').notNull(),
 filename:text('filename').notNull(),title:text('title').notNull(),leadingBlankParagraphs:integer('leading_blank_paragraphs').notNull().default(0),sourceSha256:text('source_sha256').notNull(),originalSha256:text('original_sha256').notNull(),
 inputSha256:text('input_sha256').notNull(),inputJson:text('input_json').notNull(),artifactManifest:text('artifact_manifest').notNull(),
 state:text('state').notNull(),created:text('created').notNull(),updated:text('updated').notNull(),
 claimHash:text('claim_hash'),claimExpires:text('claim_expires'),outputMeta:text('output_meta'),resultKey:text('result_key'),error:text('error'),
 dispatchState:text('dispatch_state').notNull(),dispatchUntil:text('dispatch_until'),dispatchLease:text('dispatch_lease'),dispatchAttempts:integer('dispatch_attempts').notNull().default(0)
},t=>[uniqueIndex('local_word_jobs_owner_request').on(t.owner,t.requestKey),index('local_word_jobs_owner_state').on(t.owner,t.state,t.created),
 check('local_word_jobs_scope',sql`${t.sourceKind}='local_desktop' AND ${t.outputMode}='word_only' AND ${t.destinationsJson}='[]' AND substr(${t.id},1,10)='localword_'`),
 check('local_word_jobs_state',sql`${t.state} IN ('queued','processing','word_completed','failed')`),check('local_word_jobs_dispatch',sql`${t.dispatchState} IN ('pending','sending','accepted','unknown')`),check('local_word_jobs_leading_blanks',sql`typeof(${t.leadingBlankParagraphs})='integer' AND ${t.leadingBlankParagraphs} BETWEEN 0 AND 4998`)]);
export const articleHelpQueueClaims=sqliteTable('article_help_queue_claims',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),articleId:text('article_id'),handoffId:text('handoff_id'),eventId:text('event_id'),claimHash:text('claim_hash'),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),uniqueIndex('article_help_queue_article').on(t.owner,t.articleId),check('article_help_queue_identity',sql`(${t.articleId} IS NULL AND ${t.handoffId} IS NULL AND ${t.eventId} IS NULL AND ${t.claimHash} IS NULL) OR (${t.articleId} IS NOT NULL AND ${t.handoffId} IS NOT NULL AND ${t.eventId} IS NOT NULL AND ${t.claimHash} IS NOT NULL AND length(${t.claimHash})=64)`)]);
export const articleHandoffs=sqliteTable('article_handoffs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),articleId:text('article_id').notNull(),eventId:text('event_id').notNull(),state:text('state').notNull(),created:text('created').notNull(),updated:text('updated').notNull(),expires:text('expires').notNull()
},t=>[uniqueIndex('article_handoffs_event').on(t.eventId),uniqueIndex('article_handoffs_sending').on(t.owner,t.articleId).where(sql`${t.state} = 'sending'`),index('article_handoffs_article').on(t.owner,t.articleId,t.created),check('article_handoffs_state',sql`${t.state} IN ('sending','delivered','unknown')`)]);
export const articleOutputRestarts=sqliteTable('article_output_restarts',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),articleId:text('article_id').notNull(),previousOutputId:text('previous_output_id').notNull(),previousMeta:text('previous_meta').notNull(),newOutputId:text('new_output_id').notNull(),reason:text('reason').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('article_output_restarts_previous').on(t.owner,t.articleId,t.previousOutputId)]);
export const articleUploadDiagnostics=sqliteTable('article_upload_diagnostics',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),articleId:text('article_id').notNull(),platform:text('platform').notNull(),executorId:text('executor_id').notNull(),attemptId:text('attempt_id'),stage:text('stage').notNull(),outcome:text('outcome').notNull(),cause:text('cause').notNull(),observedAt:text('observed_at').notNull(),created:text('created').notNull()
},t=>[index('article_upload_diagnostics_article').on(t.owner,t.articleId,t.observedAt),check('article_upload_diagnostic_platform',sql`${t.platform} IN ('toutiao','zhihu')`),check('article_upload_diagnostic_stage',sql`${t.stage} IN ('file_handoff','chooser_wait','file_submission','platform_import','draft_readback')`),check('article_upload_diagnostic_outcome',sql`${t.outcome} IN ('started','returned','failed')`),check('article_upload_diagnostic_cause',sql`${t.cause} IN ('none','timeout','tool_unavailable','permission_denied','browser_disconnected','platform_rejected','unknown')`),check('article_upload_diagnostic_failure',sql`(${t.outcome}='failed' AND ${t.cause}<>'none') OR (${t.outcome}<>'failed' AND ${t.cause}='none')`),check('article_upload_diagnostic_rejection',sql`${t.cause}<>'platform_rejected' OR ${t.stage}='platform_import'`)]);
export const tests = sqliteTable('connection_tests', {id:text('id').primaryKey(),owner:text('owner').notNull(),created:text('created').notNull(),state:text('state').notNull()},t=>[index('tests_owner_created').on(t.owner,t.created)]);
export const subscriptions = sqliteTable('event_subscriptions', {id:text('id').primaryKey(),owner:text('owner').notNull(),eventName:text('event_name').notNull().default('test.created'),callback:text('callback').notNull(),secret:text('secret'),previousSecret:text('previous_secret'),previousUntil:text('previous_until'),expires:text('expires').notNull(),active:text('active').notNull(),generation:text('generation').notNull()},t=>[index('subscriptions_owner').on(t.owner)]);
export const articles = sqliteTable('articles', {id:text('id').primaryKey(),owner:text('owner').notNull(),title:text('title').notNull(),filename:text('filename').notNull(),sourceKey:text('source_key').notNull(),paragraphs:text('paragraphs').notNull(),created:text('created').notNull(),state:text('state').notNull(),error:text('error'),claimToken:text('claim_token'),claimExpires:text('claim_expires'),wordClaimOriginHash:text('word_claim_origin_hash'),resultKey:text('result_key'),resultMeta:text('result_meta'),draftUrl:text('draft_url'),artifactManifest:text('artifact_manifest'),draftReadback:text('draft_readback'),uploadGuardVersion:integer('upload_guard_version').notNull().default(0)},t=>[index('articles_owner_created').on(t.owner,t.created)]);
export const deliveries = sqliteTable('article_deliveries', {id:text('id').primaryKey(),owner:text('owner').notNull(),articleId:text('article_id').notNull(),platform:text('platform').notNull(),state:text('state').notNull(),claimToken:text('claim_token'),claimExpires:text('claim_expires'),draftUrl:text('draft_url'),message:text('message'),readback:text('readback'),updated:text('updated').notNull()},t=>[index('deliveries_owner_article').on(t.owner,t.articleId)]);

export const writingRuns = sqliteTable('writing_runs', {id:text('id').primaryKey(),owner:text('owner').notNull(),day:text('day').notNull(),writer:text('writer').notNull().default('xiaoyu'),runKind:text('run_kind').notNull().default('daily'),styleVersion:text('style_version'),state:text('state').notNull(),token:text('token'),expires:text('expires'),articleId:text('article_id').notNull(),topic:text('topic'),sources:text('sources'),bodyHash:text('body_hash'),inputSnapshot:text('input_snapshot'),error:text('error'),created:text('created').notNull(),updated:text('updated').notNull()},t=>[uniqueIndex('writing_owner_day_writer_kind').on(t.owner,t.day,t.writer,t.runKind)]);

export const claudeSettings = sqliteTable('claude_settings',{owner:text('owner').primaryKey(),model:text('model').notNull(),secret:text('secret').notNull(),enabled:text('enabled').notNull(),updated:text('updated').notNull()});
export const claudeAttempts=sqliteTable('claude_attempts',{id:text('id').primaryKey(),owner:text('owner').notNull(),day:text('day').notNull(),state:text('state').notNull(),response:text('response'),created:text('created').notNull()});

// One server-authorized manual pair, isolated from all date-based writing quotas.
export const manualWritingBatches = sqliteTable('manual_writing_batches', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),authorizationKey:text('authorization_key').notNull(),
 day:text('day').notNull(),inputHash:text('input_hash').notNull(),snapshot:text('snapshot').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('manual_owner_authorization').on(t.owner,t.authorizationKey)]);

// Minimal, content-free fence retained after a confirmed permanent article deletion.
export const articleDeletions = sqliteTable('article_deletions', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),state:text('state').notNull(),startedAt:text('started_at').notNull(),deletedAt:text('deleted_at'),objectCount:integer('object_count'),lockToken:text('lock_token'),lockExpires:text('lock_expires'),operationId:text('operation_id')
});

// Only IDs, fingerprints and file identities; never duplicate article bodies here.
export const articleListDeletions = sqliteTable('article_list_deletions', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),scope:text('scope').notNull(),requestKey:text('request_key').notNull(),
 state:text('state').notNull(),snapshotJson:text('snapshot_json').notNull(),snapshotSha256:text('snapshot_sha256').notNull(),
 created:text('created').notNull(),expires:text('expires').notNull(),confirmedAt:text('confirmed_at'),deletedAt:text('deleted_at'),
 lockToken:text('lock_token'),lockExpires:text('lock_expires'),
},t=>[uniqueIndex('article_list_deletions_owner_request').on(t.owner,t.requestKey)]);

export const dailyEditorialDrafts = sqliteTable('daily_editorial_drafts', {
 runId:text('run_id').primaryKey(),owner:text('owner').notNull(),articleId:text('article_id').notNull(),
 writer:text('writer').notNull(),day:text('day').notNull(),inputSnapshot:text('input_snapshot').notNull(),
 initialJson:text('initial_json').notNull(),initialSha256:text('initial_sha256').notNull(),initialSource:text('initial_source').notNull(),
 providerAttemptId:text('provider_attempt_id'),created:text('created').notNull(),finalSha256:text('final_sha256'),revisionFlowId:text('revision_flow_id'),verifiedAt:text('verified_at')
},t=>[uniqueIndex('daily_editorial_owner_article').on(t.owner,t.articleId)]);

export const outlineFlows = sqliteTable('outline_flows',{
 parentRunId:text('parent_run_id').references(():AnySQLiteColumn=>outlineFlows.id),
 id:text('id').primaryKey(),owner:text('owner').notNull(),authorizationKey:text('authorization_key').notNull(),snapshot:text('snapshot').notNull(),snapshotSha256:text('snapshot_sha256').notNull(),state:text('state').notNull(),outlineJson:text('outline_json'),outlineSha256:text('outline_sha256'),reviewJson:text('review_json'),writingInput:text('writing_input'),articleId:text('article_id').notNull(),expires:text('expires').notNull(),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('outline_owner_authorization').on(t.owner,t.authorizationKey),uniqueIndex('outline_owner_parent_revision').on(t.owner,t.parentRunId)]);
export const outlineFlowStages = sqliteTable('outline_flow_stages',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),stage:text('stage').notNull(),token:text('token').notNull(),expires:text('expires').notNull(),inputJson:text('input_json').notNull(),inputSha256:text('input_sha256').notNull(),state:text('state').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('outline_owner_run_stage').on(t.owner,t.runId,t.stage)]);

// Owner-only independent topic research. No article/run quota or provider side effects.
export const topicResearchHeads = sqliteTable('topic_research_heads', {
 owner:text('owner').primaryKey(),generation:integer('generation').notNull().default(0),currentId:text('current_id')
});
export const topicResearchRuns = sqliteTable('topic_research_runs', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),requestKey:text('request_key').notNull(),generation:integer('generation').notNull(),state:text('state').notNull(),
 inputHash:text('input_hash').notNull(),inputJson:text('input_json').notNull(),resultJson:text('result_json'),resultHash:text('result_hash'),claimHash:text('claim_hash'),claimExpires:text('claim_expires'),
 created:text('created').notNull(),updated:text('updated').notNull(),error:text('error'),dispatchState:text('dispatch_state').notNull()
},t=>[uniqueIndex('topic_research_owner_request').on(t.owner,t.requestKey),uniqueIndex('topic_research_owner_generation').on(t.owner,t.generation)]);
export const topicResearchOutbox = sqliteTable('topic_research_outbox', {
 researchId:text('research_id').primaryKey(),owner:text('owner').notNull(),eventId:text('event_id').notNull(),state:text('state').notNull(),attempts:integer('attempts').notNull().default(0),
 leaseToken:text('lease_token'),leaseUntil:text('lease_until'),nextAttempt:text('next_attempt'),created:text('created').notNull()
});

// Reversible visibility/execution fences. Historical states and provider receipts stay unchanged.
export const workflowControls = sqliteTable('workflow_controls', {
 owner:text('owner').notNull(),scope:text('scope').notNull(),runId:text('run_id').notNull(),state:text('state').notNull(),reason:text('reason').notNull(),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('workflow_controls_owner_scope_run').on(t.owner,t.scope,t.runId)]);

// Contract v2 is opt-in and never reinterprets legacy snapshots or quotas.
export const editorialFlows = sqliteTable('editorial_flows', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),authorizationKey:text('authorization_key').notNull(),articleId:text('article_id').notNull(),snapshot:text('snapshot').notNull(),snapshotSha256:text('snapshot_sha256').notNull(),state:text('state').notNull(),finalSha256:text('final_sha256'),expires:text('expires').notNull(),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('editorial_owner_authorization').on(t.owner,t.authorizationKey)]);
export const editorialStages = sqliteTable('editorial_stages', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),stage:text('stage').notNull(),token:text('token').notNull(),inputJson:text('input_json').notNull(),inputSha256:text('input_sha256').notNull(),state:text('state').notNull(),artifactJson:text('artifact_json'),artifactSha256:text('artifact_sha256'),actorId:text('actor_id'),executionId:text('execution_id'),model:text('model'),provenance:text('provenance'),receiptId:text('receipt_id'),error:text('error'),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('editorial_owner_run_stage').on(t.owner,t.runId,t.stage)]);

// A bounded user start wakes the assistant through a separate event, never a schedule.
export const editorialRequests = sqliteTable('editorial_requests', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),requestKey:text('request_key').notNull(),inputJson:text('input_json').notNull(),inputSha256:text('input_sha256').notNull(),state:text('state').notNull(),claimHash:text('claim_hash'),claimExpires:text('claim_expires'),flowId:text('flow_id'),progressJson:text('progress_json').notNull(),dispatchState:text('dispatch_state').notNull(),error:text('error'),expires:text('expires').notNull(),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('editorial_requests_owner_key').on(t.owner,t.requestKey),uniqueIndex('editorial_requests_owner_flow').on(t.owner,t.flowId)]);
export const editorialRequestOutbox = sqliteTable('editorial_request_outbox', {
 requestId:text('request_id').primaryKey(),owner:text('owner').notNull(),eventId:text('event_id').notNull(),state:text('state').notNull(),attempts:integer('attempts').notNull().default(0),leaseToken:text('lease_token'),leaseUntil:text('lease_until'),nextAttempt:text('next_attempt'),created:text('created').notNull()
});
export {articleUploadAttempts,articleUploadExecutorEnds,articleClaimCredentialHashes} from "./article-upload-schema";

// V3 recurring authority and dynamic-round runs are isolated from all legacy grants and quotas.
export const editorialAuthorityV3 = sqliteTable('editorial_authority_v3', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),authorizationKey:text('authorization_key').notNull(),scope:text('scope').notNull(),state:text('state').notNull(),
 startDay:text('start_day').notNull(),evidenceJson:text('evidence_json').notNull(),evidenceSha256:text('evidence_sha256').notNull(),
 frozenBindingsJson:text('frozen_bindings_json').notNull(),frozenBindingsSha256:text('frozen_bindings_sha256').notNull(),policyJson:text('policy_json').notNull(),
 created:text('created').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('editorial_authority_v3_owner_key').on(t.owner,t.authorizationKey)]);
export const editorialRunsV3 = sqliteTable('editorial_runs_v3', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),authorityId:text('authority_id').notNull(),requestKey:text('request_key').notNull(),
 runKind:text('run_kind').notNull(),day:text('day').notNull(),writer:text('writer').notNull(),testIntentKey:text('test_intent_key'),
 inputJson:text('input_json').notNull(),inputSha256:text('input_sha256').notNull(),snapshotJson:text('snapshot_json').notNull(),snapshotSha256:text('snapshot_sha256').notNull(),
 state:text('state').notNull(),round:integer('round').notNull().default(0),initialized:integer('initialized').notNull().default(0),
 articleId:text('article_id').notNull(),finalSha256:text('final_sha256'),error:text('error'),expires:text('expires').notNull(),created:text('created').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('editorial_runs_v3_owner_request').on(t.owner,t.requestKey),
 uniqueIndex('editorial_runs_v3_daily_slot').on(t.owner,t.day,t.writer).where(sql`run_kind = 'daily'`),
 uniqueIndex('editorial_runs_v3_test_intent').on(t.owner,t.testIntentKey).where(sql`run_kind = 'workflow_test'`)]);
export const editorialStagesV3 = sqliteTable('editorial_stages_v3', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),stage:text('stage').notNull(),round:integer('round').notNull(),sequence:integer('sequence').notNull(),
 token:text('token').notNull(),inputJson:text('input_json').notNull(),inputSha256:text('input_sha256').notNull(),state:text('state').notNull(),
 artifactJson:text('artifact_json'),artifactSha256:text('artifact_sha256'),actorId:text('actor_id'),executionId:text('execution_id'),model:text('model'),provenance:text('provenance'),receiptId:text('receipt_id'),error:text('error'),
 created:text('created').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('editorial_stages_v3_owner_stage_round').on(t.owner,t.runId,t.stage,t.round),uniqueIndex('editorial_stages_v3_owner_sequence').on(t.owner,t.runId,t.sequence)]);

// Explicit one-attempt body continuation, isolated from recurring editorial authority.
export const editorialBodyContinuationsV3 = sqliteTable('editorial_body_continuations_v3', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),authorizationKey:text('authorization_key').notNull(),runId:text('run_id').notNull(),failedStageId:text('failed_stage_id').notNull(),scope:text('scope').notNull(),state:text('state').notNull(),
 requestJson:text('request_json').notNull(),requestSha256:text('request_sha256').notNull(),evidenceJson:text('evidence_json').notNull(),evidenceSha256:text('evidence_sha256').notNull(),frozenJson:text('frozen_json').notNull(),frozenSha256:text('frozen_sha256').notNull(),
 oldReceiptId:text('old_receipt_id').notNull(),oldReceiptSha256:text('old_receipt_sha256').notNull(),newStageId:text('new_stage_id').notNull(),newInputSha256:text('new_input_sha256').notNull(),newTokenSha256:text('new_token_sha256').notNull(),expires:text('expires').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('editorial_body_continuations_v3_owner_failed').on(t.owner,t.failedStageId),uniqueIndex('editorial_body_continuations_v3_owner_key').on(t.owner,t.authorizationKey),uniqueIndex('editorial_body_continuations_v3_owner_new_stage').on(t.owner,t.newStageId),uniqueIndex('editorial_body_continuations_v3_owner_token_sha').on(t.owner,t.newTokenSha256)]);

// Short-lived explicit cloud transport permission for only one continuation body.
export const editorialCloudDelegationsV3 = sqliteTable('editorial_cloud_delegations_v3', {
 stageId:text('stage_id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),continuationId:text('continuation_id').notNull(),transport:text('transport').notNull(),tokenSha256:text('token_sha256').notNull(),frozenJson:text('frozen_json').notNull(),frozenSha256:text('frozen_sha256').notNull(),expires:text('expires').notNull(),state:text('state').notNull(),created:text('created').notNull(),started:text('started')
},t=>[uniqueIndex('editorial_cloud_delegations_v3_token').on(t.tokenSha256),uniqueIndex('editorial_cloud_delegations_v3_continuation').on(t.owner,t.continuationId),check('editorial_cloud_transport',sql`${t.transport} = 'cloud_http_once'`),check('editorial_cloud_state',sql`${t.state} IN ('delegated','started')`)]);

// One necessary, independently reviewed revision stage on the original acceptance run.
export const editorialRevisionCloudDelegationsV3 = sqliteTable('editorial_revision_cloud_delegations_v3', {
 stageId:text('stage_id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),articleId:text('article_id').notNull(),stageKind:text('stage_kind').notNull(),currentRound:integer('current_round').notNull(),transport:text('transport').notNull(),tokenSha256:text('token_sha256').notNull(),frozenJson:text('frozen_json').notNull(),frozenSha256:text('frozen_sha256').notNull(),expires:text('expires').notNull(),state:text('state').notNull(),created:text('created').notNull(),started:text('started')
},t=>[uniqueIndex('editorial_revision_cloud_delegations_v3_token').on(t.tokenSha256),uniqueIndex('editorial_revision_cloud_delegations_v3_owner_stage_round').on(t.owner,t.runId,t.stageKind,t.currentRound),check('editorial_revision_cloud_run',sql`${t.runId} = 'bd6d4434-273b-426e-a17f-9390fc124c84'`),check('editorial_revision_cloud_kind',sql`${t.stageKind} IN ('structure_revision','fact_revision')`),check('editorial_revision_cloud_round',sql`${t.currentRound} >= 0`),check('editorial_revision_cloud_transport',sql`${t.transport} = 'cloud_http_once'`),check('editorial_revision_cloud_state',sql`${t.state} IN ('delegated','started')`)]);

// Explicitly risk-approved single linked attempt for only the original unknown revision.
export const editorialRevisionContinuationsV3 = sqliteTable('editorial_revision_continuations_v3', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),authorizationKey:text('authorization_key').notNull(),runId:text('run_id').notNull(),sourceStageId:text('source_stage_id').notNull(),scope:text('scope').notNull(),state:text('state').notNull(),requestJson:text('request_json').notNull(),requestSha256:text('request_sha256').notNull(),evidenceJson:text('evidence_json').notNull(),evidenceSha256:text('evidence_sha256').notNull(),frozenJson:text('frozen_json').notNull(),frozenSha256:text('frozen_sha256').notNull(),oldReceiptId:text('old_receipt_id').notNull(),oldReceiptSha256:text('old_receipt_sha256').notNull(),oldDelegationSha256:text('old_delegation_sha256').notNull(),newStageId:text('new_stage_id').notNull(),newInputSha256:text('new_input_sha256').notNull(),newTokenSha256:text('new_token_sha256').notNull(),expires:text('expires').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('editorial_revision_continuations_v3_owner_source').on(t.owner,t.sourceStageId),uniqueIndex('editorial_revision_continuations_v3_owner_key').on(t.owner,t.authorizationKey),uniqueIndex('editorial_revision_continuations_v3_owner_new_stage').on(t.owner,t.newStageId),uniqueIndex('editorial_revision_continuations_v3_token').on(t.newTokenSha256),check('editorial_revision_continuations_v3_run',sql`${t.runId} = 'bd6d4434-273b-426e-a17f-9390fc124c84'`),check('editorial_revision_continuations_v3_source',sql`${t.sourceStageId} = '496c9348-7de3-4322-8462-55892b8162b0'`),check('editorial_revision_continuations_v3_scope',sql`${t.scope} = 'editorial_v3_one_explicit_unknown_revision_continuation'`),check('editorial_revision_continuations_v3_state',sql`${t.state} = 'allocated'`)]);

// Generic owner-explicit, one-per-failed-source writer continuation. No archive/quota/provider action.
export const editorialFailedWriterContinuationsV3 = sqliteTable('editorial_failed_writer_continuations_v3', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),authorizationKey:text('authorization_key').notNull(),runId:text('run_id').notNull(),sourceStageId:text('source_stage_id').notNull(),stageKind:text('stage_kind').notNull(),scope:text('scope').notNull(),state:text('state').notNull(),requestJson:text('request_json').notNull(),requestSha256:text('request_sha256').notNull(),evidenceJson:text('evidence_json').notNull(),evidenceSha256:text('evidence_sha256').notNull(),frozenJson:text('frozen_json').notNull(),frozenSha256:text('frozen_sha256').notNull(),oldReceiptId:text('old_receipt_id').notNull(),oldReceiptSha256:text('old_receipt_sha256').notNull(),oldDelegationSha256:text('old_delegation_sha256'),newStageId:text('new_stage_id').notNull(),newInputSha256:text('new_input_sha256').notNull(),newTokenSha256:text('new_token_sha256').notNull(),expires:text('expires').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('editorial_failed_writer_continuations_v3_owner_source').on(t.owner,t.sourceStageId),uniqueIndex('editorial_failed_writer_continuations_v3_owner_key').on(t.owner,t.authorizationKey),uniqueIndex('editorial_failed_writer_continuations_v3_owner_new_stage').on(t.owner,t.newStageId),uniqueIndex('editorial_failed_writer_continuations_v3_token').on(t.newTokenSha256),check('editorial_failed_writer_continuation_kind',sql`${t.stageKind} IN ('outline','outline_revision','body','structure_revision','fact_revision')`),check('editorial_failed_writer_continuation_scope',sql`${t.scope} = 'editorial_v3_one_explicit_failed_writer_continuation'`),check('editorial_failed_writer_continuation_state',sql`${t.state} = 'allocated'`)]);

// Separate normal-owner cloud HTTP permission, exclusively for the new generic grant's new stage.
export const editorialFailedWriterCloudDelegationsV3 = sqliteTable('editorial_failed_writer_cloud_delegations_v3', {
 stageId:text('stage_id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),continuationId:text('continuation_id').notNull(),stageKind:text('stage_kind').notNull(),currentRound:integer('current_round').notNull(),transport:text('transport').notNull(),tokenSha256:text('token_sha256').notNull(),frozenJson:text('frozen_json').notNull(),frozenSha256:text('frozen_sha256').notNull(),expires:text('expires').notNull(),state:text('state').notNull(),created:text('created').notNull(),started:text('started')
},t=>[uniqueIndex('editorial_failed_writer_cloud_delegations_v3_token').on(t.tokenSha256),uniqueIndex('editorial_failed_writer_cloud_delegations_v3_owner_stage_round').on(t.owner,t.runId,t.stageKind,t.currentRound),uniqueIndex('editorial_failed_writer_cloud_delegations_v3_continuation').on(t.owner,t.continuationId),check('editorial_failed_writer_cloud_kind',sql`${t.stageKind} IN ('outline','outline_revision','body','structure_revision','fact_revision')`),check('editorial_failed_writer_cloud_round',sql`${t.currentRound} >= 0`),check('editorial_failed_writer_cloud_transport',sql`${t.transport} = 'cloud_http_once'`),check('editorial_failed_writer_cloud_state',sql`${t.state} IN ('delegated','started')`)]);

// Owner-confirmed, lifetime-once rotation for the same untouched unpaid agent stage.
// Audit contains one-way credential fingerprints only, never either raw token.
export const editorialAgentClaimRecoveriesV3=sqliteTable('editorial_agent_claim_recoveries_v3',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),stageId:text('stage_id').notNull(),scope:text('scope').notNull(),inputSha256:text('input_sha256').notNull(),snapshotSha256:text('snapshot_sha256').notNull(),authorityId:text('authority_id').notNull(),authorityEvidenceSha256:text('authority_evidence_sha256').notNull(),claimFingerprint:text('claim_fingerprint').notNull(),oldTokenSha256:text('old_token_sha256').notNull(),newTokenSha256:text('new_token_sha256').notNull(),confirmationJson:text('confirmation_json').notNull(),confirmationSha256:text('confirmation_sha256').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('editorial_agent_claim_recoveries_v3_owner_stage').on(t.owner,t.stageId),uniqueIndex('editorial_agent_claim_recoveries_v3_token').on(t.newTokenSha256),check('editorial_agent_claim_recovery_scope',sql`${t.scope} = 'editorial_v3_same_stage_unpaid_agent_claim_recovery'`)]);

// Ordinary current daily writer stages; independent of every historical retry grant.
export const editorialDailyCloudDelegationsV3 = sqliteTable('editorial_daily_cloud_delegations_v3', {
 stageId:text('stage_id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),authorityId:text('authority_id').notNull(),stageKind:text('stage_kind').notNull(),currentRound:integer('current_round').notNull(),transport:text('transport').notNull(),tokenSha256:text('token_sha256').notNull(),frozenJson:text('frozen_json').notNull(),frozenSha256:text('frozen_sha256').notNull(),expires:text('expires').notNull(),state:text('state').notNull(),created:text('created').notNull(),started:text('started')
},t=>[uniqueIndex('editorial_daily_cloud_delegations_v3_token').on(t.tokenSha256),uniqueIndex('editorial_daily_cloud_delegations_v3_owner_stage_round').on(t.owner,t.runId,t.stageKind,t.currentRound),check('editorial_daily_cloud_kind',sql`${t.stageKind} IN ('outline','outline_revision','body','structure_revision','fact_revision')`),check('editorial_daily_cloud_round',sql`${t.currentRound} >= 0`),check('editorial_daily_cloud_transport',sql`${t.transport} = 'cloud_http_once'`),check('editorial_daily_cloud_state',sql`${t.state} IN ('delegated','started')`)]);


// Isolated hot article research and normal-scope transport acceptance.
export const hotArticleBatches=sqliteTable('hot_article_batches',{id:text('id').primaryKey().notNull(),owner:text('owner').notNull(),requestKey:text('request_key').notNull(),writer:text('writer').notNull(),authorityId:text('authority_id'),state:text('state').notNull(),inputJson:text('input_json'),inputSha256:text('input_sha256'),resultJson:text('result_json'),resultSha256:text('result_sha256'),selectedReferenceId:text('selected_reference_id'),selectedTopic:text('selected_topic'),claimHash:text('claim_hash'),claimExpires:text('claim_expires'),created:text('created').notNull(),updated:text('updated').notNull(),error:text('error'),dispatchState:text('dispatch_state').notNull().default("pending")},t=>[uniqueIndex('hot_article_owner_request').on(t.owner,t.requestKey),index('hot_article_owner_created').on(t.owner,t.created),uniqueIndex('hot_article_owner_writer_reference').on(t.owner,t.writer,t.selectedReferenceId).where(sql`selected_reference_id IS NOT NULL`)]);
export const hotArticleOutbox=sqliteTable('hot_article_outbox',{batchId:text('batch_id').primaryKey().notNull(),owner:text('owner').notNull(),eventId:text('event_id').notNull(),state:text('state').notNull(),attempts:integer('attempts').notNull().default(0),leaseToken:text('lease_token'),leaseUntil:text('lease_until'),created:text('created').notNull()},t=>[]);
export const hotArticleEditorialLinks=sqliteTable('hot_article_editorial_links',{batchId:text('batch_id').primaryKey().notNull(),owner:text('owner').notNull(),writer:text('writer').notNull(),runId:text('run_id').notNull(),batchSha256:text('batch_sha256').notNull(),referenceId:text('reference_id').notNull(),created:text('created').notNull()},t=>[uniqueIndex('hot_article_owner_batch_writer').on(t.owner,t.batchId,t.writer),uniqueIndex('hot_article_run_unique').on(t.runId)]);
export const hotArticleTransportAcceptance=sqliteTable('hot_article_transport_acceptance',{id:text('id').primaryKey().notNull(),owner:text('owner').notNull(),authorityId:text('authority_id').notNull(),sourceMessageId:text('source_message_id').notNull(),evidenceSha256:text('evidence_sha256').notNull(),evidenceJson:text('evidence_json').notNull(),created:text('created').notNull()},t=>[uniqueIndex('hot_article_transport_owner_authority').on(t.owner,t.authorityId)]);
export const hotArticleTransportProbes=sqliteTable('hot_article_transport_probes',{id:text('id').primaryKey().notNull(),owner:text('owner').notNull(),authorityId:text('authority_id').notNull(),resultJson:text('result_json').notNull(),created:text('created').notNull()},t=>[]);

export const hotArticleTopicReservations=sqliteTable('hot_article_topic_reservations',{owner:text('owner').notNull(),topicKey:text('topic_key').notNull(),batchId:text('batch_id').notNull(),expires:text('expires').notNull()},t=>[uniqueIndex('hot_article_owner_topic_reservation').on(t.owner,t.topicKey)]);

// Free account discovery is isolated from editorial grants, outbox and paid calls.
export const hotBenchmarkAccounts=sqliteTable('hot_benchmark_accounts',{
 id:text('id').primaryKey().notNull(),owner:text('owner').notNull(),name:text('name').notNull(),url:text('url').notNull(),created:text('created').notNull()
},t=>[uniqueIndex('hot_benchmark_owner_url').on(t.owner,t.url)]);
export const hotBenchmarkScans=sqliteTable('hot_benchmark_scans',{
 id:text('id').primaryKey().notNull(),owner:text('owner').notNull(),requestKey:text('request_key').notNull(),state:text('state').notNull(),accountsJson:text('accounts_json').notNull(),resultJson:text('result_json'),created:text('created').notNull(),expires:text('expires').notNull(),updated:text('updated').notNull()
},t=>[uniqueIndex('hot_benchmark_owner_request').on(t.owner,t.requestKey),index('hot_benchmark_owner_created').on(t.owner,t.created)]);

// Word-only recovery, separate from business claims and platform import permits.
export const wordRecovery=sqliteTable('word_recovery',{
 attemptId:text('attempt_id'),
 owner:text('owner').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),inputSha256:text('input_sha256').notNull(),claimHash:text('claim_hash').notNull(),version:integer('version').notNull(),epoch:integer('epoch').notNull(),desired:text('desired').notNull(),executionId:text('execution_id'),requestKey:text('request_key'),tokenHash:text('token_hash'),leaseUntil:text('lease_until'),heartbeatAt:text('heartbeat_at'),status:text('status').notNull(),reason:text('reason').notNull(),retryCount:integer('retry_count').notNull(),retryAfter:text('retry_after'),minimumImages:integer('minimum_images'),executionScope:text('execution_scope').notNull().default('heavy'),queueRevision:integer('queue_revision').notNull().default(0),legacyOutputBinding:text('legacy_output_binding'),updated:text('updated').notNull()
},t=>[primaryKey({columns:[t.owner,t.targetKind,t.targetId]}),index('word_recovery_capacity').on(t.owner,t.desired,t.status,t.leaseUntil),check('word_recovery_target',sql`${t.targetKind} IN ('article','local_word')`),check('word_recovery_intent',sql`${t.desired} IN ('run','paused','cancelled')`),check('word_recovery_resource',sql`${t.executionScope} IN ('prepare','heavy')`)]);
export const wordExecutionReceipts=sqliteTable('word_execution_receipts',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),inputSha256:text('input_sha256').notNull(),claimHash:text('claim_hash').notNull(),tokenHash:text('token_hash').notNull(),executionId:text('execution_id').notNull(),epoch:integer('epoch').notNull(),executionScope:text('execution_scope').notNull().default('heavy'),operation:text('operation').notNull().default('acquire'),fromEpoch:integer('from_epoch'),fromVersion:integer('from_version'),fromTokenHash:text('from_token_hash'),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),uniqueIndex('word_execution_token_once').on(t.owner,t.tokenHash),check('word_receipt_resource',sql`${t.executionScope} IN ('prepare','heavy')`),check('word_receipt_operation',sql`${t.operation} IN ('acquire','transition')`)]);
export const wordCheckpoints=sqliteTable('word_checkpoints',{
 attemptId:text('attempt_id'),
 owner:text('owner').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),inputSha256:text('input_sha256').notNull(),assetId:text('asset_id').notNull(),kind:text('kind').notNull(),sha256:text('sha256').notNull(),size:integer('size').notNull(),chunks:integer('chunks').notNull(),metadataJson:text('metadata_json').notNull(),verificationJson:text('verification_json'),partsJson:text('parts_json').notNull(),state:text('state').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.targetKind,t.targetId,t.assetId]}),check('word_checkpoint_kind',sql`${t.kind} IN ('image','word')`),check('word_checkpoint_size',sql`${t.size}>0 AND ${t.size}<=20971520`),check('word_checkpoint_state',sql`${t.state} IN ('incomplete','ready')`)]);
export const wordServiceIncidents=sqliteTable('word_service_incidents',{
 owner:text('owner').notNull(),dependency:text('dependency').notNull(),reason:text('reason').notNull(),state:text('state').notNull(),firstSeen:text('first_seen').notNull(),lastSeen:text('last_seen').notNull()
},t=>[primaryKey({columns:[t.owner,t.dependency,t.reason]})]);
export const wordImageCandidates=sqliteTable('word_image_candidates',{
 attemptId:text('attempt_id'),
 owner:text('owner').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),candidateId:text('candidate_id').notNull(),inputSha256:text('input_sha256').notNull(),sourceUrl:text('source_url').notNull(),sourceTitle:text('source_title').notNull(),outcome:text('outcome').notNull(),reason:text('reason').notNull(),replacementFor:text('replacement_for'),assetId:text('asset_id'),payloadSha256:text('payload_sha256').notNull(),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.targetKind,t.targetId,t.candidateId]}),uniqueIndex('word_candidate_url_once').on(t.owner,t.targetKind,t.targetId,t.attemptId,t.sourceUrl),check('word_candidate_outcome',sql`${t.outcome} IN ('download_failed','skipped','ready')`)]);

// A waiting request is durable evidence, never an execution grant or scheduler.
export const wordExecutionQueue=sqliteTable('word_execution_queue',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),inputSha256:text('input_sha256').notNull(),claimHash:text('claim_hash').notNull(),tokenHash:text('token_hash').notNull(),executionId:text('execution_id').notNull(),executionScope:text('execution_scope').notNull(),capacityReason:text('capacity_reason').notNull(),operation:text('operation').notNull(),fromEpoch:integer('from_epoch'),fromVersion:integer('from_version'),fromTokenHash:text('from_token_hash'),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),uniqueIndex('word_execution_queue_target').on(t.owner,t.targetKind,t.targetId),uniqueIndex('word_execution_queue_token').on(t.owner,t.tokenHash),check('word_queue_target',sql`${t.targetKind} IN ('article','local_word')`),check('word_queue_resource',sql`${t.executionScope} IN ('prepare','heavy')`),check('word_queue_operation',sql`${t.operation} IN ('acquire','transition')`),check('word_queue_capacity_reason',sql`${t.capacityReason} IN ('total_capacity','heavy_capacity')`)]);

// Immutable accepted request history keeps cancelled queued credentials fenced.
export const wordExecutionRequests=sqliteTable('word_execution_requests',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),targetKind:text('target_kind').notNull(),targetId:text('target_id').notNull(),inputSha256:text('input_sha256').notNull(),claimHash:text('claim_hash').notNull(),tokenHash:text('token_hash').notNull(),executionId:text('execution_id').notNull(),executionScope:text('execution_scope').notNull(),capacityReason:text('capacity_reason'),operation:text('operation').notNull(),fromEpoch:integer('from_epoch'),fromVersion:integer('from_version'),fromTokenHash:text('from_token_hash'),created:text('created').notNull()
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),uniqueIndex('word_execution_request_token').on(t.owner,t.tokenHash),check('word_request_target',sql`${t.targetKind} IN ('article','local_word')`),check('word_request_resource',sql`${t.executionScope} IN ('prepare','heavy')`),check('word_request_operation',sql`${t.operation} IN ('acquire','transition')`)]);

// Visibility only: no cascading deletes and no changes to execution grants.
export const articleWorkspaceArchives=sqliteTable('article_workspace_archives',{
 owner:text('owner').notNull(),articleId:text('article_id').notNull(),archivedAt:text('archived_at').notNull(),requestKey:text('request_key').notNull(),
},t=>[primaryKey({columns:[t.owner,t.articleId]})]);
export const articleWorkspaceRequests=sqliteTable('article_workspace_requests',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),payload:text('payload').notNull(),result:text('result').notNull(),created:text('created').notNull(),
},t=>[primaryKey({columns:[t.owner,t.requestKey]})]);
export const articleHistory=sqliteTable('article_history',{
 owner:text('owner').notNull(),historyKey:text('history_key').notNull(),articleId:text('article_id'),recordJson:text('record_json').notNull(),evidenceSha256:text('evidence_sha256').notNull(),completedAt:text('completed_at').notNull(),created:text('created').notNull(),
},t=>[primaryKey({columns:[t.owner,t.historyKey]}),uniqueIndex('article_history_evidence').on(t.owner,t.evidenceSha256,t.historyKey)]);
export const articleMetricsObservations=sqliteTable('article_metrics_observations',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),historyKey:text('history_key').notNull(),platform:text('platform').notNull(),publishedAt:text('published_at'),observedAt:text('observed_at').notNull(),payload:text('payload').notNull(),created:text('created').notNull(),
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),check('article_metrics_platform',sql`${t.platform} IN ('toutiao','zhihu')`)]);
export const topicResearchHolders=sqliteTable('topic_research_holders',{
 owner:text('owner').notNull(),researchId:text('research_id').notNull(),epoch:integer('epoch').notNull(),claimSha256:text('claim_sha256').notNull(),executionId:text('execution_id'),created:text('created').notNull(),
},t=>[primaryKey({columns:[t.owner,t.researchId,t.epoch]}),uniqueIndex('topic_research_holder_hash').on(t.owner,t.researchId,t.claimSha256),check('topic_research_holder_epoch',sql`${t.epoch}>0`)]);
export const topicResearchExecutionFences=sqliteTable('topic_research_execution_fences',{
 owner:text('owner').notNull(),researchId:text('research_id').notNull(),holderKey:text('holder_key').notNull(),claimSha256:text('claim_sha256'),inputSha256:text('input_sha256').notNull(),heldAt:text('held_at').notNull(),
},t=>[primaryKey({columns:[t.owner,t.researchId,t.holderKey]})]);
export const topicResearchExecutionSettlements=sqliteTable('topic_research_execution_settlements',{
 owner:text('owner').notNull(),researchId:text('research_id').notNull(),holderKey:text('holder_key').notNull(),claimSha256:text('claim_sha256'),inputSha256:text('input_sha256').notNull(),requestKey:text('request_key').notNull(),payloadSha256:text('payload_sha256').notNull(),evidenceJson:text('evidence_json').notNull(),resultJson:text('result_json').notNull(),created:text('created').notNull(),
},t=>[primaryKey({columns:[t.owner,t.researchId,t.holderKey]}),uniqueIndex('topic_research_settlement_request').on(t.owner,t.requestKey)]);
export const topicResearchControlReceipts=sqliteTable('topic_research_control_receipts',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),researchId:text('research_id').notNull(),operation:text('operation').notNull(),payloadSha256:text('payload_sha256').notNull(),resultJson:text('result_json').notNull(),evidenceJson:text('evidence_json'),created:text('created').notNull(),
},t=>[primaryKey({columns:[t.owner,t.requestKey]}),check('topic_research_control_operation',sql`${t.operation} IN ('renew','recover')`)]);
export const topicResearchControlKeys=sqliteTable('topic_research_control_keys',{
 owner:text('owner').notNull(),requestKey:text('request_key').notNull(),researchId:text('research_id'),receiptTable:text('receipt_table'),payloadSha256:text('payload_sha256'),resultJson:text('result_json'),legacyConflict:integer('legacy_conflict').notNull().default(0),created:text('created').notNull(),
},t=>[primaryKey({columns:[t.owner,t.requestKey]})]);
export const dedaoCloudRequests=sqliteTable('dedao_cloud_requests',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),requestKey:text('request_key').notNull(),state:text('state').notNull(),conversationUrl:text('conversation_url').notNull(),articleId:text('article_id'),executionId:text('execution_id'),claimHash:text('claim_hash'),claimExpires:text('claim_expires'),dispatchState:text('dispatch_state').notNull(),created:text('created').notNull(),updated:text('updated').notNull(),endReference:text('end_reference'),
},t=>[uniqueIndex('dedao_cloud_owner_request').on(t.owner,t.requestKey),uniqueIndex('dedao_cloud_one_active').on(t.owner).where(sql`${t.state}<>'completed'`),check('dedao_cloud_state',sql`${t.state} IN ('queued','writing','processing','completed')`)]);
export const dedaoCloudActions=sqliteTable('dedao_cloud_actions',{
 owner:text('owner').notNull(),taskId:text('task_id').notNull(),action:text('action').notNull(),actionId:text('action_id').notNull(),state:text('state').notNull(),message:text('message'),observationJson:text('observation_json'),created:text('created').notNull(),confirmedAt:text('confirmed_at'),
},t=>[primaryKey({columns:[t.owner,t.taskId,t.action]}),uniqueIndex('dedao_cloud_action_identity').on(t.actionId),check('dedao_cloud_action_kind',sql`${t.action} IN ('recommend','adopt','framework','finalize','download')`),check('dedao_cloud_action_state',sql`${t.state} IN ('reserved','confirmed')`)]);
