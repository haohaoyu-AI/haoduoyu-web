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
