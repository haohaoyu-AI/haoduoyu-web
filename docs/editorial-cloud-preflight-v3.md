# Read-only linked-writer preflight

An existing private stage nonce may call `GET /api/editorial-v3-cloud` with
`stage_id` and `action=preflight`. The nonce remains in the
`x-editorial-stage-token` header. This accepts only an already owner-delegated
linked writer in the existing failed-writer transport table. It does not add
authorization, renew a nonce, grant a stage or enable other transports.

Preflight freshly runs the same bound identity, active authority/control,
lineage, stage prepare and complete consume predicates as POST. The latter are
evaluated by a `SELECT` rather than an `UPDATE`. Prepare may perform the existing
read-only provider model-capability GET. It never sends `/messages`, consumes
the transport, reserves a provider receipt, writes a stage or dispatches work.
Successful preflight is a point-in-time diagnosis; POST independently repeats
all checks and retains its original one-use CAS. No proof is cached.

The response has `preflight`, `check_passed`, `consume_cas_matches` and a fixed
`execution_phase`. The three `diagnostic_*` false flags describe only this
read-only operation. Existing started attempts or receipts remain read-only and
do not enter a fresh paid preflight. A predicate mismatch returns false without
any write. A failed check returns HTTP400 with the existing safe error and a
closed diagnostic: phase, classified code and, when applicable, the existing
binding-check stage/code enum. No exception message, stack, header, nonce,
body or provider data enters the diagnostic.

The same trusted diagnostic is retained on a future POST's outer unknown
terminal and a fixed server log. Transport consumption is `not_attempted`,
`unconfirmed`, `zero_changes` or `committed` according to the local observation.
An update error remains unconfirmed. Neither a diagnostic nor missing output
proves a prior upstream request was terminated or free. Preflight does not
automatically retry any POST or allocate another grant.

Offline evidence reuses a SHA-verified normally authorized V87 fixture with
native hashing/AES, real runtime/lineage and SQLite SQL. Historical authority
and old-body checks are explicitly mocked. The current credential lookahead
source is preserved. One normal readonly success, metadata timeout/unconfirmed
GET failures, credential freshness rejection, and a SELECT predicate race are
verified with zero application writes and zero model/network calls. Two
simulated POST metadata failures verify the outer unknown terminal and fixed
log. These tests do not identify the cause of the earlier production failure.

To reproduce, run `tests/editorial-cloud-preflight-v3.mjs` with explicit
`TEST_SOURCE`, `TEST_AUTHORIZED_FIXTURE`, `TEST_CASES_FILE` (the accompanying
cases text file), and `TEST_OUTPUT`. `TEST_FIXTURE_ROOT` supplies the original
SHA-verified input/snapshot/body fixtures; `TEST_DEPENDENCY_ROOT` can point to an
already installed identical project dependency tree. The authorized fixture has
synthetic private nonces and stays in local test evidence, outside production.
