# Explicit single body continuation

This feature allocates one additional body attempt only for run `bd6d4434-273b-426e-a17f-9390fc124c84` and failed body stage `5b4832c6-4fbf-4f48-b4cf-fd5b927f71ee`. It does not invoke a model, create a new run/article/intent, deploy, touch legacy quotas, or alter the failed stage/receipt/input. Allocation requires the authenticated owner route, explicit `confirm: true`, the dedicated scope, and exact expected old receipt/input/snapshot SHA256 values. The caller supplies source message ID and exact quotation for audit only. They are not a platform signature or independent verification.

## Runtime integration

`previewEditorialBodyContinuation(owner, {run_id, failed_stage_id, verify_current_configuration?}, {loadStrict, assertSafe, assertCurrentBinding})` is the owner-only read interface for obtaining the exact full old receipt/input/snapshot hashes needed by the later write. It also returns the business/approved-outline hashes, model/output cap and dedicated one-attempt scope. It does not return receipt bytes, input content, prompts, body text or tokens. By default (including an explicit false flag) it calls no provider metadata. An explicit `verify_current_configuration: true` runs one read-only configuration preflight after all original owner/receipt/input/outline gates pass. This may perform one fixed `/v1/models` GET, never `/messages`, and returns only ready/blocked plus closed stage/code diagnostics; it performs no write, allocation, paid generation or approval. Unknown/in-flight phases and any retained text/raw content are rejected. The MCP definition is `preview_editorial_body_continuation_v3`; the normal owner-authorized write still separately requires explicit confirm and scope.

Provide `BodyContinuationDependencies` to `authorizeEditorialBodyContinuation`:

- `loadStrict(owner, runId)`: the normal strict runtime loader, returning `{row, s, steps, authority}`. Never use the diagnostic/read-only downgrade as an authorization source.
- `buildInput(plan, {id, round, sequence})`: the normal server-side body input builder, fed only frozen server-side business data. Confirm its stage is `body` before narrowing the TypeScript result. The module requires its serialized result to equal the original body input with only `stage_id`, `round`, and `sequence` replaced.
- `assertSafe(owner, value)`: the existing full credential/content safety boundary. Do not weaken it for continuations.
- `assertCurrentBinding(owner, plan)`: verify current provider configuration/model and the frozen capability. This callback must not perform a paid call. The caller owns any separate transport-readiness gate.

`verifyEditorialBodyContinuationLineage(owner, plan, newStageId, {assertSafe})` takes the loader's already-loaded plan, avoiding recursive loads. Invoke it while strictly loading a candidate continuation body stage. Ordinary stages keep normal input reconstruction. For a verified continuation, use the original frozen body business input plus its new identity. The new `round` is explicit owner retry lineage, not an editorial issue or requested revision.

The authorizing response returns IDs/hashes only, never a claim token or full inputs. The normal `claimEditorialV3Stage` interface may return the existing token for the verified continuation's `claimed` stage. Do not expose it through read APIs or return the token for requested/completed/failed stages. Existing failed-stage guards must exempt only the exact verified historical failed body, so independent structure/fact/final review can proceed after a completed new body. All live run/control/authority/configuration checks remain in force before executing or recovering. A requested/unknown/in-flight continuation cannot cause a second allocation.

## Durable boundaries

Migration 0020 only adds `editorial_body_continuations_v3`. Its lifetime owner/failed-stage uniqueness prevents new authorization keys from creating a second continuation. Owner/key, owner/new-stage, and owner/token-hash uniqueness are also enforced. Existing `(owner, run, stage, round)` and sequence uniqueness remain unchanged.

The authorization freezes the original run identity/intent/article, exact original input and snapshot bytes/hashes, full failed receipt bytes/hash, failed stage identity and token hash, approved outline/review and their exact hashes, complete original system and user prompts, model and output cap, and a business hash over `{model,max_output_tokens,system_prompt,user_prompt}`. Snapshot bytes separately freeze sources, facts and provider/capability configuration.

Allocation writes authorization, a new `claimed` body at previous round + 1 and sequence + 1, and the existing run's body phase in a single D1 batch. Every boundary fences full old run/authority/stage/receipt/outline/review rows, live expiry, and pause/archive controls. Each frozen row uses one bound JSON array with scalar-by-scalar `IS json_extract` comparisons, retaining exact string/NULL/integer equality while respecting D1’s [100 bound parameters per statement limit](https://developers.cloudflare.com/d1/platform/limits/). The last statement uses a NOT NULL constraint assertion to abort the whole transaction if any conditional write misses after allocation. A matching replay is read-only and must match every original request argument. A mismatched replay or changed key is denied. The module never reserves a provider receipt.

## Historical suppression

`isDiscardedBodyFailureCoveredByContinuation(owner, plan, failedStageId, receiptResponse, {assertSafe})` returns true only for the exact frozen historical receipt whose `text`, `partial_text`, `raw_response`, and `raw_partial_response` are absent or null. Empty strings and all other values are rejected. It independently verifies the persisted continuation lineage, exact receipt bytes/SHA, original no-artifact stage, snapshot/input/outline/review, and safety checks. It returns false on every mismatch or exception.

This permits only removing that historical receipt's irrelevant `unsafe_response`/suppression flag from run-wide suppression aggregation. The historical receipt itself remains hidden. Never skip input/artifact safety checks, unsafe actual content, arbitrary old errors, credentials, any other receipt, or the new attempt's suppression checks. New safe body content can be visible only after its ordinary strict provenance, completion, receipt/model, parsing, and safety checks pass.

## Offline verification

- `node tests/editorial-body-continuation.mjs`: synthetic in-memory SQLite allocation, concurrency, immutable inputs/old receipts, scope/owner/identity denial, lifecycle denial, strict-loader/configuration denial, retained-content denial, complete receipt-byte races, transactional rollback, and read-only replay.
- `node tests/editorial-body-continuation-migration.mjs`: additive SQL/meta and lifetime uniqueness; all old indexes/tables preserved.

No real provider/network/browser/production action is used by these tests. Runtime integration, real transport readiness and any separately authorized paid invocation remain the integrating caller's responsibility.

The runtime and normal authenticated-owner MCP preview/authorize tools are integrated. Actual transport acceptance and the one paid invocation remain separate release steps. `executeEditorialV3Stage(prepared, {signal})` propagates request cancellation into the buffered provider reader; losing the connection does not authorize another attempt. The isolated cloud HTTP module has an additional explicit owner stage delegation, not an implicit reuse of legacy claim permissions.

Authorization failures expose only closed diagnostic stages/codes, never exception messages, configuration ciphertext, headers or raw metadata. Evidence/input hash mismatch, live prompt/provider/capability checks, reconstruction mismatch, row reread and allocation failure remain distinct. The original strict checks and CAS remain mandatory; preflight success does not authorize or allocate any attempt. A fresh metadata deadline remains 20 seconds; no retry is added.

Authorization failures expose only closed diagnostic stages/codes, never exception messages, configuration ciphertext, headers or raw metadata. Evidence/input hash mismatch, live prompt/provider/capability checks, reconstruction mismatch, row reread and allocation failure remain distinct. The original strict checks and CAS remain mandatory; preflight success does not authorize or allocate any attempt. The fresh metadata deadline remains 20 seconds; no retry is added.
