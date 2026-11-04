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
