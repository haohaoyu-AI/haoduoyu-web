# Private todo-note source contract — stage 14

`todo-note-contract-34bff302.json` contains **82 actual compiled Worker requests** against the exact reviewed candidate `34bff302e128c92f46f00e76d59f9b44b9b7242e`, using its official harness and a fresh temporary Miniflare D1 database. The candidate is not asserted to be the current production commit. All mutations affect synthetic records only.

The native contract replays **49 captured business responses** through `WorkbenchApi`: 11 successful reads, 23 successful mutations (15 dedicated note responses), and 15 source error responses. The other **33 actual source requests** independently returned invalid-input or unsupported-method/path errors and are rejected by native request validation before HTTP. Each of the 49 replays establishes a synthetic private session through the normal `RestoreSessionAsync`/`auth/me` flow; the 38 mutations also perform a scope-index GET. Those 87 supporting handler calls are not extra source captures. Backend permission evidence comes from the original real synthetic Worker calls; fake private transport replays validate payloads and request behavior, not a new backend permission grant.

The official action is only `PATCH /api/v1/todos/{strict UUID}/note`, without query, with exactly `{note,version}`. `note` is preserved as supplied: no trim, newline conversion or Unicode normalization; at most 4000 UTF-16 code units, well formed, allowing TAB/LF/CR but excluding the other C0 controls and DEL. The 4000-unit source case contains Chinese and supplementary characters and exceeds 4000 UTF-8 bytes. Invalid surrogate, length, control, type, version and extra-field cases come from actual source responses.

Every successful note response is the complete current todo with request version **plus one**. Same text at the current version still advances it. Only an exact previous-version/current-note match is a no-write conditional replay; it also returns request-plus-one, not the same version. Clearing explicitly sends an empty string, and source success **omits** the note field. Missing note is accepted as clear only in that exact action context; a null field or missing nonempty note is rejected. Missing note in a legacy generic GET remains compatible and does not by itself prove an empty historical value.

A separately identified fresh temporary runtime supplies the final two actual captures. Direct synthetic setup gives an independent todo version 1 with an already matching note; a normal completion PATCH makes version 2/completed true, then the old version-1 note PATCH returns that exact current record without another write. This is valid conditional replay: other fields may have legitimately changed since the earlier baseline. Native validation must not invent baseline-equality restrictions that reject this full current record. All original 80 sample values, IDs and dates were preserved when this proof was appended; the fixture explicitly identifies the additional runtime and its normal private-session owner.

The source fixture verifies unchanged original text/date/completion and template association for an ordinary note save. A later note after a separately archived template preserves `template_id`, while legitimately reflecting the current `template_version` and `template_active`. Concurrent different notes produce one success and one conflict; concurrent identical notes produce two request-plus-one responses with only one revision increment. Individual concurrent request windows may observe the other request's commit, so they are explicitly marked concurrent and are not misreported as unchanged per-request global digests. GETs, ordinary errors and conditional replays otherwise retain recorded todo/template/link hashes and revision/audit/receipt counts.

Permissions are unchanged: normal private owner session writes succeed; another owner, key-only, mixed key/session, missing CSRF, foreign Origin, expired/malformed cookie and anonymous public requests are denied. The note PATCH is absent from the public allowlist. The three source public calls comprise two denied PATCH attempts and one successful GET of an existing note. No limiter, clock, constraint or permission logic was changed. The native guard rejects public or locally expired identity before even a scope GET; if a cookie expires during the scope check, it stops before the business write. A server 401 remains an error without switching the client to public mode.

The Unknown sample deliberately withholds a captured successful response from a simulated caller. This is a labelled delivery simulation, not an observed real network failure. A matching current GET is not an exact-operation receipt. Automatic reconciliation returns Unconfirmed with zero HTTP calls, and does not resend or replace the original operation. Durable pending operations, shared resource fences, drafts and cache preservation are covered by separate Core and Windows suites; this portable run does not claim Windows runtime execution.

The portable native tests also mutate actual payload copies into 21 malformed successful action responses and four malformed dated-todo GET responses. These are synthetic validation negatives, not invented Worker behavior. They cover wrong entity/version/state, trimmed or normalized text, illegal clear shape and incomplete records. Additional native cases cover private identity, scope, cancellation, duplicate JSON fields and numeric request notation. All source and native network size limits remain unchanged.

Reproduce with the unchanged candidate source and its matching dependency lock (the existing trusted workspace dependency cache was reused; no artifact download was performed):

```bash
# In the separate exact-source worktree:
node scripts/build.mjs
node --test tests/todo-notes-archives.test.mjs

# In the desktop repository:
node desktop/windows/Haoduoyu.Api.Tests/generate-todo-note-contract.mjs \
  /path/to/exact-34bff302-worktree \
  desktop/windows/Haoduoyu.Api.Tests/Fixtures/todo-note-contract-34bff302.json
dotnet run --project desktop/windows/Haoduoyu.Api.Tests -c Release -- \
  --todo-note-contract \
  desktop/windows/Haoduoyu.Api.Tests/Fixtures/todo-note-contract-34bff302.json
```

The generator asserts exact HEAD and unchanged tracked source, creates users through the official synthetic fixture pattern followed by real logins/key issuance, blocks non-loopback fetches, captures no cookie/CSRF/API token/password, and disposes the runtime. Regeneration changes random IDs and timestamps. The optional third argument `--append-completion-replay` instead verifies an existing original 80-sample fixture and its source hashes, preserves those sample values, and appends only the two separately identified real requests in a fresh runtime. No production business requests, production migrations, deployments, device installs, artifact downloads or denied CI-log retries were performed. The adjacent report records final hashes and verification; live production compatibility and Windows runtime/signature/installation acceptance remain separate.
