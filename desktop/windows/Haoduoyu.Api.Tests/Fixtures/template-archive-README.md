# Template archive source contract — stage 13

`template-archive-contract-34bff302.json` captures the compiled Worker at exact reviewed candidate commit `34bff302e128c92f46f00e76d59f9b44b9b7242e`, using that source's official harness and a fresh temporary Miniflare D1 database. This identifies a candidate source contract; it does **not** identify the currently deployed production commit.

There are **89 actual Worker requests**. The portable desktop contract replays **83 captured business responses** through `WorkbenchApi` (21 successful reads, 21 successful mutations, 41 source errors). The other six were also real source requests returning HTTP 400, but the desktop rejects their paths or queries before HTTP. The 61 replayed mutations each have an additional synthetic scope-index GET; these 61 checks are not extra source captures. The portable run passes 282 checks.

The 12 successful archive/restore responses include both version-plus-one state transitions and unchanged-version, same-status replays. Before/after hashes cover template rows, todo rows and template links; revision, audit and idempotency-row counts accompany each sample. GETs, denials and no-op replays preserve all recorded counters. Two concurrent identical archives advance the revision exactly once. The request body contains only a numeric, positive, safe `version` below `Number.MAX_SAFE_INTEGER`; the captured safe-integer upper-minus-one request is syntactically accepted and receives a stale-version 409. This fixture does not claim a successful write at that upper boundary.

The paired active/archived list samples contain different UUIDs. A template's absence from the active list or daily snapshot is not deletion evidence. Its completed todo text, inactive template link and history remain readable after archive. Archived templates cannot create a new linked todo or be added back to an existing one. Restore explicitly returns `archived_at: null`; archive/restore responses do not carry `deleted_at`. Legacy soft delete is separately captured and remains a different operation.

Permission evidence comes from actual synthetic Worker calls: normal owner and second-user logins, owner isolation, public mode, missing or foreign Origin, missing CSRF or public header, API-key and mixed-credential precedence, and disabled public mode. Public calls total 10, including eight write attempts, below the unchanged source limiter. The desktop fake transport verifies payloads and fixed-origin request behavior; it does not independently establish these backend permissions.

The Unknown case explicitly simulates withheld delivery after the harness captures a successful source response. It is not an observed real network failure. Both list GETs help investigate current state, but are independent observations, not an atomic snapshot or an original-operation receipt. `ReconcileAsync` returns Unconfirmed with zero HTTP calls and does not resend or replace the original body/identity. Current matching state does not prove the original operation. Engine and Windows cases separately verify durable queue and cache behavior.

Sixteen mutated successful action responses (wrong entity/state/version, missing fields, soft-delete marker, invalid statistics/date or local flags) and five malformed successful list responses are synthetic negative cases derived from real captured payloads. They are rejected by the actual desktop validators. A synthetic Unicode case verifies local escaped-cache reopening with the semantic budget while the network's original 1 MiB ceiling remains unchanged. These are desktop tests, not invented Worker responses.

Reproduce in an isolated worktree at the exact source commit, using dependencies matching its unchanged lock file. Here the existing workspace dependency cache was reused only after both lock hashes matched; no new package or artifact download was needed:

```bash
# In the separate candidate source worktree:
node scripts/build.mjs
node --test tests/todo-notes-archives.test.mjs tests/public-business.test.mjs

# In the desktop repository:
node desktop/windows/Haoduoyu.Api.Tests/generate-template-archive-contract.mjs \
  /path/to/exact-34bff302-worktree \
  desktop/windows/Haoduoyu.Api.Tests/Fixtures/template-archive-contract-34bff302.json
dotnet run --project desktop/windows/Haoduoyu.Api.Tests -c Release -- \
  --template-archive-contract \
  desktop/windows/Haoduoyu.Api.Tests/Fixtures/template-archive-contract-34bff302.json
```

The generator asserts the exact commit and unchanged tracked source, uses ordinary synthetic bootstrap/login/key issuance, blocks non-loopback fetches, retains permissions/constraints/limiter/clock, records no session cookie, CSRF token, API token or password, and disposes the temporary runtime. Random synthetic IDs and timestamps change on regeneration. No production requests, source edits, deployments, device installs, artifact downloads or historical CI-log retries were performed. The adjacent report records hashes and completed validation. Live production compatibility, Windows runtime acceptance and installation remain separate acceptance steps.
