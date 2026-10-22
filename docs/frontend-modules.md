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

## First implementation checkpoint

The initial split contains 27 modules. The 11 former mutable lexical bindings
are fields of the single `runtime` object. Original constant/function ownership
and imports are listed in `frontend-module-map.json`.
A local AST comparison of all 111 original top-level constants/functions
matches after reversing only those runtime field references and normalizing
formatter spelling of `undefined`; all nine original event-registration
statements match in their original order. Local names changed by formatting
were restored in source. This structural check supplements the runtime tests;
it does not replace browser validation.

The generated bundle is **106,865 bytes**. The existing targeted UI/identity
suite passes **47/47**, including same-user relogin/old-401, pending index writes,
modal races and route restoration. The new isolated artifact-tamper test
passes and proves the check rejects both manual artifact edits and stale
artifacts after a source edit without silently overwriting either.
Full tests, browser comparisons and CI are still pending at this checkpoint.

Readability measurements are retained in `frontend-module-size.json`: 121
source lines exceed 160 characters (mainly unchanged HTML templates), and the
existing click/submit callbacks plus their registration wrapper exceed 80
lines. These are explicit pending style targets, not passed acceptance items.
The longest line has 2,310 Unicode code points. This phase does not rewrite
those templates or split the action logic to conceal the gap.

## Browser and acceptance results

The exact product checkpoint `be13254da760a31be940e46eb1295176525d3448`
passes GitHub CI run `39828487478`: **190/190 tests**, pre-build bundle equality,
eight asset/Worker checks, both previews and the unchanged full-history secret
scan. Subsequent commits add browser tools, evidence and documentation; they do
not change `web/`, the bundle, CSS or backend.

The real loopback Cookie/CSRF browser run passes both variants: all 26 required
actions are included among 29 trusted action names per variant; 11 form flows
per variant (22 total) cover success and offline/409/validation failures,
clipboard/revocation, password change and actual relogin. Keyboard, URL
refresh/back/forward, legacy routes, CSV, docs/original links, safeURL and a
390px coarse-pointer mobile context pass. Data-page loading remains five GETs
including session/accounts, 17,121 response bytes in both variants; subsequent
recording modal opens reuse the index with zero GETs. This is behavior equality,
not a new performance improvement. See `frontend-modules-functional.json`.

The visual run retains **112 PNGs / 56 pairs** across 375/390/768/1440. Forty-seven
pairs are byte/pixel identical. Nine pairs differ by 4–45 native-control border
pixels, with a maximum difference of **one 8-bit color unit** (236 pixels total).
The strict screenshot assertion failed and is not reported as passed.
A bounded repeat of just those cases retains another 36 PNGs / 18 pairs:
12 pairs match exactly; six have the same one-unit native border differences.
Neither the assertion nor its tolerance was weakened.

A final bounded control compares unchanged baseline A, unchanged baseline B
and candidate on the three remaining 1440px form views, in both viewport and
full-page capture modes. All measured DOM rectangles and computed styles are
identical. Baseline-versus-baseline itself differs by 20, 27 or 40 native-border
pixels, also by one color unit; candidate differences remain in the same range
(0–45 pixels). This supports a browser rasterization explanation rather than a
layout/style change. The strict PNG equality gap remains visible for independent
review. See the first/repeat manifests and `frontend-modules-raster-control.json`.
No product styling or template was changed to hide the difference.

Browser diagnostics retain the known startup/wrong-password 401 and injected
network/409 failures separately. No unexpected site console error, warning,
page exception or CSP violation remains in the completed functional run.
Earlier tool failures included two ambiguous button selectors and the obsolete
`#sidebar` selector; they were fixed to actual controls, and the complete
functional flow was rerun. An original-baseline timeout under concurrent local
load is retained. After the exact-commit CI full suite passed, the redundant
local full-suite process was explicitly interrupted to free the browser host;
its interrupted output is not counted as a local pass. The targeted local
47-test result, independent CI 190-test result and completed browser run are
the successful evidence.

Outstanding acceptance items: the uncompressed 100,000-byte target, 160-character
source-line/80-line function targets, and strict PNG equality as described above.
CSP tightening belongs to 4c and is deliberately pending. This draft is for
independent review; it has not been merged or deployed.

Every original visual case is explicitly accounted for in
`frontend-modules-visual-summary.json`. There were no non-form page mismatches;
the original nine differences were all login/form captures. Six original cases
match in both stabilized repeats. Three 1440px cases (new article, new credential,
snapshot) retain the one-unit border difference and remain strict-PNG gaps.
The baseline-self control is reported per case: key controls happened to match
in that control; article/snapshot baseline controls themselves varied. The
raster explanation is an evidence-based interpretation, not a claim that all
strict comparisons passed.
