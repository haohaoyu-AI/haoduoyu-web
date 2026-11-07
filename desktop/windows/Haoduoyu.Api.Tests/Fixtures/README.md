# Current Worker contract fixture

`worker-contract-c30a8a9.json` was generated from the exact detached source
`c30a8a956715b6ea809db4b87c0f4fcddf8f61de`, the source whose static OpenAPI matched
the public production asset during this task's audit. It contains only newly generated
synthetic records. It contains no passwords, session cookies, CSRF or bootstrap secrets.

The generator uses that source's existing `tests/harness.mjs`, a temporary Miniflare D1,
and its compiled `Worker.fetch` entrypoint. The harness denies outbound services, and
the generator additionally blocks global fetch to non-loopback hosts. The runtime and
temporary D1 were disposed after generation. C# then applies the current desktop route,
mutation and receipt validators to the actual captured Worker responses. This is a
cross-language contract check, not an interactive Windows or production HTTP test.

The final fixture contains 53 requests: 40 successful mutations, 3 real CAS conflicts,
and 10 reads. Two additional assertions use the real note/memo receipts and current
entities to verify content hashes. Unknown nested JSON, unknown versus zero metrics,
label removal without body loss, no-op saves, both legacy note categories, and reversible
memo deletion are included. The generator derives Beijing today from the server because
the current API permits new note entries only on that day.

This test found and corrected the unmounted `/note-labels` and `/note-month` aliases.
The actual routes are `/api/v1/note-entries/labels` and `/api/v1/note-entries/month`.
It also verifies the server's sorted label representation and canonical
`timings.finished_at`, while retaining all unknown nested timing fields.

Replay the captured fixture without Node, D1, network access, or a production request:

```sh
dotnet run --project desktop/windows/Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj -- --worker-contract desktop/windows/Haoduoyu.Api.Tests/Fixtures/worker-contract-c30a8a9.json
```

To regenerate, create a separate worktree at the exact source commit; do not switch the
main desktop or Android checkout. In that isolated worktree, run the locked setup and
build:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

From the desktop repository, supply the isolated worktree path and output explicitly:

```sh
node desktop/windows/Haoduoyu.Api.Tests/generate-worker-contract.mjs /path/to/isolated-worktree desktop/windows/Haoduoyu.Api.Tests/Fixtures/worker-contract-c30a8a9.json
```

On a managed Linux executor with a read-only home directory, use a writable task-specific
`npm_config_cache`, `DOTNET_CLI_HOME` and `NUGET_PACKAGES`. No permission change, network
route change, TLS downgrade or production credential is needed. The normal API suite is
still run separately with `dotnet run --project desktop/windows/Haoduoyu.Api.Tests`.

## Complete read and native form contracts

The earlier 53-request capture is preserved as historical evidence.
`worker-contract-complete-reads-c30a8a9.json` adds a complete route read matrix and
contains 82 requests: 40 successful mutations, 3 real CAS conflicts, 39 reads and the
same two real receipt/hash confirmations. Every successful GET also passes the desktop
`BusinessReadSchema`; partial envelopes cannot be cached as empty lists. Regenerate
this expanded capture by adding `--all-reads` after the existing generator's output path.

`review-form-contract-c30a8a9.json` uses the actual shared native
`ReviewFormLogic.New/Build`, compiled into the portable test runner from the same file
used by the WPF controls. Each command is generated in C#, sent to the isolated current
Worker/D1, then rebuilt again in C# during replay. The captured payloads are not manually
substituted approximations. Eight resource kinds each cover creation, edit, exact no-op
and stale-hash conflict; legacy playbook defaults have an additional exact no-op.

The form capture contains 52 requests: 25 successful saves, 8 real hash CAS conflicts,
9 exact no-ops included in those saves, and 19 reads. Fifteen additional invalid forms
are rejected locally, including incomplete native table rows, out-of-range percentages,
non-integer counts, bad references, unknown rule/evidence fields and overlong daily
summaries. Valid zero, null, `1e-7` and `1e-29` values remain distinct; unknown nested
snapshot/report metadata survives edits unchanged. The test does not show a GUI or
claim interactive Windows acceptance.

After building the portable test project, generate the form capture with the compiled
test assembly and normal .NET host:

```sh
dotnet build desktop/windows/Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj
node desktop/windows/Haoduoyu.Api.Tests/generate-review-form-contract.mjs /path/to/isolated-worktree desktop/windows/Haoduoyu.Api.Tests/Fixtures/review-form-contract-c30a8a9.json desktop/windows/Haoduoyu.Api.Tests/bin/Debug/net10.0/Haoduoyu.Api.Tests.dll dotnet
```

Replay either capture without Node, network access, or a production request:

```sh
dotnet run --project desktop/windows/Haoduoyu.Api.Tests -- --worker-contract desktop/windows/Haoduoyu.Api.Tests/Fixtures/worker-contract-complete-reads-c30a8a9.json
dotnet run --project desktop/windows/Haoduoyu.Api.Tests -- --review-form-contract desktop/windows/Haoduoyu.Api.Tests/Fixtures/review-form-contract-c30a8a9.json
```

The phase-two report records the exact fixture and source hashes. Regenerate form
vectors after changing the shared form logic; its source hash is checked during capture.

## Append-only AI work reports

`ai-report-contract-c30a8a9.json` separately captures six actual current-source Worker
requests: an immutable creation, same-UUID/body replay, different-content conflict,
and three complete-page reads. Author and content are explicit synthetic test inputs;
no model/provider is called and no real work or identity is fabricated. DELETE, PATCH
and an unsupported single-record GET are absent from the desktop API allowlist.

The normal API suite additionally verifies a complete legal escaped 100-record page
above 2 MiB and rejects a page above the route-specific 4 MiB ceiling. Other routes retain
the 1 MiB ceiling. No page is silently truncated to fit a client budget.

```sh
node desktop/windows/Haoduoyu.Api.Tests/generate-ai-report-contract.mjs /path/to/isolated-worktree desktop/windows/Haoduoyu.Api.Tests/Fixtures/ai-report-contract-c30a8a9.json
dotnet run --project desktop/windows/Haoduoyu.Api.Tests -- --ai-report-contract desktop/windows/Haoduoyu.Api.Tests/Fixtures/ai-report-contract-c30a8a9.json
```

## Unicode save-receipt recovery regression

`unicode-receipt-contract-c30a8a9.json` captures ten new real requests against the
same exact isolated Worker and temporary D1: one Beijing-date read, plus creation,
receipt and current-entity reads for a note, memo group and memo note. Synthetic
contents include non-BMP emoji, a ZWJ sequence, accented text, quotes, backslashes,
U+2028/U+2029 and supported line controls. It contains no session material or real
user records, and the disposed runtime made zero external fetch attempts.

This capture reproduced a receipt hash mismatch before the correction: even the
relaxed .NET JSON encoder escapes surrogate pairs while the source's
`JSON.stringify(stable(row))` emits valid pairs literally. The corrected verifier
matches the source's ordinal key sorting and string quoting. Replay verifies all
ten response schemas/mutations, three exact receipt hashes, three changed-content
rejections and three missing-receipt unconfirmed outcomes: nineteen assertions.

```sh
node desktop/windows/Haoduoyu.Api.Tests/generate-unicode-receipt-contract.mjs /path/to/isolated-worktree desktop/windows/Haoduoyu.Api.Tests/Fixtures/unicode-receipt-contract-c30a8a9.json
dotnet run --project desktop/windows/Haoduoyu.Api.Tests -- --unicode-receipt-contract desktop/windows/Haoduoyu.Api.Tests/Fixtures/unicode-receipt-contract-c30a8a9.json
```

`unicode-receipt-api-report.json` records exact hashes and targeted regression
results. Earlier capture reports remain historical evidence for their original
source versions.

## Native article verification writes

`article-verification-contract-c30a8a9.json` captures actual commands from the shared
`ArticleVerificationFormLogic.SetDone` and `ArticlePipelineFormLogic.FormValues/Build`
against the exact compiled c30 Worker and temporary synthetic Miniflare D1. The
21 responses cover seven reads, five successful save responses (including one exact
idempotency replay), two version/idempotency conflicts, and seven permission/body
budget denials. Native merged scalar edits and unknown nested metadata survive;
the documented minimal verification-only body also preserves omitted scalars.

The capture issues two temporary scoped keys through the existing isolated harness;
only their non-secret permission categories are saved. No token, Cookie, CSRF material
or real record is included. Source constraints, auth, permissions and normal limiters
are unchanged, and the runtime is disposed. Nine actual shared-form negative vectors
reject invalid positions, null/empty/malformed lists, reordered or changed metadata,
non-boolean replacement state and invalid UTF-16 evidence.

The portable replay also uses the actual fixed-origin transport and sync engine with
an in-memory synthetic handler/store: a lost response leaves the immutable request
Unknown; matching current GET content remains Unconfirmed, and later sync/reopening
never resends or infers success. This is distinct from physical encrypted-file or
Windows device recovery acceptance. No article exact-operation receipt API exists.
Historical idempotency responses reauthenticate actor/write/CSRF before returning an
actor+key match, without rerunning article-account authorization; the existing scope
precheck remains, and no atomic expected-scope contract is claimed.

```sh
dotnet build desktop/windows/Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj --configuration Release
node desktop/windows/Haoduoyu.Api.Tests/generate-article-verification-contract.mjs /path/to/isolated-worktree desktop/windows/Haoduoyu.Api.Tests/Fixtures/article-verification-contract-c30a8a9.json desktop/windows/Haoduoyu.Api.Tests/bin/Release/net10.0/Haoduoyu.Api.Tests.dll dotnet
dotnet run --project desktop/windows/Haoduoyu.Api.Tests --configuration Release -- --article-verification-contract desktop/windows/Haoduoyu.Api.Tests/Fixtures/article-verification-contract-c30a8a9.json
```

`article-verification-report.json` records final source/fixture hashes and counts.

## Native note month history

`note-history-contract-c30a8a9.json` captures nineteen actual business GET responses
from the same exact compiled c30 Worker and a fresh temporary Miniflare D1. The
existing harness performs synthetic bootstrap/login; direct D1 setup uses existing
schemas and leaves constraints, permissions and limiters unchanged. Every captured
GET checks that all synthetic note business tables are unchanged. Session material
and real user records are absent; outbound services are disabled and the runtime is
disposed after capture.

The capture covers all four legacy/new life/work sources on a real leap day, multiple
same-day entries, multi-label and archived-label content, a blank new note, an empty
legacy note that stays excluded, soft deletion, complete empty months, and detail
reads that supply actual edit versions separately from the month summaries. Label
version 2 and the omitted-header fallback remain valid server responses but fail the
native full-label source validator. Empty full-label sets and work notes carrying
only custom labels remain valid. Five malformed queries return 400. Exactly 2,000
items succeed; 2,001 items, excess raw text bytes and excess complete-envelope bytes
each return an explicit 413 with no partial month payload.

Replay uses the actual fixed-origin `WorkbenchApi`, the shared
`NoteHistory.ValidateSource/ParseBaseline` and `NoteHistoryResponse.Validate` rather
than a second schema implementation. Local projection envelopes cannot become full
source baselines. Unicode regression checks distinguish the unchanged 1 MiB network
limit from the larger local JSON encoding budget. `note-history-report.json` records
the exact evidence hashes and measured checks. Current replay passes 77 checks,
including sixteen malformed-success rejections and a state-preservation check with
the actual history model; the ordinary 165-assertion API suite and earlier 82-response
Worker read/write capture also pass. Physical Windows cache encryption,
interactive rendering and device acceptance remain separate checks.

```sh
node desktop/windows/Haoduoyu.Api.Tests/generate-note-history-contract.mjs /path/to/isolated-worktree desktop/windows/Haoduoyu.Api.Tests/Fixtures/note-history-contract-c30a8a9.json
dotnet run --project desktop/windows/Haoduoyu.Api.Tests --configuration Release -- --note-history-contract desktop/windows/Haoduoyu.Api.Tests/Fixtures/note-history-contract-c30a8a9.json
```

## Native read-only media review

`media-review-contract-c30a8a9.json` captures twenty-four actual GET responses from
the exact compiled c30 Worker and a fresh temporary Miniflare D1. Existing synthetic
bootstrap/login and direct D1 setup use the normal schemas. The capture changes no
permissions, constraints, limiters, clock, revision or server cache machinery. Every
business GET compares synthetic business, audit and control-table digests before and
after. It contains no session material or real user records, makes zero external
fetch attempts, and disposes the temporary runtime.

The eighteen successful responses include empty/default, seven-day and thirty-day
overview windows; selected-account reads; top-platform/limit changes that affect only
ranking; true zeros, missing likes versus approvals, partial and mixed coverage,
historical-median attention, and separate daily increments versus latest cumulative
snapshots. Due lists preserve three `(article id, kind)` targets for one article: a
snapshot collected before its target does not complete it. Observation lists use
account/article filters; daily lists preserve account-level and article-level rows,
inclusive date ranges and complete empty results. One linked article detail supplies
actual observations, nodes, timeline and edit version separately from the overview.

Six invalid date/range/period/top queries really return 400 from the source. Five
additional unsupported or duplicate queries are rejected before native HTTP only;
the fixture does not claim server rejection for parameters the old server ignores.
The exact route/query parser is shared with native controls and the transport; this
does not add pagination to the three unpaged lists. Payloads above the unchanged
1 MiB network limit fail whole and cannot replace an old exact-query cache.

Replay uses `MediaReviewQuery`, `MediaReview.Parse/ValidateSource`,
`MediaReviewResponse.Validate` and the actual fixed-origin `WorkbenchApi`. It checks
raw DTO preservation, native zero-request query rejection, malformed-success
rejection and legal Unicode cache encoding. Native summary rows remain read-only;
no non-CAS observation/daily write form or inferred metric write is introduced.
Two additional synthetic compatibility checks retain explicit historical metric
null separately from an absent key and true zero. They do not alter the captured
Worker responses or claim that current metric writes accept null.
`media-review-report.json` records exact hashes and measured validation results.
The current contract replay passes 108 checks; the ordinary 165-assertion API suite
and earlier 82-response Worker capture plus two receipt checks also pass. The latter
is a local replay of historical synthetic responses, not new business writes.

```sh
node desktop/windows/Haoduoyu.Api.Tests/generate-media-review-contract.mjs /path/to/isolated-worktree desktop/windows/Haoduoyu.Api.Tests/Fixtures/media-review-contract-c30a8a9.json
dotnet run --project desktop/windows/Haoduoyu.Api.Tests --configuration Release -- --media-review-contract desktop/windows/Haoduoyu.Api.Tests/Fixtures/media-review-contract-c30a8a9.json
```

Stage 13 uses a separate reviewed source candidate for template archive/restore:
see [template-archive-README.md](template-archive-README.md), its fixed `34bff302`
fixture and `template-archive-contract-report.json`. This does not identify the
currently deployed Worker or change any earlier c30 evidence.
