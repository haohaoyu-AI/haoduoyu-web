# Deleted article Word admission recovery

Baseline: private production V140, `ab95ebb30adaec2efcf2c4a5b263c2aa22f16f8e`.
Migration: `0049_article_purge_codex_observations`; migrations 0000–0048 remain unchanged.

## Problem and bounded result

A completed permanent article purge keeps content-free serial safety blocks when an old external executor's end is unknown. This can leave a newly claimed article's original Word acquisition queued with `total_capacity`. Deletion, lost connection, idle state and elapsed time never prove that an old executor or its issued actions ended.

An original holder can still use `record_deleted_article_executor_end` with its original credentials. For historical manual-help acquisitions whose volatile credentials were lost, this change adds a separate owner-observed terminal receipt. It preserves all source fences, tombstones, serial blocks, the original holder contract and the original admission predicate. It does not claim articles, dispatch executors or grant Word execution.

## Normal tool sequence

1. Read `read_word_serial_admission` for the existing article or local Word job. This is a current, read-only gate observation. `serial_admission_possible` is not an execution grant.
2. Read `preview_deleted_article_executor_recovery` for each unresolved deleted article. Retain its exact operation, context hash, input hash and original acquisition request key.
3. Through supported Codex lifecycle/history tools, recover the actual original acquisition receipt (handoff ID, event ID and exact UTC millisecond creation time), its mapping to the actual execution/thread/turn, a `completed`, `failed` or `cancelled` terminal observation, and evidence that every issued action stopped and settled. Thread and execution IDs need not be equal. Missing proof keeps admission blocked.
4. Call `record_deleted_article_executor_observation` with one stable request key and the fields below. After an unknown response, read `read_deleted_article_executor_observation` with that same article/request key; retry only the identical payload under the same key.
5. Independently read the original purge and admission status. All blockers must be resolved. The existing queued holder retries its original acquisition request and must receive an actual grant before execution; it must not rotate its business claim or compete with another executor.

## Observation fields

Required exact identities: `article_id`, `operation_id`, `request_key`, `expected_snapshot_sha256`, `input_sha256`, `original_acquisition_request_key`, `receipt_handoff_id`, `receipt_event_id`, `receipt_created`, `execution_id`, `thread_id`, `turn_id`. Preserve the original event value exactly: production handoff events use `article_wake_<UUID>`; historical UUID-only events are also accepted and must still match the original receipt SHA.

Required evidence: `evidence_source="codex_app_tools"`, `terminal_state` in `completed|failed|cancelled`, `ended_at`, `observed_at`, `execution_mapping_reference`, `end_reference`, `settled_reference`, `confirm_all_actions_stopped=true`, `confirm_all_actions_settled=true`. Timestamps require canonical UTC millisecond form and original acquisition ≤ end ≤ observation ≤ now. References must identify actual supported tool observations, contain no credentials and be at most 240 characters.

The server reconstructs the original seven-field help-acquisition row in its original schema order and requires its SHA to equal the immutable purge graph fingerprint. It checks owner, completed purge, original tombstone, source fences, frozen input, absence of mapped Word grant/slot history and exact original acquisition. Only eligible `manual_help` blocks use this path; unknown or mapped holders stay under the original protocol.

## Persistence, concurrency and evidence limits

The observation audit and end receipt append in one D1 batch. Their exact owner/request/article/operation/payload bindings are protected by new database guards. The audit is immutable. Same-key conflicting payloads are rejected, including simultaneous first reads; a retry uses the already saved audit timestamp. The original block identities remain unchanged and old writers remain fenced.

The new end evidence is `owner_observed_codex_terminal`, always `server_verified=false` and `external_stop_confirmed=false`. Supported-tool references and execution/thread/turn identities are stored as hashes. The server validates the immutable original acquisition and receipt bindings; it cannot cryptographically authenticate external Codex lifecycle references. The authorized operator must actually obtain and retain those observations. A successful synthetic test is not proof that a production holder ended.

`read_word_serial_admission` exposes only aggregate blockers, business-claim liveness and read time. It uses the unchanged admission predicate and fails closed if the current execution identity changes between reads. It performs no writes, claim renewal, timeout settlement or dispatch. Article and local Word callers share this protocol without changing desktop code.

## Verification

Isolated workerd D1/R2 tests cover current unstarted claims, historical manual blocks, original holder compatibility, exact observed settlement, malformed/mismatched evidence, unknown response/replay, simultaneous conflicting receipts, immutable audit guards, late source writes, serial order, pause/acknowledgement/resume and preserved checkpoints. Migration tests retain all old trigger SQL and receipt/index data, and verify whole-batch rollback on migration failure. No production articles, claims or lifecycle receipts are used as test fixtures.
