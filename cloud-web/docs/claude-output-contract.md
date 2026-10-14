# Claude outline output-bound contract

This change is limited to the new outline-review transport. Legacy daily, V2,
manual, stepwise text snapshots, quota scopes and 14000-token calls are unchanged.
No deployment, live provider lookup or charged provider probe was performed.
The tests below supply every database and fetch response locally.

## Server entry points

- `readClaudeOutputCapability(owner, expectedModel)` returns `ClaudeOutputCapability`.
- `requestOutlineClaudeOnce(owner, snapshot, claimTokens, onProgress?)` makes at most
  one Messages request and returns its safe result. `snapshot` contains exactly
  `model`, `max_output_tokens`, `system_prompt`, and `user_prompt`.
- `onProgress` receives only numeric accounting, a credential-checked requested
  model, a safe returned model when known, and fixed diagnostic fields. The caller
  can persist accounting before it commits the final result. Callback errors never
  expose their message and do not trigger a retry; `progress_persist_failed` records
  the failure for the caller. The final result retains the available accounting.

The caller must reserve its unique durable attempt before calling Messages. It
must construct the server-trusted frozen snapshot from the recorded capability;
a client-provided arbitrary `max_output_tokens` must not reach this transport.
The transport does not independently reserve quota, alter an old record, or retry.

## Read-only gateway capability

The only runtime capability request is:

`GET https://app.yylx.io/v1/models`

It uses the owner's server-side decrypted configured key, a 20-second timeout,
manual redirects, and a 200000-byte metadata bound. A redirected or different final
URL is rejected. It never follows metadata links or sends a paid Messages probe.
Configuration must be enabled and match the expected exact model ID.

A supported response has exactly one entry in `data` whose `id` equals the expected
ID. The explicit relay limit is the entry's own `max_output_tokens`, as a positive
JavaScript safe integer. Numeric strings, booleans, null, zero, negatives, fractions,
duplicate decoded JSON keys, duplicate model IDs, more than 4096 entries, paginated
incomplete catalogs, and untrusted credential-bearing metadata fail closed.
Context-window sizes, `max_tokens`, arbitrary nested capability shapes and similar
names are not interpreted as output-token evidence.

### Narrow documented upstream fallback

An approved exception applies only to exact `claude-opus-5-5`, only if that exact
ID exists once in the authenticated YYLX catalog, and only if no explicit output
limit is supplied. The frozen request bound is then **128000**, with:

- `relay_limit_verified: false`
- `evidence_kind: "documented_upstream_bound"`
- Official upstream source: https://platform.claude.com/docs/en/models/opus-5-5/overview
- Exact YYLX API-ID mapping source: https://yylx.io/blog/2026/09/23/claude-opus-5-5-vs-opus-5-vs-fable-5/
- YYLX Anthropic gateway-base source: https://docs.yylx.io/access/claude-code

This is an upstream documented request bound, **not a confirmed YYLX output limit**.
The exact-model documentary sources were verified by the coordinating task. This
adapter contains no network fetch to these documentary pages. Other models do not
inherit the exception. A present invalid limit or an unsupported nested/output-limit
field blocks the exception rather than silently overriding contradictory metadata.
An explicit valid relay `max_output_tokens` takes precedence, even below 128000.

Both evidence paths return `model`, `max_output_tokens`, `source_url`,
`metadata_source_url`, `checked_at`, `relay_limit_verified`, `evidence_kind` and
`capability_sha256`. The fallback additionally returns `provider_mapping_source_url`
and `provider_base_source_url`. The SHA-256 covers the entire returned object before
adding `capability_sha256`, with the original insertion order preserved. `checked_at`
is the server's catalog observation time. The snapshot must retain these distinctions
and must not display a documented upstream bound as a measured relay maximum.

If there is no supported evidence, the function throws the constant
`CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED`; it does not guess, claim an unlimited cap,
borrow another model's limit or test candidates with paid calls.

## Messages and accounting

`POST https://app.yylx.io/v1/messages` uses `max_tokens` from the frozen numeric
`max_output_tokens`. It uses manual redirects, the existing Anthropic-compatible
headers, `stream: true`, and a 300000 ms overall deadline. The outer NDJSON lifecycle belongs
to the caller. Neither the API key nor claim tokens are prompt data.

There is no new 14000-token or 50000-character text cap. The new body reader has a
separate 16 MiB memory-safety ceiling; the shared credential inspector is bounded
and may fail closed on an excessively complex or oversized payload. These are
local safety boundaries, not claims about model capability. Existing body readers
remain untouched.

Successful output requires a successful HTTP response, `stop_reason: "end_turn"`,
and nonempty text. The response returns `state`, `text`, `raw_response`,
`partial_text`, `raw_partial_response`, `requested_model`, `returned_model`, `usage`
and `diagnostic`; failed results also return a fixed `error`.

Accounting uses only finite, nonnegative safe-integer JSON numbers. It never coerces
provider text to numbers. Complete top-level `usage` objects found in a bounded
body prefix can be persisted before the body finishes, including interrupted
responses. Final parsing captures usage appearing later in the body. No provider
text, nested usage objects, raw headers, errors, credentials or claim tokens are
passed through the progress callback. Credential-bearing bodies retain only safe
numeric accounting and fixed diagnostics; raw/text/returned-model fields are null.

An HTTP 400 yields `upstream_parameters_rejected` and explicitly reports that the
requested model output bound or other parameters may be unsupported. A `max_tokens`
stop yields `output_truncated`. Neither means an application quota was exhausted.
Both stop after the one authorized request and retain safe accounting and available
safe partial response. Neither changes the bound, retries, or probes alternatives.
The user-authorized attempt must be reconciled using the caller's attempt record.

## Fixed safe errors

The following constants are exported from `lib/claude.ts` and
`lib/claude-model-capability.ts`:

- `CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED`
- `CLAUDE_OUTLINE_CONFIGURATION_CHANGED`
- `CLAUDE_OUTLINE_INPUT_INVALID`
- `CLAUDE_OUTLINE_INPUT_UNSAFE`
- `CLAUDE_OUTLINE_RESPONSE_UNSAFE`
- `CLAUDE_OUTLINE_REQUEST_FAILED`
- `CLAUDE_OUTLINE_PARAMETERS_REJECTED`
- `CLAUDE_OUTLINE_OUTPUT_TRUNCATED`

No caught provider, database, crypto or callback error message is interpolated into
a returned error. Request IDs, arbitrary provider error codes and headers are not
used as public diagnostics. Raw responses are returned only after inspection.

## Local verification

Run `node tests/claude-outline-provider.mjs`. Its fetch has no route to real network
access. It covers explicit metadata limits, the exact-model fallback and provenance,
missing/invalid/ambiguous metadata, source/redirect pinning, fixed safe errors,
configuration changes, dynamic Messages caps, prompt preservation, long output,
partial reads, usage persistence, credential escapes and nested echoes, malformed
usage, HTTP 400, truncation, timeout, and progress-callback failures.

Run `node tests/stepwise-text.mjs` to check that the legacy stepwise path still uses
its own unchanged 14000-token snapshot and safety rules.


## Streaming transport repair (offline)

Only the reviewed-outline transport requests SSE. Legacy daily/manual/stepwise
transport source remains byte-for-byte unchanged. There are no new provider URLs,
redirects, network-setting changes, fallback model calls or automatic retries.
The frozen 128000-token documentary bound is not lowered.

The actual response Content-Type selects the protocol: `text/event-stream` is
parsed as SSE; `application/json` retains strict Messages JSON compatibility.
Other successful media types fail closed. A JSON body is never treated as an SSE
completion. HTTP errors retain safe actual body/status diagnostics, including 524.

SSE decoding handles split UTF-8, BOM, LF/CRLF/CR, comments and multiline data.
Named events must match their JSON type; duplicate JSON keys fail closed. Block
indexes/lifecycles and the final message_delta/message_stop order are checked.
Unknown future events confer no completion evidence. Unsupported content blocks or
delta types fail closed; text, thinking/signature and redacted-thinking blocks are
explicitly supported. Cumulative usage merges only
present numeric fields, preserving input accounting from message_start. Completion
requires end_turn, nonempty text, message_stop, and a clean end of stream. An EOF,
network loss, error event, malformed frame, missing block stop or missing
message_stop never produces a completed article. Safe partial text and original
SSE wire text are retained separately on failure. Credential checks include decoded
events, keys, same-field strings and concatenated block-initial/delta fragments,
preventing split credential echoes. Future attempt diagnostics/progress include
`transport_version: "anthropic_sse_v1"` and `request_stream: true`; old snapshots
and hashes are not rewritten.

Limits: 300000 ms overall headers/body/progress deadline, 16 MiB actual received
bytes, 1 MiB SSE frame characters, fatal invalid UTF-8. Overflow counts received
bytes but never appends an over-limit chunk. These remain local safety boundaries,
not reduced model token limits. The existing bounded credential inspector can
also fail closed for excessive input. Numeric usage updates are persisted as they
arrive; no streamed prose or raw provider objects enter the progress callback.

Normal outline-run UI exposes only whitelisted diagnostics: code, HTTP status,
media type, response bytes, stop reason, message_stop receipt and elapsed time.
It adds no retry button. Both old failed attempts and approved snapshots remain
untouched. Any future paid retry requires a separately approved immutable
one-attempt authorization naming its failed parent and frozen snapshot hash,
including explicit acknowledgement of possible duplicate billing. This repair
neither creates that authorization nor consumes it.

Official references verified for this repair:
- https://platform.claude.com/docs/en/build-with-claude/streaming
- https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/

Additional verification: `node tests/outline-run-diagnostics.mjs` and SSE cases in
`node tests/claude-outline-provider.mjs`. All provider calls in tests are local
fixtures; no real model request or deployment is performed.

## V3 trusted provider deadline and failure classification

V3 writer execution explicitly supplies a 900000 ms local provider deadline. Its trusted server execution option may select an integer from 300000 to 1800000 ms (5–30 minutes). HTTP POST/tool input cannot supply this option; it is not part of frozen model input or the Messages payload. Legacy/shared callers continue to use 300000 ms unless explicitly using this trusted buffered execution option. No token capability, content-length gate, reservation, attempt identity or automatic retry permission changes.

The provider bound still covers headers, streamed body and progress persistence. Caller cancellation remains effective. The private cloud route maxDuration = 2100 is only a framework hint allowing the supported maximum plus preflight/persistence; it is not proof that the Site or supplier will allow that runtime. A consumer must budget beyond the selected provider deadline for preflight and final receipt persistence, normally at least 1200 seconds for the default 900 seconds, or 2160 seconds for the supported maximum 1800 seconds. A lost caller connection does not authorize another request.

Buffered failures always discard incomplete text/raw. Plain stream_incomplete plus a local deadline now reports code timeout, and explicit caller cancellation reports aborted. response_suppressed remains true and no incomplete fragment becomes an article. Observed credential_match, incomplete_escape, invalid_utf8, protocol_invalid and budget_exceeded keep unsafe_response precedence, including deadline races. A known decoding/protocol error is not rewritten to timeout by the read wrapper. Numeric provider_timeout_ms and boolean provider_deadline_fired are allowlisted diagnostic evidence and are generated by the server, never taken from provider metadata.

The stored failed 6506 attempt and unknown 496c attempt remain immutable. This patch creates no retry path, authorization, stage, reservation or real provider call. A completed article still requires message_stop, complete EOF safety inspection, end_turn, exact model/input provenance and the existing 2000–3000-character contract. The historical failed packet has no preserved complete author text and cannot be reconstructed from usage or heartbeat evidence.
