# Read-only credential-pool changes

The normal authenticated-owner `read_editorial_v3` tool may restart its complete
read once when a private server brand proves that successful credential-source
samples had different fingerprints. It rebuilds the DB/history/authority reads,
credential context, memo and output from scratch. A second change still rejects.
The original internal `readEditorialV3` remains a single read; save/recover,
claim/delegate, paid preparation and execution do not receive this retry wrapper.

The brand is held in a private WeakSet. Error messages, matching public fields,
getters and caller arguments cannot create it. Only the prepared-inspector and
editorial-pool fingerprint comparisons create branded errors. Source-read,
decryption and digest errors remain unbranded; reusing a sealed inspector remains
unbranded. Any unsafe inspection or inspection failure in a load pass prevents
that pass from propagating the retry brand, including when a diagnostic read had
already chosen to hide the content. Removing a matching credential afterward
cannot release content that the first pass rejected.

The scanner, encoding/budget limits, ordinary metadata checks, hashes, authority,
lineage and CAS rules are unchanged. Genuine matches remain rejected or hidden.
Repeated verified source changes have a fixed public explanation that the
credential sources changed during validation; this does not assert a credential
appeared in the article.

Offline replay uses the existing 15-stage, normally delegated output-repair
fixture with real source/snapshot/article hashes and synthetic private tokens.
The SQLite adapter and historical authority/old-body verifiers remain explicit
mocks. It proves a concurrent unrelated token can trigger the old safety message;
it does not establish the cause of the transient production read error.

Run `tests/editorial-read-freshness-v3.mjs` with `TEST_SOURCE`,
`TEST_DEPENDENCY_ROOT`, `TEST_AUTHORIZED_FIXTURE`, `TEST_DELEGATED_FIXTURE` and
`TEST_OUTPUT` pointing to their materialized local paths. `TEST_ONLY` selects a
focused case by name. The driver enforces zero application writes, metadata GETs,
provider POSTs and external network calls. Fixture mutation counters are separate.
