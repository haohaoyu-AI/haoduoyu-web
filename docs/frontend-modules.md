# Phase 4a: mechanical frontend modules

## Scope and baseline

Baseline: `168f236b05abd12ad1a937a5f506d9d8f9234ece`.
Branch: `opt/phase4a-frontend-modules`.
This checkpoint records the migration plan, not a completed implementation or validation.
Production remains on Sites v7; this branch is not a deployment.

Move the existing frontend into ES modules and commit the readable, unminified
single-file ESM build to `public/app.js`. Keep the existing action switch,
request behavior, inline styles, CSP, templates and backend unchanged.
The action registry, request cancellation/deduplication and CSP changes belong
to separate later phases.

## Ownership and dependency direction

`core/state.mjs` owns the existing application state object and one runtime
object for the existing mutable lifecycle bindings. Every consumer reads the
current property; no destructured state snapshots are introduced.
The session/index state module owns the single index Map and its clear/reset
operations without importing the API service.

The intended acyclic imports are:

```text
main -> event registration, controller
events -> controller, forms, pages, UI, API, core
controller -> page renderers, API, UI, core
forms/detail -> modal request -> API
reviews/review form -> article index -> API
API -> login rendering, modal lifecycle, session/index state
login -> session/index state, entry animation, popover
modal -> popover
UI helpers -> core
```

`renderShell`, `renderPage`, navigation and filter application remain together
in the controller. Forms construct/load dialogs; their existing submit
dispatch remains in the event module. This avoids controller/page cycles.

Preserve the registration order: click, change, capture-toggle, input,
filter-submit, keydown, business-submit, resize, popstate, then one `init()`.
Keep the same synchronous work before every first `await`, version/epoch
increments, Promise cache identity, focus callbacks and error propagation.

## Measured specification conflict

Before moving any code, the baseline file measures **93,588 bytes**.
The installed esbuild 0.28.2 with `bundle: true`, `format: 'esm'`,
`minify: false`, `treeShaking: false`, `charset: 'utf8'`, `write: false`
produces **104,536 bytes** even from the original single file.
That is 4,536 bytes above the 100,000-byte target before module overhead.

Phase 4a therefore reports the actual final size and leaves the overall size
criterion unmet. It will not compress code, remove functionality, change the
threshold or claim the criterion passed. Likewise, mechanical migration does
not pretend that existing large functions meet the 80-line target; structural
cleanup belongs to phase 4b. The final report will list measured line/function
limits separately from behavior preservation.

## Validation plan

- Check generated `public/app.js` before a build can overwrite it; a deliberate
  isolated artifact edit must fail this check. Preserve all eight asset byte,
  hash, ETag and Worker-response checks.
- Keep the existing VM assertions against the actual generated bundle,
  including stale responses, same-user relogin/old 401, draft cancellation,
  index generations, initialization and modal focus. Test probes remain
  test-only.
- Compare original and candidate browser behavior using synthetic D1 data,
  real local Cookie/CSRF authentication and 375/390/768/1440 widths.
  Record every required action/form outcome and screenshot manifest.
- Run the complete test/build/preview/scan checks on the final commit.
  Do not repeat unrelated C5/C6 large benchmarks.

No implementation, test, browser or CI result is asserted by this checkpoint.
