# Narrow single-stage cloud HTTP continuation

This is an application nonce gate behind the existing private Site platform dispatch access policy. The existing Site serviceaccess credential only grants transport access. It does not identify an owner. This endpoint ignores caller-defined owner/service headers and must not be deployed as a public Site. No new persistent credential is created, and no YYLX key is returned or exported.

Only the already allocated new body stage in the explicit continuation for run `bd6d4434-273b-426e-a17f-9390fc124c84`, failed stage `5b4832c6-4fbf-4f48-b4cf-fd5b927f71ee`, is eligible. An ordinary historical stage claim, including its valid token, is insufficient. Normal owner MCP creates the explicit transport delegation while the new stage is claimed and no attempt exists. The delegation neither allocates a new stage nor creates a provider reservation.

## Integrated owner/runtime boundary

- The additive `drizzle/0021_editorial_cloud_http_v3.sql`, Drizzle schema, snapshot and journal are included. Existing tables and grants are unchanged.
- The normal authenticated-owner MCP tool list includes `editorialCloudHttpTools` from `lib/editorial-cloud-http-v3.ts`.
- The integrated MCP route dispatches only `delegate_editorial_v3_cloud_http_once` to `delegateEditorialV3CloudHttpOnce(authenticatedOwner,args)`. The owner must come from the existing dispatch-authenticated MCP context, never serviceaccess, the body or a caller-defined header.
- Exact arguments: `run_id`, `stage_id`, existing claimed-stage `token`, `transport: "cloud_http_once"`, `confirm: true`. No supplied prompt, model, hash, owner or replacement authorization is accepted.
- The included runtime has continuation-aware strict loader/lineage checks and `executeEditorialV3Stage(prepared,{signal})`, with the signal forwarded into the actual buffered provider reader. The HTTP module forwards that same signal; it does not create detached execution. Normal owner preview, explicit one-body authorization and the continuation-only claim are integrated.

The DB freezes owner/run/stage, existing nonce SHA256, complete stage input and run input/snapshot bytes and SHA256, requested model, continuation bytes and original expiry. Its stage/continuation/token identities are unique. The exact existing deterministic `editorial_v3:owner:run:stage` provider reservation remains authoritative.

## HTTP contract

Use the official existing private Site access mechanism and the private Site's verified HTTPS origin. Never fabricate an owner identity/service verification header. Keep both the serviceaccess credential and stage nonce out of logs, URLs and saved command files.

- POST `/api/editorial-v3-cloud?action=probe`, JSON body with exactly `stage_id` and existing `token`. This is a 330,000 ms zero-provider probe. It does no prepare/capability lookup/provider call/DB business write and does not consume the delegation or writer reservation.
- POST `/api/editorial-v3-cloud`, the identical two-field JSON body, uses the same NDJSON transport. The production paid marker is deliberately `false`; it returns a safe blocked terminal result until the separate real transport gate has passed.
- Both POST forms validate the server delegation before the first frame, immediately emit a numerical `running` frame, emit numerical/status heartbeats every 10 seconds, then emit exactly one safe `terminal` frame when delivery remains connected. Only the final safe stage projection/zero-provider probe result is included. There is no provider body, reasoning, prompt or artifact stream.
- A successful probe terminal frame has `success: true`, `probe: true`, `state: "completed"`, `target_ms: 330000`, numerical elapsed time, `model_request_sent: false` and `reservation_consumed: false`. Record real client elapsed time, first frame, heartbeat cadence and terminal success. An interrupted or missing terminal result is not a pass.
- GET `/api/editorial-v3-cloud?stage_id=...`, with the existing stage nonce in `x-editorial-stage-token`, reads only that exact safe stage diagnostic projection. It never prepares, recovers, calls model metadata, calls a provider or writes. The custom header is a stage nonce, not an owner/service authentication assertion.
- The request body is limited to 1024 bytes. Additional/duplicate query fields, body owner/prompt/model/hash fields and wrong nonces fail closed.

The nonce expires exactly at the original run/delegation expiry. Every capability entry, including GET, cached POST and probe, requires a valid unexpired delegation and active owner authority. Revocation or expiry denies nonce reads. A normal authenticated-owner MCP replay may return the historical read-only delegation descriptor without preparing or renewing it; historical full-content reconciliation belongs to normal owner readers.

Before expiry, pause/archive permits only safe status readback. Primary `state` reflects that canonical control; `row_state` separately reports the persisted stage state. These controls forbid execution/probing. No whole run, current_version, snapshots, artifacts, author receipt/text, raw provider errors or arbitrary diagnostic fields are returned.

## Single-use and cancellation

Paid execution is guarded by `export const editorialCloudHttpPaidEnabled = false`. No request, header or environment flag enables it. This marker must remain false until the real private cloud HTTP 330-second zero-provider probe succeeds through the intended independent consumer. `maxDuration=360` is only a framework hint, not a Site timeout promise. A mocked timer test is not the real release gate. Probe success alone does not authorize broad provider work; the only existing explicit one-stage owner delegation remains the scope.

If enabled under that scope, a durable exact-byte/control/expiry CAS consumes the delegation before execution. Only the CAS winner calls the ordinary prepared runtime. Started, requested, unknown, completed and failed results can never trigger another paid call. Even an exception before provider invocation does not reset consumption. An ordinary runtime race still shares its original unique attempt receipt.

Request abort and ReadableStream cancellation are combined into the provider/probe AbortSignal. No waitUntil/background job is created. An interrupted client reads the same safe stage while the nonce is still valid, or uses normal owner readers after expiry/revocation. It never changes stage, token, reservation or retries payment.

## Offline verification

`node tests/editorial-cloud-http-v3.mjs` uses only synthetic SQLite records, mocked strict runtime/provider and simulated time. The production marker remains false; a separate in-memory transpiled module changes it only for the mock single-use/CAS path. No network, real credential, provider payment, browser, build, deployment or production DB is involved. Tests cover exact owner delegation, ordinary-claim denial, foreign/body identity rejection, immutable binding races, expiry/revocation, safe diagnostic suppression, concurrent delegation and starts, zero-provider probe, runtime signal forwarding, route framing and input limits.
