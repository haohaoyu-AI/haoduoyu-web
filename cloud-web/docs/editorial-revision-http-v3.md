# Same-run issue-driven revision transport

This additive transport extends the existing private `/api/editorial-v3-cloud` endpoint to already-claimed `structure_revision` and `fact_revision` stages on run `bd6d4434-273b-426e-a17f-9390fc124c84` only. It does not create a stage, call a provider during delegation, replace a model or prompt, expand authority, or revive the consumed one-body continuation.

## Entry and authority

- The existing `delegate_editorial_v3_cloud_http_once` tool remains the only owner delegation entry. Its owner comes from normal authenticated MCP dispatch.
- The exact arguments remain `run_id`, `stage_id`, the existing claimed-stage `token`, `transport: "cloud_http_once"`, and `confirm: true`. Each new revision stage requires its own owner confirmation.
- Caller owner, author text, prompt, model, hash, new tokens, arbitrary stage inputs, and substitute grants are rejected.
- A revision must belong to the original initialized Claude run, current claimed stage and round, original article, active unbounded necessary-issue-driven authority and original expiry. Paused or archived workflow controls prevent a start.
- The release gate remains the existing `editorialCloudHttpPaidEnabled` constant. Revision code receives it from the original transport; HTTP/MCP inputs cannot change it. No new credential or provider capacity is created.

## Frozen evidence

`editorial_revision_cloud_delegations_v3` is separate from `editorial_cloud_delegations_v3`. The original body continuation's unique `(owner, continuation_id)` constraint and consumed `started` row remain unchanged.

A delegation freezes its stage kind, round, role, actor, article/run, nonce hash, complete stage input, whole-run input, snapshot, model, expiry, original authority static bindings, full source stage identity, completed source receipt and response hash, the exact previous report's ID/input/artifact/actual issues, and any initial fact report.

The previous report must be a completed independent saved `structure_review` or `fact_check`/`final_verify`, with real issues greater than zero and a revision-needed result. Its input binding and entire article must match the revision input's exact version ID and SHA. Initial quality repair preserves the separately saved structural report as `previous_report`, with the independently saved fact report frozen in `initial_fact_report: {stage_id, input_sha256, artifact_sha256, report}`.

A source article can be either an ordinary completed Claude writer artifact or the exact body-only `content_invalid` + `claude_provider_quality_candidate_v1` candidate. Other content-invalid artifacts are rejected. The quality source is stored as an immutable `{article, quality_evidence}` artifact wrapper. Its evidence freezes original receipt/source/input/snapshot/article hashes and the length failure; full wrapper bytes are revalidated on every strict load. Both source kinds require the original immutable completed provider receipt with exact actor/model/stage/input/snapshot identities. `prepareEditorialV3Stage` remains the strict validation gate: it must independently rebuild the entire stage input and verify actual actor, provenance, source receipt text and quality-candidate derivation. This transport does not upgrade a candidate into a passed artifact.

## Once-only execution and reads

HTTP lookup checks the original body delegation first, then the separate revision delegation. The route accepts only exact stage/nonce credentials and keeps its existing NDJSON framing and duration settings.

An execute request runs strict preparation, then CAS-consumes the revision delegation before forwarding the request-bound AbortSignal to the existing runtime. Durable `started` consumption is never reset, even for a lost response or pre-provider error. The runtime retains its original attempt uniqueness. Requested, unknown, failed and completed repeats only read the exact stage safely; they do not recover or retry execution.

Every delegation and consumption CAS compares all frozen source/report/receipt/current-stage/run/authority row scalars with NULL-safe `IS` predicates. One bound JSON array per row avoids D1's 100-parameter limit, and balanced conjunctions avoid workerd's expression depth 100 limit.

Nonce reads stop at the original expiry or authority revocation. Only the authenticated-owner exact delegation replay remains a historical read. Safe HTTP projections include stage state and fixed diagnostic/model/numeric usage fields, with credential suppression; they never include source text, prompts, input, snapshots, reports, artifacts, author text or current-version trees. The same-endpoint 330-second probe is a timer-only operation with no preparation, provider calls, reservations or business writes.

## Offline verification

- `NODE_OPTIONS=--max-old-space-size=192 node tests/editorial-revision-http-v3.mjs`
- `NODE_OPTIONS=--max-old-space-size=192 node tests/editorial-revision-http-v3.mjs --d1`

Both modes exercise 43 synthetic checks. The second uses the installed actual local workerd/D1 engine, `cf: false`, `CLOUDFLARE_CF_FETCH_ENABLED=false`, and an external outbound service returning 403. No production DB, deployment, build, network model request or paid stage was used.

Coverage includes strict argument and owner scope, real issue and full-version bindings, quality-candidate source identity, initial fact evidence, strict-runtime rejection, complete-row mutation races, concurrent delegation/start, durable single-use after failure, expiry/revocation, unchanged consumed-body/source rows, safe suppression, AbortSignal forwarding, and same-endpoint NDJSON.

Both modified transport files also passed a focused TypeScript semantic check using typed dependency contracts. The full project type check was attempted at the required 192 MiB Node heap limit and exhausted that limit; it is not claimed as a full-project pass. The integrated candidate adds migration 0022 and its matching schema/snapshot/journal. The runtime integration regression must pass before release.

## Exact cloud consumer wire contract

Perform the normal authenticated-owner read → new claim → explicit delegate → safe GET → unique POST → terminal/readback in **one consumer turn**. `claim_editorial_v3_stage` arguments are exactly `{run_id, expected_snapshot_sha256, confirm:true}`. Only a newly won ordinary revision claim returns its volatile `token`; repeating an existing revision claim does not promise to return it again. Do not claim merely to inspect. Losing the volatile nonce across turns is a reported blocker, not permission to mint another token or retry the stage.

Normal owner delegation arguments are exactly `{run_id, stage_id, token, transport:"cloud_http_once", confirm:true}`. Keep the winning claim nonce in process memory. Retrieve the existing official Site service-access token through the consumer's own supported `get_site` call and keep it only in memory; no owner header or copied credential is used.

- Safe GET: `/api/editorial-v3-cloud?stage_id=<the-new-revision-stage-uuid>` with `OAI-Sites-Authorization: Bearer <existing-site-service-access-token>` and `x-editorial-stage-token: <winning-claim-token>`. Exactly one `stage_id` query parameter, no nonce in the URL and no request body.
- Unique paid POST: `/api/editorial-v3-cloud` with `OAI-Sites-Authorization: Bearer <existing-site-service-access-token>` and `Content-Type: application/json`. Exact UTF-8 JSON body `{ "stage_id": "<the-new-revision-stage-uuid>", "token": "<winning-claim-token>" }`. No action/query parameter, owner, run, hash, prompt or model fields. Request body maximum 1024 bytes. Hold the response through the final NDJSON line.
- Optional zero-provider probe POST: identical headers/body but `/api/editorial-v3-cloud?action=probe`. It must reach the 330-second terminal without a provider call, reservation or business write. It does not execute the author stage.
- After the unique paid POST, a GET with the same query/headers reads only that exact stage's safe status/receipt diagnostic/model/usage. Ordinary owner `read_editorial_v3` is the separate full-text result path.

The NDJSON response emits an immediate `running` frame, ten-second `running` heartbeats and a final `terminal` frame. A transport terminal with `success:false`, disconnect or missing final frame cannot authorize another POST. Preserve the same durable stage/reservation and reconcile by supported readback. Model completion also does not imply content passed; all independent review and strict freeze gates still apply.
