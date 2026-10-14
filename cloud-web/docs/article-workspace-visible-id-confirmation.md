# Visible exact IDs in workspace confirmation

This offline P3 fix makes every entry in the existing confirmation range show its frozen title and complete article UUID as visible text. The UUID is on its own labeled line, so equal titles remain distinguishable on touch devices without hovering. The existing range details control still opens the list. Missing titles keep the existing fallback.

Only the Action's returned markup and scoped display CSS changed. Every line before the JSX return is identical to base `90631880e59b15c059f3668c70a7c67c296ab446`: ID freezing, title freezing, explicit confirmation, owner checks, batch limits, independent nonce creation, same-key unknown recovery and callbacks are unchanged. No API, backend, migration, permanent deletion, metric, audit, draft, provider or platform change is included.

The range occupies the available row width. Entries wrap long text, including the full UUID, without ellipsis or hidden overflow. This permits the full ID to be read at 390px, even when the title contains a long unbroken string.

## Verification

`node tests/article-workspace-confirmation-ids-ui.mjs` runs the actual TypeScript Action source through a deterministic React hook harness and uses React's actual server-rendered markup. Against the unchanged base it fails because the first entry's UUID is absent from visible text; all 125 same-title entries had only hover IDs. Against this patch all five groups pass:

- 125 equal titles each expose their complete distinct UUID; the preview sends no POST.
- Changed incoming IDs/titles after a partial unknown do not change the frozen title/ID display; retry retains the original remaining25 IDs and request key.
- A restore entry without a title still exposes its complete UUID.
- Actual component markup with the actual global CSS renders all125 complete UUIDs and a long unbroken title in Chromium at1440px without overflow.
- The same DOM/CSS checks pass at390px.

The Chromium portion uses `page.setContent` with actual component markup and actual CSS, while component event/state behavior uses deterministic hooks. It is presentation validation, not a hydrated full-App end-to-end or backend connectivity test. Every browser request is blocked, no server is started and no production/platform request is made. Set `WORKSPACE_ID_QA_DIR` to retain markup, screenshots and structured results.

The unchanged `node tests/article-workspace-pagination.mjs` retains all22 cases with54 original migrations in isolated SQLite, including scope/owner isolation, protected holders, exact confirmation, partial success, unknown same-nonce recovery and later additions. Full TypeScript, targeted ESLint and diff-check pass. An independent read-only reviewer also checked the patch and reran the five presentation groups plus the22 existing range cases.

Full assembled-App Chromium interaction is left to the parent's subsequent three-fix combination QA. A loopback-only, fully synthetic business-API browser script is prepared separately in the evidence directory; it has not started a server or exercised the parent preview for this patch.
