# One owner-authorized output-contract repair

The owner may allocate one independent linked attempt for the current Claude
`structure_revision` or `fact_revision` whose safe provider receipt completed
but whose application stage is `content_invalid`. The original stage, receipt,
input, claim token and consumed transport stay unchanged. The existing
`editorial_failed_writer_continuations_v3` table is the allocation container;
its database scope is retained for schema compatibility. Its immutable request,
evidence and frozen data distinguish `invalid_output_repair` from the existing
zero-payload technical-failure path. Normal owner tools use the separate
`editorial_v3_one_explicit_invalid_output_repair` confirmation scope.

The server verifies the original authority, model, snapshot, input, complete
buffered receipt, current stage and full lineage. It derives the candidate and
feedback from exact receipt bytes. Valid JSON uses the existing duplicate-key
parser. The only supported malformed form has forced interior quotes in known
single-line prose values: insertion of JSON escape backslashes preserves all
decoded article characters. Ambiguous structural quotes, malformed escapes,
other syntax, invalid article shape or length, and invalid prior reports are
rejected before allocation. This extraction does not accept the revision.

The server freezes the canonical article bytes/hash, original provider text
hash and deterministic machine feedback. The new input retains the original
business context and adds this feedback; it has its own stage identity, round,
sequence, claim token and input hash. The same Claude author must return the
complete legal `{article, decisions, changes}` object. Both the original full
revision contract and exact candidate title/paragraph byte equality remain
acceptance gates. Machine diff diagnostics never become an author ledger.
Independent full-text review still follows successful persistence.

The owner explicitly accepts the additional charge and existing same-run
earlier unknown/late/overlap risks under the active writing authority. Message
IDs and quotations are owner-attested audit, not supplier termination proof or
platform signatures. Complete output does not establish that the call was free.
Lifetime uniqueness applies to owner/source and owner/key across both recovery
types. Exact matching committed requests can only reconcile through fresh
strict history. Changing a key never allocates twice. Authorization, transport
consumption and provider reservation keep all existing live checks and complete
row CAS fences. No request, result, permission or proof is cached across calls.

Requested/unknown, technical failure, incomplete/suppressed output, expired or
stopped authority, noncurrent source, and a source already carrying an output
repair binding cannot enter this path. A failed repair cannot silently unlock a
new candidate or start an automatic retry loop. No old quota, archived scope,
nonce or grant is restored.
