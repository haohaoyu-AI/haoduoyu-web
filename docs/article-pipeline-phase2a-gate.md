# Phase2A: article parent rebuild gate is blocked

This branch starts at `ad0516f59b5b841d831845c2a716641bfd1a520a` (PR38, stacked on PR37). Neither earlier PR was modified. No production request, DDL, deployment, credential action, import or cron was performed.

## Actual local D1 evidence

The diagnostic uses the pinned real Miniflare/workerd D1 implementation, temporary storage, synthetic rows and an outbound service that always rejects external requests. It is not a sqlite-only simulation.

Run:

```sh
node --test --test-concurrency=1 tests/article-parent-rebuild-boundary.test.mjs
```

Final result: **3 tests, 3 passed, 0 failed, 0 skipped**, 2809ms in the recorded local run. These tests validate the failed migration gate and rollback; they do **not** demonstrate a successful pipeline migration.

| Case | Actual outcome |
| --- | --- |
| Article parent replacement with no metric child rows | Control passed; original article rows and three indexes preserved |
| Same parent replacement with NO ACTION observations and daily_metrics references | Rejected at the deferred foreign key boundary; complete original state retained |
| Deliberate statement failure after dropping the old parent | Entire batch rolled back; original schema, indexes and unrelated data retained |

The rejected candidate is one D1 batch: `PRAGMA defer_foreign_keys=ON`, create a temporary parent with nullable URL/publication date, copy all original columns, drop the old parent, rename the replacement, recreate all three original indexes. The temporary table's own CHECK qualifiers use its temporary name. It never disables foreign keys or deletes child rows.

Observed failure:

```text
Durable Object was reset and rolled back to its last known good state because the application left the database in a state where constraints were violated: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)
```

After that rejection, fresh reads verified **all 16 original matrix tables, every stored row and their schema definitions** match the pre-attempt checkpoint. This includes article IDs/version/timestamps, both metric child tables, synthetic todos and notes. The temporary parent is absent, `foreign_key_check` is empty and `quick_check` returns `ok`.

The auxiliary `SELECT sqlite_version()` query was denied by the D1 authorizer. It was removed and not retried; no embedded SQLite version is claimed.

## Stopped implementation and saved preparation

No0005 migration or schema change was added. No API guard, null-safe article API, new upsert, UI or scheduled sync was enabled. The branch tip retains the original v5 runtime and schema; the original production source and existing tests are restored exactly to ad0516, plus this diagnostic and report.

Unverified backup-v6 and API-boundary preparation is preserved in WIP commit `a5b1935cbe3f1fec605945c534388be41f61c997`, then removed from the active tree in the following commit. **Do not deploy or cherry-pick that WIP as a finished feature.** Its exporter requires new columns that do not yet exist, and its API boundary tests require an unimplemented guard.

The WIP's pure field validator had **8/8 local tests passing**. Schema-dependent v6 restore tests and six API boundary groups were **not run**. It freezes v5 article columns and prepares v1-v5 compatibility, explicit source-revision/todo/notes preservation and container-only JSON validation; these remain unverified integration work.

The separate local backup-only patch is in ignored `artifacts/phase2a/backup-v6-preparation.patch` (46,241 bytes), SHA-256 `3188bec3a0ddd259baa12b7208e5fd5f6246c45264ee06aa15d6f2d95425d05a`. The WIP commit also preserves the additional API test, so it is the remote recovery source.

## Next review gate

Follow-up: the parent approved a separate synthetic three-table graph experiment. Its candidate and validation are recorded in [the graph candidate report](article-pipeline-graph-candidate.md). The original single-parent candidate below remains rejected; the replacement is not a production-approved migration or an activated API/model.

The parent must review a different migration strategy before implementation resumes. Possible review subjects are D1 support for an in-place NOT NULL change, or a separately designed migration covering the affected article/metric dependency group. Neither was attempted here. Do not bypass the gate by turning off foreign key enforcement, dropping metric rows or editing SQLite's schema tables.

Official background: [D1 foreign key enforcement](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [D1 atomic batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [SQLite table-alteration procedures](https://www.sqlite.org/lang_altertable.html). These rules do not substitute for the failed real D1 experiment above.
