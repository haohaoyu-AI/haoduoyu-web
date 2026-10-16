# Normal daily writer transport

The authenticated owner delegates only the current claimed Claude writer stage of an initialized daily run under its original active V3 authority. It does not allocate a stage, grant another attempt, change generation inputs, increase persistent access, or reuse a historical continuation.

`delegate_editorial_v3_cloud_http_once` freezes the complete run, stage and authority, prior independent artifacts and provider receipts. The nonce is stored only as a SHA256 digest in the new delegation. The original nonce remains in the original stage as before. An exact repeat is an owner-only historical read, including after expiry.

The existing private `/api/editorial-v3-cloud` NDJSON endpoint dispatches to the separate daily table. Its nonce read/probe/preflight/execute APIs accept only stage ID and nonce, never an owner identity, prompt, model or run replacement. Readback projects safe stage diagnostics only.

Before durable delegated→started consumption, the transport reuses strict runtime preparation and compares complete original rows and every prior artifact/receipt at the SQL mutation boundary. JSON row bindings keep D1 bind count bounded as necessary issue rounds accumulate. Runtime owns the existing unique provider reservation. A lost or started request never resets the delegation, including failure before the provider request. An aborted request forwards its signal to the existing runtime.

Existing fixed body/revision and separately authorized failed-writer scopes, tables and constraints remain unchanged. Ordinary daily delegation rejects runs with any exceptional continuation. Workflow tests and agent writers are excluded.

## Validation required

This change was prepared without starting Node, TypeScript, workerd, a build, browser or production call. Static whitespace checks do not establish runtime correctness or production acceptance. In the authorized execution window run:

- `node tests/editorial-daily-http-v3.mjs`
- `node tests/editorial-cloud-http-v3.mjs`
- `node tests/editorial-revision-http-v3.mjs`
- `node tests/editorial-v3-runtime.mjs`
- `node tests/editorial-v3-cancel-safety.mjs`
- `node tests/editorial-v84-load-performance.mjs`
- `node tests/mcp-contract.mjs`
- `npm run lint` and the required TypeScript/build checks

Apply migration 0027 before using the new daily router. Then validate the same private long HTTP endpoint with its zero-provider probe and read-only preflight before a genuinely authorized real initial stage. No production test, release or paid interaction is claimed here.
