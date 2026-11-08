# Standalone local API

`createLocalApi({db, now = Date.now, uuid, ownerId = LOCAL_OWNER_ID})` returns an asynchronous function `call(path, options = {})`. Request bodies are plain JSON objects. Successful calls return the data directly, or `{data}` with `envelope: true`. API errors have `status`, `code`, and `localNotSaved`; IDB failures fail closed as `LOCAL_STORAGE_FAILURE`. An API write only resolves after its database transaction completes.

Use `openOfflineDB({name: LOCAL_DATABASE_NAME})`. The name is `haoduoyu-standalone-local-v1`, not the website's `haoduoyu-offline`. Entity and metadata keys are namespaced with `local:v1:<owner UUID>`. No account, cookie, network, website cache or real data is imported. `createMemoryDB` is for tests only, never a persistence fallback.

## Supported original frontend contracts

- GET `/auth/me`, `/accounts` (the actual local account collection, initially empty).
- GET `/workbench-snapshot/index?version=2` (current local metadata for the original move guard).
- GET/POST `/todos`, GET/PATCH/DELETE `/todos/:id`, PATCH `/todos/:id/note`, POST `/todos/:id/restore` and `/todos/:id/template`.
- GET/POST `/unscheduled-todos`, GET/PATCH/DELETE `/unscheduled-todos/:id`, POST `.../restore`, `.../move`, `.../complete-today`. Moving/completing inserts the dated target and tombstones the source in one transaction. Moved sources cannot also be restored as duplicate future items.
- GET/POST `/todo-templates`, PATCH/DELETE `/todo-templates/:id`, POST `.../archive` and `.../restore`; GET/PATCH `/todo-preferences`.
- GET `/note-entries`, `/note-entries/:id`, `/note-entries/dates`, `/note-entries/month`, `/note-entries/operations/:saveId`; PUT/DELETE `/note-entries/:id`; POST `.../restore`.
- GET/POST `/note-entries/labels`, including create/archive/restore/delete. Honors the original `X-Note-Labels-Version` 1/2/3 response projections. Label deletion keeps a tombstone and prior associations in local history; it does not destroy historical text.
- GET `/daily-notes`, `/daily-notes/dates` provides only actual local legacy rows (none initially), read-only, matching the original UI's read-only legacy panel. No legacy import is implied.
- GET `/memos`, `/memos/groups/:id`, `/memos/notes/:id`, `/memos/operations/:saveId`; PUT/DELETE groups/notes; POST `.../restore`. Index notes exclude bodies and groups carry `active_note_count`, matching the original stores.

Unknown routes fail explicitly with `LOCAL_NOT_IMPLEMENTED` (501). In particular, article/review/AI writes, AI analysis, account-management and server settings do not pretend to succeed. `/memos/trash/clear` fails with `LOCAL_SOFT_DELETE_ONLY` (405); this implementation never permanently purges user records.

## Integrity and recovery

All writes, before-images, counters and immutable idempotency receipts use one read-write transaction over `entities` and `meta`. Request fingerprints compare canonical complete JSON rather than collision-prone hashes. Reusing an operation ID with a different request fails. Replaying an operation after its entity has changed fails with `VERSION_CONFLICT`; the original receipt remains queryable. Notes and memos use SHA-256 content/entity hashes. Versions, UUIDs, exact fields, dates, text encoding/size, labels and memo parents are validated before writes.

Limits follow the original service: notes 64 KiB, 200 entries per category/day, 200 custom labels, complete month 2,000 entries / 1 MiB; memos 32 groups and 200 notes including trash, titles 120 characters, body 64 KiB. New note entries retain the original Beijing-today restriction. No background sync or retry is implemented. Callers may read receipts before retrying an uncertain operation.

Visual templates and CSS remain untouched. The original website's wording may still mention a server or network; this service does not contact one. The main build substitutes only the API/runtime boundary and local bootstrap. This module does not enable a hidden memos menu or otherwise change the original navigation.

## Tests

Run `node --test local-ui/tests/local-api.test.mjs local-ui/tests/local-frontend-contracts.test.mjs`. Fixtures are synthetic. Coverage includes original note and memo state-store workflows, strict validation, namespaces, duplicate requests, stale writes, concurrent writes, transaction failure rollback, soft deletion, durable reload, receipts, label protocols and zero network calls. Actual browser IndexedDB and Android-host checks belong to the integration suite.


## Content Review and existing AI reports: local read model

`review.mjs` adds only read operations. It does not create any records, import website data, assert an authenticated platform identity, run AI, or implement review/report writes. A clean installed database has actual empty collections; no example cards are seeded. `/accounts` still reads only actual locally stored accounts and initially returns `[]`. The original page's `V字` is used solely as a local partition filter label; it is not a manufactured website account or permission grant.

Supported paths:

- GET `/review/{articles,snapshots,reports,playbooks,benchmark-accounts,benchmark-articles,notes,account-health}?account=<label>&offset=0&read_revision=<opaque SHA-256>`.
- GET `/ai-reports?offset=0` reads existing local report records, not generated reports.
- GET `/work-reminders?date=YYYY-MM-DD` reads actual stored local reminders for that Beijing business date, defaulting to local Beijing today. It returns `can_edit:false`; no reminders or schedule are inferred from todos, remote work or clock time.

Entity kinds are `review:<resource>`, `ai-report`, and `work-reminder`, in the existing `local:v1:<owner UUID>` scope. All reads exclude soft-deleted records. Non-snapshot review rows filter on their explicit `account` field; snapshots filter by their local article parent, benchmark articles by their local benchmark-account parent. The latter derive the account label and `used_by_article_ids` from real local parents/references. Other fields and missing metric values are not fabricated. No production importer or user-facing creation facility for these collections is included in this read-only phase.

Review queries accept only `account`, `offset`, and `read_revision`, each at most once. Account is required (1–120 characters, trimmed). Offsets are canonical non-negative safe integers. Pages have at most 100 records and explicit `has_more`; they never silently truncate a full collection. Review revision is an opaque 64-character SHA-256 over the canonical complete active eight-collection local snapshot and owner scope, stable regardless of insertion order. This deliberately differs from the server's numeric revision and matches the original controller's opaque equality checks. A stale supplied revision fails with HTTP 409 / `READ_REVISION_CHANGED`; the original loader detects mixed revisions across resources and retries once. It is not a server sync cursor. Unrelated todo/note/memo changes do not invalidate a review read.

Limits: the complete active review snapshot is capped at 20,000 rows across all eight collections and 16 MiB of UTF-8 canonical JSON. Existing AI reports have the same 20,000-row/16-MiB collection cap. Per-date reminders are capped at 100 records. Exceeding a cap fails with 413 and does not return partial data or invented zero statistics. Reads do not create timestamps, hashes used for mutation approval, authors, accounts or missing metric values. Stored reports return the original read-only projection `id,author,content,created_at`; mutation approval/hash contracts are unsupported. Review missing metric values remain missing/null through the unchanged original normalizer and renderer; only actual empty article cohorts yield zero counts in the original renderer.

`node --test local-ui/tests/review-local.test.mjs` exercises the actual original eight-resource loader, AI report loader/work-date filtering, Content Review renderer, and AI report/reminder paint functions with an empty local database and isolated synthetic populated fixtures. It checks 101-row pagination, shared eight-collection revision, stale revisions/mixed snapshots, ownership/partition filtering, actual zero vs missing metrics, exact empty-state text, escaped report content, strict queries, unsupported writes/AI operations, size-limit failures, and zero network access. These are data-contract and template-output tests, not a browser screenshot or Android/IndexedDB persistence claim.
