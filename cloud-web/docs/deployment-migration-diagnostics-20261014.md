# V160 migration deployment diagnostic — 2026-10-14

> Later cloud follow-up: [source comparison, pinned execution contracts and eight-change acceptance](cloud-continuation-acceptance-20261014.md).
> The exact V160 source is now available and matches the current migrations.
> Pinned Wrangler/Drizzle on isolated workerd D1 pass; this does not establish the Sites job contract or live partial state.
> The evidence below preserves the earlier observation time.

## Current outcome

The eight-change source is available in this repository. The imported snapshot
commit is `d7a55f83d9c0deb4296abe3feefd4d0983469df8`; its provenance names cloud
source `69f4e4f3d7afd75a4b16e1be059b6fa58e72cf24`. All 941 imported file bytes
were verified against the original import manifest. These are distinct Git
commits. The import manifest remains an immutable record of that snapshot;
later diagnostic files are not claimed to belong to the original 941 files.

Production deployment of V160 is still failed. V159 is the last successful
published version observed. This diagnostic adds no production changes.

## Official read-only evidence

The following calls succeeded at 2026-10-14 16:02:43 UTC:

| Tool | Result | Limit |
| --- | --- | --- |
| `sites_get_deployment_status` for V160 | Terminal `failed`; exact failure `incomplete input: SQLITE_ERROR`; last update `2026-10-14T02:01:58.293810+00:00` | No failed SQL, migration-job log, splitter version or ledger fields |
| `sites_get_site_version` | V160 source and archive metadata below | Does not export archive bytes |
| `sites_get_site_worker_logs` with 1440 minutes, limit 100, errors only | Five returned events, all Worker fetch invocations; HTTP 401/404 | No migration event returned; runtime request logs do not establish deployment-job behavior |
| `sites_read_database_overview`, binding `DB` | 50 user-table identifiers; projection says no omitted user tables | No column/trigger definitions or internal migration ledger |

A subsequent `sites_list_site_versions` returned V160, V159 and V158.
`sites_get_deployment_status` for V159 returned `succeeded`, updated
`2026-10-12T11:18:12.037018+00:00`.

Project:
`appgprj_6ac1907e61a48191a067ce3c30b21265`

V160 deployment:
`appgdep_6acee28b68988191ae9b152791d1a90e`

V160 saved version:
`appgprj_6ac1907e61a48191a067ce3c30b21265~appgver_0a8228c1068c8191983c9e798ff36437`

No new request ID was returned by these Sites calls. Runtime fetch request IDs
are unrelated to the failed deployment and are not presented as its request ID.

## V160 archive versus current source

V160 points to source `ab35236c37d015cd0ec40e5dae3545eb30307da4`.
Its tar archive has 334 files, size 10,956,800 bytes and SHA256
`5a030fdbeb3178e855d38523d0a2963e97ca6180886eaad581f1dc9136e4c528`.

The official packaging script copies the project `drizzle/` directory
unchanged into `dist/.openai/drizzle/`, then packages `dist/`.
The local build plugin also copies the migration directory without splitting
SQL. A deployment artifact and a source tree have different scopes, so 334
versus 941 files is not evidence of a migration difference.

The V160 Git object is absent from this isolated snapshot repository:
`git cat-file -e ab35236c37d015cd0ec40e5dae3545eb30307da4^{commit}` returned
`fatal: Not a valid object name ab35236c37d015cd0ec40e5dae3545eb30307da4^{commit}`.

A normal `library_read` of the exact archive file reference returned:

> The requested file reference is not currently visible. Use files.search or files.list to rediscover the file, then retry with a returned ref_id or file_id.

The broader purpose search returned old handoff documents, not the V160 archive.
An exact source-SHA search at 16:06:16 UTC returned zero results. This does not
prove the archive is absent; these calls did not resolve a visible archive
identity. Archive bytes and actual V160 migration hashes remain unavailable.

No raw download endpoint was constructed. No Library Site projection was
materialized. No internal ledger table was guessed. The database row reader
requires an exact user-table name returned by the overview, which did not expose
a migration ledger. No write credential was generated or read.

## Current-source candidate and regression

The current `drizzle/0053_far_sleepwalker.sql` contains two AFTER triggers
whose guards use `SELECT CASE WHEN ... THEN RAISE(...) END;`. If a splitter
mistakes this internal `END;` for the trigger's end, both trigger inputs become
incomplete. Full trigger SQL is valid. This is a diagnostic simulation of a
possible splitter, not a verified Sites execution contract or the confirmed
V160 cause.

The proposed compatibility fixture changes only the two guards to
`SELECT RAISE(...) WHERE ...;`, retaining the AFTER trigger, guard-before-INSERT
order and conflict policy. It is stored under tests, not in the migration
directory. No applied or pending historical SQL, snapshot or journal entry is
changed by this diagnostic.

The focused regression checks actual current SQL and the fixture, including
conflict rejection, same-table `INSERT OR IGNORE` retries, cross-table conflicts,
owner isolation, multi-row rollback and explicit transaction rollback.
See `tests/migration-splitting-compatibility.mjs` for the exact local assertions
and its printed limits. It does not prove workerd or hosted D1 behavior.

Validation at 2026-10-14 16:06:42 UTC: Node v24.19.0, exit 0, 45 checks passed.
The original whole SQL, candidate whole SQL and candidate simulated split all
produced identical synthetic receipts, registry and legacy projections. The
test explicitly demonstrates that `ABORT` does not undo earlier transaction
work; the synthetic batch wrapper performs `ROLLBACK` itself.

Run from `cloud-web/`:

```text
node tests/migration-splitting-compatibility.mjs
```

Sanitized official receipts and the local test result are stored under
`evidence/migration-deployment-diagnostics-20261014/`. Request headers, cookies,
signatures, IP addresses, signed URLs and business record contents are excluded.

A separate known local-double limitation is relevant: the first breakpoint
segment of migration 0012 contains four top-level statements. Node SQLite
`prepare()` runs only the first and silently omits the rest. Consequently,
a Node SQLite D1 double cannot establish full-chain D1 compatibility.
Do not alter 0012 on the strength of that double.

## Minimum evidence required before deployment

1. Export the actual V160 `dist/.openai/drizzle/` SQL and journal, retaining
   the archive SHA above and each file hash. Alternatively, export the original
   source commit's migrations through the original source environment, clearly
   distinguishing source evidence from the job's actual transformed inputs.
2. Obtain the failed migration filename, statement/breakpoint index, exact input
   bytes or hash, executor version, splitting rules and execution API
   (`prepare`, `batch` or `exec`), plus the deployment job's trace/request ID.
3. Read the database migration ledger through an official supported interface,
   and read actual schema/trigger definitions. Establish which statements, if any,
   applied before failure and whether the job rolled back atomically.
4. Compare actual V160 inputs with this source. If the CASE truncation is confirmed,
   verify the candidate on the same execution contract and relevant data guards.
   Repair only an identified failed, unapplied migration. Applied SQL, snapshots
   and journal entries remain immutable. Partial statement application requires
   a state-specific recovery plan; rewriting a file alone does not make a rerun safe.
5. Run the relevant local D1/Drizzle checks and normal application build on the
   final candidate. Push the exact source through the normal Sites workflow,
   save that matching version, and deploy only after the migration state is known.
   Check the returned production deployment result and perform the eight-change
   acceptance checks. Offline test success is not an online result.

Until items 1–3 are available, do not retry V160, reset the database, alter
migration history, create a replacement Site, change access/domain/schedules or
publish the compatibility fixture as a migration.
