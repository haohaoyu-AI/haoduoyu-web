# Phase4: article merge-upsert and import preparation

Source baseline: `88685601f40ae9b4c28799d42be6240f1dbe7ea6`, stacked on the unchanged PR37/38 history. This phase adds article API behavior only, with one frontend audit-action label. No schema migration, production request/DDL/deployment, credential, cron, snapshot/index protocol, import run or other UI feature is included. Production was independently reported by the parent as ad0516 with 16 tables/v5; this branch requires the separately reviewed article model before exposure.

## PATCH contract

`PATCH /api/v1/articles` requires `account_id` and a literal safe `run_dir` or a complete `(slot, run_date)` pair. Account permission is checked before selector queries **and before reading an old idempotency receipt**. Keys never silently retarget another account or article. If both keys identify different rows, an explicit ID disagrees, or an existing non-NULL identity value would change/clear, return a generic 409 without queued writes or another record's identifiers. Previously NULL identity components may be filled consistently. Slashes remain significant; no flattening, automatic year inference, or short-name collision repair is performed. A supplied mismatching new-year identity conflicts instead of modifying last year's article.

Creation allows omitted `version` or `version:0`, requires the existing article title/account validation, and defaults to `draft_saved`. For an existing match, a missing version is 400; zero or a stale version is 409. Positive current version uses the existing per-row CAS and global atomic mutation. `id` may verify an existing match, never choose a new record's generated ID.

Only supplied fields change. Four JSON objects (`sample`, `draft_ref`, `timings`, `reruns`) merge recursively; arrays replace completely; a supplied top-level logical JSON NULL clears that field, while a nested NULL remains that exact member value. Unknown legal JSON keys survive. Supplied scalar/array values replace their fields. The final merged six-field JSON is revalidated against the 64KiB total, depth12 and 4096-node limits, dangerous-key restrictions and known child types. Non-finite parsed numbers are rejected before recursive receipt hashing instead of silently becoming NULL. Ordinary PUT still replaces each supplied JSON field wholesale; legacy POST remains published by default.

Responses add `upsert_action: created | updated | unchanged` to the full article: 201 for creation, otherwise200. An exact same-value request with current version is a no-op: no article version/audit write; without an idempotency key it does not advance revision either. A new keyed no-op may record its receipt and API-key usage, but not a business update. `Idempotency-Key` replays the original data/status. Unknown commit failures are not automatically retried: read the authorized account's complete relevant status cohort, compare the literal identity, and retry only using the original key after establishing the outcome. No new lookup endpoint is claimed.

No-op still executes the same full validation as ordinary PUT. Restored inconsistent publication fields or article-level metrics on a draft cause a validation/conflict error with no queued write; an unchanged response does not silently repair or accept those states.

## Filters and derived fields

GET retains its default published cohort. Explicit `status`, `slot`, `writer`, `series_no_min`, `series_no_max` are validated before fixed bound SQL; the range is inclusive. Boolean filters accept only literal `true` or `false`, with duplicates rejected. Derived filters apply to the entire authorized/scalar-filtered set **before** pagination, then preserve stable ordering, NULL-last and accurate `meta.total`. `meta.unfiltered_total` retains its existing selected-status cohort meaning. `fields=index` still returns exactly five fields, including when derived filters require additional internal columns.

Full articles add `warnings`, `has_pending_verify`, `verify_state`. Warnings are deterministic derived codes, never stored: Toutiao title>30 Unicode code points; known char_count outside2000–2300; known subheading_count outside5–7; a known entertainment slot's image_count<25. gzh does not check images; unavailable counts are not treated as0. No slot schedule or expected-output count is inferred.

`DRAFT_CREDENTIAL_MISSING` applies only to draft_saved: Toutiao uses nonblank string `draft_ref.pgc_id`, WeChat uses nonblank string `appmsgid`, Zhihu/other platforms use `editor_url`. The URL key is the pre-existing API example key; unknown keys such as `url` are preserved but do not become credentials. Validation checks HTTP(S) syntax only, rejecting whitespace/controls/userinfo; it does not visit the URL, verify existence, assert draft type, or prove edit rights. IDs remain strings.

For verify_items: any explicit `done:false` yields pending/true; an empty array or every item `done:true` yields complete/false. NULL, missing or other completion values are unknown/NULL unless a known false already proves pending. Existing unknown values are retained. A false query matches only complete, never unknown.

## Verification and release boundary

New core/API tests use real isolated Miniflare D1 and disabled external requests; pure tests cover warnings/query bounds. They include the tt1_1024 synthetic example (25-character title,2236 chars,5 subheadings,25 images,string pgc_id) with an empty warnings array; concurrent create/update, CAS retries, identity conflict snapshots, no-op receipts, unknown commit readback, merged JSON limits, account-scope narrowing, public CSRF/rate limits, and unchanged todo/notes behavior. Existing strict HTTP/graph/cache comparisons project only precisely validated additive fields and document changes. Final full npm-test/CI evidence is attached to the resulting commit report.

No todo/notes implementation, table or styles, or storage algorithm changes. The only frontend source delta is the `PATCH /articles` audit label. Backups remain v6: these are existing stored columns/JSON and computed response fields, so no new backup format or table is needed.

## Next phase import plan — no importer executed

1. Start with an explicit source root and synthetic fixtures; default `--dry-run`. Reading actual user manuscripts and network writes require the next authorized run. Use an explicit account mapping; do not derive a person's account from a slot name.
2. Parse timelog.txt, check.md, title.txt and article.txt with documented patterns and source line evidence. A timezone must be explicit for unzoned log timestamps. Validate date/year against run_date; an MMDD directory alone cannot supply a year. Preserve safe path segments, and report collisions rather than flatten or silently rename them.
3. Read used_topics.txt / used_samples.txt as evidence links using their documented delimiter/series pattern. Preserve IDs as strings. Record parse failures and leave unknown values NULL; no guessed times, counts, completion flags or zero defaults.
4. Dry-run prints a sanitized proposed PATCH, field provenance and issues for each record, plus intended created/updated/unchanged/conflict outcome. Do not invent slot schedules or publish dates/URLs.
5. A separately enabled apply mode must read the authorized current identity/version, use a stable per-input `Idempotency-Key`, and keep an input manifest. On 409 reread and report; on an uncertain commit stop and read back before any retry. Do not overwrite manual changes automatically.
6. Report created/updated/unchanged/failed counts and verify readback fields, complete pagination and zero duplicate identities against the manifest. Real writes, snapshot/index/cron and UI remain separate stages.
