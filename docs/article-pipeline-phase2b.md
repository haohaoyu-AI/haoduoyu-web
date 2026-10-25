# Phase2B: active article model, backup v6 and API compatibility

This branch is stacked on `fc38d66704c86de8f255751795125bfa71fc7bc7` and therefore on the unchanged PR37/PR38 commits. It activates only the article model and null-safe API/derived views. It does not implement pipeline PATCH/upsert, imports, UI, slot scheduling, or a new Notion protocol. No production database, DNS, deployment, credential or cron action is part of this change.

The user's latest choice allows a new site with empty business data. Prefer a separately approved **new empty D1** initialization for deployment, leaving the current database and site available for rollback. Existing-data migration is not a prerequisite. Do not reset the existing database or infer permission to erase todos, notes, accounts, security data or backups. If reusing an existing database is proposed, verify articles, observations and article-linked daily_metrics counts; any nonzero count must be reported before a destructive action. No live counts were obtained in this branch.

## Schema and execution boundary

The active schema contains **16 application tables**. `matrix_articles` has its original 13 columns and 17 pipeline columns. Only its URL/publication columns become nullable; legacy rows are explicitly `published`. Status is nullable in storage for the frozen historical contract, defaults to `published` for old SQL, and is always a valid non-null enum on normal API writes. Explicit stored NULL is never interpreted as published.

`drizzle/0005_article_pipeline.sql` is byte-identical to the reviewed three-table candidate: SHA256 `b45a31900d6b7153a423b8c7fa870b0a98da3e5b074b6d6f62ac044f7782a2ba`, 25 statements. It replaces the complete articles/observations/daily_metrics reference graph, retaining all original IDs, rowids, values, CHECK/NO ACTION constraints and six indexes, then adds two pipeline unique indexes. Neither todos nor notes schema changes.

The build accepts **only this exact file and its exact statement hashes**. The local `scripts/migration-contract.mjs` executor validates the source catalog and known local ledger, puts its catalog guard, the full replacement and ledger insertion in one D1 `batch()`, and fails closed for unknown transports/dependencies. It has been tested in real local Miniflare D1, including interruption and ledger failure rollback. This is **not a verified remote Cloudflare migration runner**.

Do not run 0005 through ordinary split/independent SQL execution or assume a Wrangler file import preserves this transaction. Before any deployment, separately verify the actual remote transaction/ledger transport, source schema and incoming references, table/index copy peak space, limits, and a recoverable private backup. Keep the old Worker until schema and code compatibility are proven in isolation. After new draft writes, reverting only the Worker or old backup can lose data or break null assumptions; retain v6 and reconcile every new write before rollback.

## Article API contract

- Existing POST without new pipeline fields remains `published` and retains the original real URL and publication-time validation. Any explicitly supplied new pipeline field selects the new path, defaulting to `draft_saved` unless a valid status is supplied. Five statuses are `drafting`, `illustrated`, `draft_saved`, `published`, `failed`.
- Published rows require a real URL and publication timestamp. Other statuses require both fields to be NULL; no invented URL or date. PUT preserves every omitted field, including status. Explicit status NULL is rejected; a stored NULL row needs an explicit valid status to be repaired.
- Normal article GET lists/index and all cumulative, dashboard, period, attention, due-review and cache-deadline calculations use only `published`. `GET /articles?status=draft_saved` (or another exact status) explicitly selects that cohort; `all`, duplicate status and invalid values are rejected. Pagination `unfiltered_total` describes the selected status cohort before other article filters. The index response still has exactly its original five fields.
- Full article responses add the 17 logical metadata fields. Six storage `*_json` columns are returned as logical object/array fields, never raw serialized JSON. Draft derived values use `date_status=not_published`, `snapshot_status=not_applicable`, empty missing metrics and NULL duration. Nullable sort keys remain last in both directions.
- Article-level observations/daily metrics reject non-published articles; account-level daily metrics continue to work. Published articles already carrying article metrics cannot be downgraded to drafts. Version CAS, account scope, atomic audit and idempotency are retained.
- A matching insurance-series title fills `series_no` on API create/update only when the field is currently NULL and not explicitly supplied. Existing non-null or explicitly supplied values are preserved. 0005 itself leaves new series fields NULL; it does not bulk-edit old titles or infer their metadata.
- `run_dir` retains safe slash-separated segments (`A-Z`, `a-z`, digits, `_`, `-`) and is never flattened. Duplicate run directory or slot/date returns a generic 409, without disclosing another account's identifiers. No upsert or retargeting is performed.

## Conservative JSON contract

`sample`, `timings`, `reruns`, `draft_ref` accept objects or NULL; `blockers` and `verify_items` accept arrays of objects or NULL. Raw `*_json` API inputs are rejected. A supplied logical field **replaces that complete field**; omission preserves it. Deep merge is deferred.

The six fields have a combined 65,536 UTF-8-byte bound; each JSON value also has a maximum container depth of 12 and 4,096 value nodes. `__proto__`, `constructor` and `prototype` are forbidden at every level, including original members hidden by duplicate keys. Unknown legal keys and values are preserved. Only explicit known child contracts are enforced: string/null `draft_ref.pgc_id` and `appmsgid`, timestamp/null `timings.finished_at`, nonnegative safe-integer/null `reruns.watchdog`, and string/null `blockers[].type`. IDs are never numeric-coerced; normal API timestamps are normalized, while backup JSON is preserved verbatim.

## Backups and isolation

Export format is v6; restore accepts v1–v6. v5's exact original article-column mapping is frozen. Legacy article backups receive `published` and NULL new metadata. v6 preserves actual NULL status/date/URL and raw JSON, source revision, todo tombstones/template provenance and notes user isolation/change cursors. Restore remains empty-target-only and explicit opt-in. The inventory CLI requires current v6; HTTP backup remains authenticated and keeps its established user filtering, not an unverified complete multi-user source export.

Storage concurrency, todo-specific implementation/styles, notes routes and their authorization are unchanged. Existing anonymous business writes remain enabled only according to the existing public-business configuration. No additional public backup, account-security or credential endpoint is introduced.

## Reproducible checks

```sh
npm test
npm run check:web
node scripts/frontend-build.mjs --check
npm run check:artifacts
npm run check:previews
```

Targeted tests are `article-pipeline-{model,fields,backup,boundary,api,statistics}.test.mjs`; prior reference-graph rollback and fixed-baseline statistics tests remain. Final verified counts and CI are reported with the resulting commit; this document does not claim a real production migration or cloud-to-Notion loop was tested.
