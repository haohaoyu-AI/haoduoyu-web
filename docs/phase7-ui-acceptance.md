# Minimum article ledger UI — review candidate

This completes the UI integration left at `bdd467307ce6df64804ed3e35997f1798cc30c09` on `opt/article-pipeline-ui`. The accepted comparison baseline is `37a1e4f2618e1fea6ded05911b2a73572968442a`. The old [WIP handoff](phase7-wip-handoff.md) records an unfinished checkpoint, not the status of this candidate.

## Result

- Articles explicitly query `draft_saved` by default. The five exact status choices, slot/writer/boolean/series filters and selectable pipeline columns use the existing API. Published metric drilldowns, including opening “查看全部” in another tab, explicitly request `published`.
- The overview defaults to a complete, bounded reading of the five status cohorts. It shows recorded unpublished/saved/published counts and writer comparisons. “已发布数据” keeps the existing statistics renderer and API. The underlying dashboard module remains byte-identical.
- Create/edit saves map existing model fields, preserve unknown `draft_ref`/`timings` members, keep blank counts NULL, preserve actual zero, and retain existing timestamp precision when unchanged. Published fields require explicit correction when status changes. Version/cache/session checks protect editing; an uncertain create is locked against duplicate submission in the same form.
- Details show source samples, timings, blockers, safe draft references and explicit unknown verification states. Boolean changes use CAS and an idempotency key. Conflicts read back the current record; uncertain results require an explicit same-key retry. A closed or superseded drawer/session cannot start the deferred retry write.
- Draft reading metrics say “未发布”; missing values stay unknown. Topic labels use only an explicit slot. Warnings remain derived; the `tt1_1024` fixture with 25 images has no warning.
- The todo landing page, dedicated todo/notes modules, backend/schema and published dashboard module are unchanged from the baseline. The full original CSS prefix is retained; only article-scoped CSS was appended.

## Focused verification

The accepted baseline and WIP evidence were reused. No local full-suite rerun was performed.

| Check | Result |
| --- | --- |
| Form save mapping, CAS/context and uncertain outcome tests | 10 passed |
| List tests | 6 passed; one original assertion was narrowed to reject injected SVG event handlers while allowing trusted UI icons |
| Router/controller/event integration | 13 passed; native-link regression added and passed separately |
| Deferred verification retry after drawer/session change | 1 new regression passed; previous detail 9 and overview 6 evidence retained |
| Affected historical UI/contract checks | 72 distinct checks passed after fixing two VM harnesses to provide `structuredClone` |
| Final bounded AST projection / historical actions checks after native-link fix | 8 passed |
| Source style | 45 modules / 655 functions passed |
| Build, committed bundle equality and eight public resource pins | Passed |
| Local dev/analytics preview probes | Passed on loopback with expected local auth states |

The exact declaration/property manifest in `tests/article-pipeline-ui-delta.json` permits only reviewed Phase7 changes. Unchanged modules and the existing CSS prefix remain locked; mutation-refusal tests ensure the projection is not a blanket exception.

Real Chromium browser evidence is stored in [article-pipeline-ui-evidence](article-pipeline-ui-evidence/): 15 check groups passed at 1440, 390 and 375 pixels, with 23 captures, zero page errors or unexpected dialogs, and zero external requests. The report pins the tested app, CSS and Worker hashes. The fixture starts an isolated real Worker with temporary synthetic D1 data; browser external requests are blocked. The browser script is `tests/browser-article-pipeline.py`. No connected user browser, production database or production credentials are used.

## Parallel-branch integration touchpoints

The independently developed memo feature is outside this branch. This work adds no module navigation item and no migration. When combining branches, preserve both features' source changes and regenerate `public/app.js` instead of choosing one generated bundle:

- `web/controller.mjs`: dashboard scope controls, loader and published native-link adapter; existing navigation structure remains intact.
- `web/actions.mjs` / `web/events.mjs` / `web/forms.mjs`: article actions, verification changes and article submit delegation.
- `web/core/router.mjs`: article pipeline validation and `article_scope`; todo fallback and notes date handling stay intact.
- `web/core/constants.mjs` / `web/core/state.mjs`: article labels, defaults, columns and overview state; existing `nav` entries are unchanged.
- `web/ui/components.mjs`: article header wording and scope-sensitive published-data help.
- `public/style.css`: 70 appended article-scoped lines after the exact accepted prefix. Preserve later memo-scoped additions as well.
- `public/app.js`, `.ci/public-assets.json` and the exact frontend characterization manifest: regenerate/review after resolving source integration.

## Boundaries

- This is a branch review candidate. No deployment, merge, new PR, production import, secret or Cron change was performed. Final CI/secret-scan status is reported against the pushed commit, rather than inferred from earlier runs.
- Ledger counts are bounded to 20 requests / 2,000 rows. Incomplete reads fail visibly. Paging is not an atomic snapshot; simultaneous edits may change the result.
- No slot schedule or expected-output counts are inferred. Reconciliation, insurance progress changes, slot configuration and atomic indexing remain deferred.
- Draft links are checked for safe HTTP(S) formatting; their remote permissions and existence are not verified. Browser evidence uses synthetic fixtures, not production records.
- The readable bundle is 227,309 bytes; this work does not claim to meet the earlier 100 KB target or complete the broader optimization taskbook.
