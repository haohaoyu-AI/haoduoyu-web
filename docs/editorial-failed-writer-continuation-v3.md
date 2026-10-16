# Explicit failed-writer continuation (V3)

This additive entry point allocates one new linked writer attempt only after a fresh normal authenticated-owner confirmation. It does not request a model, delegate HTTP, reset a nonce or receipt, restore an archive or quota, change an existing authority, or publish an article. It is generic across the existing V3 Claude writer stages: outline, outline_revision, body, structure_revision, and fact_revision. It has no run/source allowlist and does not widen the earlier fixed unknown-revision grant.

## Owner action and risk

Preview is read-only. Authorization requires the exact scope `editorial_v3_one_explicit_failed_writer_continuation`, stable authorization key, run/source IDs, expected receipt/input/snapshot hashes, expected delegation hash (explicit null for ordinary runtime), owner-chat question/answer IDs and quoted evidence hash, `confirm=true`, `accept_prior_charge_possible=true`, `accept_additional_charge_possible=true`, `accept_overlap_possible=true`, and `upstream_outcome='unknown'`.

The application terminal failure does not establish supplier termination or whether the supplier charged. The original may already be charged, the new attempt may be charged again, and the two supplier executions may overlap. Chat IDs and quotes are an authenticated-owner attestation audit, not a platform signature or cancellation proof. The wrapper must present these risks in the normal owner confirmation; an assistant's decision or a previous grant cannot replace that action.

Every failed source has one lifetime grant, independent of authorization key. Replaying the exact durable request is read-only. Changing the key cannot reopen that source. If the allocated attempt itself fails, it becomes a different source requiring another independent owner action. There is no automatic retry loop.

## APIs

- `previewFailedWriterContinuation(owner, {run_id, source_stage_id}, deps)`
- `authorizeFailedWriterContinuation(owner, request, deps)`
- `verifyFailedWriterContinuationLineage(owner, plan, newStageId, deps, {mode})`
- `isFailedWriterCoveredByContinuation(owner, plan, sourceStageId, receiptResponse, deps)`
- `editorialFailedWriterContinuationSqlFence('s' | 't')`
- `failedWriterTransportFailure(packet)`

`deps` uses the normal `loadStrict`, `assertSafe`, `assertCurrentBinding`, and `buildInput(plan, identity, source)`. The final source argument allows normal stage-specific input reconstruction; the first two arguments follow the existing continuation dependency design. The builder result must equal the entire original input with only stage_id, round, and sequence replaced. Model, rules, source facts, report identities, prior full text, snapshot, and all arbitrary business fields remain byte-exact under JSON serialization.

The optional `verifyPriorExceptionalStage` is solely an adapter to the existing exact legacy body/unknown/quality verifiers. Missing or false blocks allocation/history. The core additionally requires a relevant legacy grant for each exception. An unrelated requested, failed, or invalid stage is never excused, even by a permissive callback. New generic failed hops are checked by this module recursively with cycle detection and memoization, and their precise failed sources are exempted only after complete grant validation.

## Eligibility and safety

The source must be the latest current stage, an allowed writer kind, same round as the current `technical_failed` run, with a bound failed receipt and no retained text/raw/artifact/output or stage artifact/provenance/actor/execution/model. Requested, unknown, completed, invalid-content, review, archived, paused, revoked, expired, and final-frozen runs cannot allocate.

Only a closed zero-payload transport classification is admitted. Known credential matches, incomplete escapes, invalid encoding, protocol errors, inspection/output budget failures, unsafe ambiguous suppression, completed streams, and retained content all fail closed. A historical `unsafe_response` can be recognized as transport-only when its complete diagnostic evidence says buffered_v2, raw_retained=false, safety_subcause=stream_incomplete, and an allowed timeout/interruption transport cause. Application failure remains upstream-outcome unknown. This initial entry conservatively rejects observed EOF=true failures, including incomplete-EOF packets; the transport allowlist does not by itself establish eligibility.

The normal strict loader and credential safety boundary still inspect all actual inputs, snapshots, evidence, reports, and receipts. Classification does not bypass them.

## Audit, linkage, and CAS

`editorial_failed_writer_continuations_v3` freezes original immutable run/authority bindings, the complete failed source (token hash only in audit), complete original failed receipt, source HTTP delegation identity/table/full-row hash and frozen-JSON hash, complete input/business hash, and ordered history stage/receipt/grant row hashes. Original rows remain untouched. The new stage is claimed with a distinct stage UUID and token UUID in the same run/article, with round and sequence advanced by one. The ordinary runtime reserves a distinct new receipt for it.

Source HTTP references support the existing body, existing fixed revision, and new generic transport tables. There can be at most one; it must remain started with its exact frozen identity and start time. An ordinary-runtime source records explicit null; a subsequently invented delegation invalidates its lineage. New HTTP permission is separate and must follow the normal authenticated-owner delegation flow.

Allocation is an atomic four-statement D1 batch. Full NULL-safe run, authority, every history stage, all bound receipts, prior grant rows, controls, and source delegation rows are compared, including absence/count/addition/deletion facts. A conditional final NOT NULL assertion rolls back a partial allocation after a mid-batch race. Balanced expression trees and one JSON array parameter per complete row set preserve the comparisons while staying below 100 bound parameters; payloads/records over the 2MB ceiling are refused.

Historical immutable failed receipts remain exact forever. Only the existing fixed-scope unknown-revision source, after its existing full legacy verifier succeeds, may have legitimate requested progress or a late terminal receipt. The complete allocation-time receipt hash is retained for audit/CAS; subsequent history checks compare its immutable receipt identity and all packet bindings. This does not authorize new requested-source retry, ignore actual content/credential safety, or turn late evidence into another grant.

Before reservation and transport consumption, the integration must run the full lineage verifier in `before_new_execution` mode, plus normal live authority/configuration checks, and include the SQL fence with the caller's complete grant/new-stage/source-token CAS. The static SQL fence checks old failed receipt bytes and all non-token source columns. Token hash verification remains in JavaScript; it is not represented as a SQL SHA function. History mode remains read-only after progress/completion/revocation.

## Storage and verification

Migration 0024 adds `editorial_failed_writer_continuations_v3` and `editorial_failed_writer_cloud_delegations_v3`; it changes no existing table/index/row. The transport table accepts only the five writer kinds, nonnegative round, cloud_http_once, and delegated/started; owner/run/kind/round, owner/continuation, and token are unique. Transport code and runtime/MCP/HTTP integration are separate modules.

Offline commands:

- `NODE_OPTIONS='--max-old-space-size=192 --max-semi-space-size=4' node tests/editorial-failed-writer-continuation-migration-v3.mjs`
- `NODE_OPTIONS='--max-old-space-size=192 --max-semi-space-size=4' node tests/editorial-failed-writer-continuation-v3.mjs`

Final focused run: migration parity and 85 SQLite checks passed. Maximum batch parameters were 35/36/26/23; the largest SQL statement was about 28KB. No provider, network, or production calls occurred.

These tests use synthetic data, in-memory SQLite, a throwing network stub, and the production core transpiled in an isolated VM. SQLite coverage is not a workerd/D1, TypeScript aggregate, runtime, HTTP, provider, or deployed acceptance claim.

The new owner action accepts prior, additional, and potentially overlapping charges across the same-run writing chain, including earlier unknown requests and late results. A read-only preview may advertise a fully bound complete earlier candidate for reconciliation before authorization; it never adopts it or inserts an acknowledgment gate. After allocation, exact legacy-lineage-approved progress/late receipts remain historical and do not freeze the new stage.

The integrated runtime and transport also atomically fence the original source delegation full row in its whitelisted table and explicit absence in the other two tables; an ordinary-runtime source fences all three absences.

The strict lineage verifier returns the hash of the complete grant row from the same validated read. Runtime load keeps that proof; later reservation captures must match it before using their full-row SQL CAS image. Reservation also compares the complete loaded run and freezes/compares authority immutable bindings before its full-row CAS, so a post-prepare replacement cannot consume a receipt merely because it was reread as a new baseline. The HTTP binding checks its earlier grant image against the same proof.

Completed buffered receipts used for owner recovery or already saved writer artifacts must be safe and complete: EOF/end_turn/raw-retained=false, no suppression, no safety/code/transport failure, and message_stop for the SSE path. Unmarked legacy receipts retain their previous exact identity/model/content checks. Independent review and the existing 2000-character quality gate remain mandatory.

Actual D1 exposed a reservation SQL expression-depth limit of 100 that SQLite with its default limit did not catch. The source-transport fence uses the stage_id primary-key guarantee: zero rows require absence, one row requires the complete NULL-safe row match. It preserves all three table facts, the original frozen JSON parameters, and JavaScript SHA/reference checks while avoiding redundant collection count and double anti-join nesting. The original captured reservation required more than depth 100; the equivalent 15,877-byte structure compiled below 100 and its two original statements wrote exactly one row each in actual workerd D1. This narrow SQL replay is separate from full runtime acceptance.

Concurrent identical owner actions can observe a committed winner after their first absence lookup. A failed preflight rereads only the same owner/source/key/run and exact canonical request JSON/hash, then runs a fresh strict load and complete history verification before returning that grant read-only. This reconciliation never writes or allocates another stage/nonce/attempt; changed keys and invalid histories stay denied. Three deterministic concurrency-window checks extend the synthetic SQLite core suite to 88 passing checks.
