# Reversible workspace range and recovery pagination

This change is an offline candidate. It does not deploy the Site, call a production API, repeat today's completed production cleanup, or reuse an earlier confirmation as authority for a new operation.

`ArticleWorkspaceAction` first freezes the currently selected article IDs, titles, action and authenticated owner scope. The first click reads the owner and displays that exact range; a separate confirmation starts the operation. Malformed or duplicate IDs are rejected before any intent, API read or API write is created, and can be replaced by a fresh selection. A changed range before confirmation requires a fresh selection and confirmation. Once processing starts, later loaded rows do not enter the frozen range.

The client submits the existing archive/restore interface sequentially, with at most 100 IDs per request. Each batch gets its own request key. The current batch keeps its key and payload until the server returns a complete, matching changed/blocked partition. A timeout, lost response, HTTP failure or malformed receipt stops the sequence; an explicit retry resends that same batch and key before proceeding to any remaining batch. Already confirmed batches are reported to the parent view immediately and are never repeated by this sequence. Blocked rows retain the existing SQL protection, including expired credentials without execution-end evidence. A blocked result completes that batch; attempting those rows again is a new selection and confirmation.

The client checks the owner before each batch and sends the frozen `owner_scope` with the POST. The server compares that optional scope with the authenticated request owner before reading receipts or changing visibility. Existing callers without the optional field retain the same owner checks. Account/auth failures remove the old action controls; changing the component's owner scope aborts its outstanding client read and hides the old confirmation. Keys and pending progress are held in the mounted component, as before; this change does not introduce durable resume across reloads or account changes.

`GET /api/articles/workspace` accepts only `offset` (integer 0–1,000,000) and `limit` (integer 1–100, default 100). Unknown, duplicate, fractional and out-of-range parameters are rejected. Every page retains the authenticated owner filter, stable `created DESC,id DESC` ordering and private/no-store response. The response includes `offset`, `limit`, `next_offset`, `total` and the unchanged owner scope. Inventory reads do not create mutation receipts. Offset pages are refreshed together and deduplicated by ID, rather than represented as a frozen database snapshot.

Article Data tracks inventory offsets separately from immutable historical record offsets. “加载更多可收起与恢复文章” exposes older archived rows and their restore controls. “加载更多历史” advances only the history range. Each page and the retained current owner must match before either batch is committed to the UI. An owner mismatch or 401/403 clears both old displays and both pagination ranges; a read epoch also prevents a late page from resurrecting controls after an action reports an account change; a malformed inventory response keeps the last valid display with actions disabled. Inventory pagination does not modify the historical summary or observations.

Only archive visibility rows and their existing idempotency receipts can change. There is no permanent deletion, audit cleanup, article/body/Word/private-draft edit, claim rotation, dispatch, subscription or metrics mutation in this implementation.

## Offline verification

- `node tests/article-workspace-pagination.mjs` — 22 cases against the actual Home, workspace action, Article Data component and workspace route source, with deterministic React hooks and all 54 inherited migrations applied to an isolated in-memory SQLite database. Covers 125 IDs, 100/101 boundaries, unknown and uncommitted partial batches, original-key recovery, later additions, scope reconfirmation, protected holders, owner races, opaque HTTP 400, malformed receipts/pages, invalid selections, stale-page fencing, strict pagination input, the older 125th archived row, independent pagination and unmount.
- `node tests/article-data-owner-pages.mjs` — existing multi-page owner/auth regression; fixtures include the new pagination response fields.
- `node tests/tonight-eight-d1.mjs` — existing archive/restore race and owner guard, cloud-task protection and immutable history/metrics regression.
- `./node_modules/.bin/tsc --noEmit --incremental false` — full TypeScript check.
- Targeted ESLint for the changed workspace component, library, API route, Article Data page and regression tests, plus `git diff --check`.

These checks use synthetic identities and data; they are not browser/layout acceptance or production acceptance. No migration, production database, Site, provider, platform, account or event operation is performed.
