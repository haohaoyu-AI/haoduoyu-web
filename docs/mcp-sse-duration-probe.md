# Zero-fee request-scoped MCP SSE duration probe

This isolated candidate adds one tool, `probe_mcp_sse_duration`, to the existing
`/mcp` endpoint. It is not deployed. No live connector request has been made.
Independent review and a separately authorized deployment precede any real
330-second acceptance check through the already-connected App connector.

## Scope and bounds

- Arguments are exactly `{ "duration_seconds": 310 }` through `330`, inclusive,
  and the value must be an integer. No caller prompt, model, owner, URL,
  credentials, job, token limit or editorial run parameters are accepted.
- Existing platform-owned `owner(request)` authentication and Origin checks run
  before this handler. There is no cookie/service-token impersonation or new
  permission. The new module has no imports and cannot access a provider or DB.
- All existing tools, paid execution routes, reservations, snapshots, grants,
  failure receipts and discovery/initialize envelopes are unchanged. The only
  discovery addition is the new read-only diagnostic tool.
- The requested duration is the fixed deadline, at most 330,000 ms from the
  handler's monotonic start. Progress never resets it. There is no retry,
  queue, third-party service, `waitUntil`, detached promise or background job.
  Timers belong only to this live response and are immediately cleared on EOF
  or disconnect. Scheduling/network delay is recorded honestly in `elapsed_ms`;
  a process suspended by its host cannot guarantee physical delivery by an exact
  wall-clock instant. This is not a hosting-duration guarantee.

## Wire behavior

The client must accept both `application/json` and `text/event-stream`. A valid
probe uses request-level `text/event-stream; charset=utf-8`, `Cache-Control:
no-store` and `X-Accel-Buffering: no`.

The server immediately enqueues an SSE opening comment. It enqueues a heartbeat
comment every ten seconds while still before the deadline. Comments are not
JSON-RPC messages. No event IDs, `retry`, endpoint event, session IDs, GET stream
or resumption store are created. Existing framework GET/DELETE behavior is not
expanded. `Last-Event-ID` and `Mcp-Session-Id` do not restore a probe.

If this request actually supplies a string/integer `params._meta.progressToken`,
each heartbeat also carries `notifications/progress` using that unchanged token.
Its strictly increasing value counts probe notifications; the message describes
elapsed transport waiting, and no percentage or model progress is asserted.
Without the client's token there are only comments until the final response.

At the deadline exactly one SSE message contains the original JSON-RPC `id` and
a `result` with `resultType: "complete"` and text content containing measured
diagnostics. The stream closes immediately afterward. There are no further
notifications. The final payload includes zero provider requests and zero
business DB writes; offline guards verify both, rather than exercising real
storage or paid providers.

## Protocol version and cancellation

The existing legacy `initialize` result remains `2025-03-26`; its
`server/discover` result still advertises `2026-07-28`. Discovery does not prove
which version a particular request uses.

For a `2026-07-28` probe, the handler validates:

- `MCP-Protocol-Version: 2026-07-28` matches
  `params._meta["io.modelcontextprotocol/protocolVersion"]`
- `Mcp-Method: tools/call` matches the body method
- `Mcp-Name` matches the tool name, including strict UTF-8 Base64 sentinel decoding
- per-request `io.modelcontextprotocol/clientCapabilities` is an object

Required header/body mismatches return HTTP 400/code `-32020`. Unsupported
versions return HTTP 400/code `-32022` with supported/requested versions. Probe
parameters are checked separately with `-32602`.

A request with no version header and no version metadata is explicitly recorded
as the permitted legacy `2025-03-26` assumption. An explicit supported legacy
header is recorded separately. Neither is mislabeled as negotiated 2026.

For actual 2026 requests, either response-stream cancellation or Request abort
immediately stops this request, clears both timers and logs `cancelled`, without
a final reply or another message. This implements that revision's disconnect
cancellation rule and no-resumption model. Legacy disconnect is labeled
`transport_closed`, not falsely described as 2026 protocol cancellation; its
ephemeral diagnostic wait is also disposed. No editorial work is involved.

## Measurements and live acceptance

Safe per-request logs use a generated non-business `probe_id`, timestamps,
actual elapsed time, validated version/header/meta or legacy assumption source,
whether a client progress token exists, heartbeat/progress counts and whether
the final was enqueued and server stream ended. Logs never contain owner
identity, JSON-RPC request ID, the progress token, caller cancellation reason,
credentials, request body, private article data or upstream errors.

`server_first_byte_enqueued_elapsed_ms` measures the first server enqueue only.
It is not client-observed TTFB and does not prove that a proxy forwarded bytes.
The later real acceptance check must independently observe the same connector's
first-byte arrival, actual wall-clock duration, final matching ID/result type
and EOF, and correlate these with the server terminal log. A timeout, disconnect,
buffered response or missing final result remains a failed/inconclusive
transport check. Even a successful probe does not establish paid-generation
duration, provider limits, token capacity or durable-executor availability.

## Offline verification

`node tests/mcp-sse-probe.mjs` uses a mock monotonic clock and mocked timers,
plus provider/network/domain/DB denial guards. It covers:

- owner/Origin/body bounds; exact envelope/arguments; invalid duration/token
- modern version/header/meta/Accept validation and Base64 name encoding
- 310, 311, 329 and 330 seconds; immediate comment and ten-second heartbeats
- genuine string, empty-string and numeric-zero progress tokens; monotonic
  progress; no token means no progress notifications
- one original-ID complete final result followed by EOF and zero active timers
- Request abort/body cancellation with no final or later work; post-EOF abort
- legacy version reporting, ignored resume/session headers and independent
  fresh probe IDs; unchanged old discovery and initialize responses
- exactly zero provider/network/domain calls and business storage writes

Existing offline regression suites for the MCP contract, V3 long transport,
topics and retired-generation protections also run. No new package is required.

## Official references

- [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server)
- [MCP 2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP 2026-07-28 progress](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress)
- [MCP 2026-07-28 cancellation](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation)
- [MCP 2026-07-28 schema](https://modelcontextprotocol.io/specification/2026-07-28/schema)
