# Phase 4b: action and request lifecycle plan

Base: `2e12147b700ac604d7cccf8e034374644ac99a03`.
This initial checkpoint contains the plan and failing characterization tests;
it is not a completed implementation. No deployment is authorized.

- Keep the action names and pre-dispatch click/keyboard/popover ordering. Move
  original case bodies into handlers; retain form validation, write payloads,
  await/focus order and error handling while splitting the submit dispatcher.
- Coalesce **pending** equivalent GET transports only within one explicit
  context/render cycle, session identity/epoch, invalidation generation and
  effective request options. Do not add a general completed-response cache.
  Parse a shared raw JSON response separately for each consumer so mutable
  result objects are not shared. Writes and HEAD are not coalesced or retried.
- Page renders own a context aborted when the next render starts. Keep
  renderVersion and session guards. Background bootstrap/follow-up reads use
  separate contexts; changing page must not cancel writes or background work.
  Closing a dialog may cancel its own reads, independently of page refresh.
- A consumer's AbortSignal only releases that consumer; abort the underlying
  fetch when no consumers remain. Handle fetch and body-read AbortError as
  cancellation, while preserving genuine HTTP/network/JSON failures.
- Index caching may continue sharing fulfilled frozen rows across the session.
  A new page/dialog cannot adopt a previous context's still-pending index;
  generation/session guards and failed-entry cleanup remain in force.
- Successful writes invalidate future GET joining and the index generation.
  Session resets also cancel page reads. Old background 401 remains protected
  by the existing epoch/identity check; an ordinary write does not suppress a
  genuine current-session 401.
- Mechanically split long templates into string-equivalent fragments, with
  executable 160-character/80-line checks. Preserve e()/safeURL, all HTML
  whitespace and the current CSS/inline-style/CSP behavior. Report the readable
  unminified bundle size honestly; do not minify or delete features to reach
  100,000 bytes.

First red tests execute the actual baseline bundle: duplicate pending GET
transport count, isolated consumer aborts, old-page abort and refresh abort.
Existing identity/index/route/form tests remain in addition to these cases.
The final scope includes real local Cookie/CSRF request/abort evidence and the
existing action/form/four-width comparison protocol. No C5/C6 large benchmark.

## Request-context checkpoint

The first implementation keeps page, modal and background pending maps separate.
Only GET is shared; each subscriber decodes its own response and owns its abort
listener. The final departing subscriber aborts the transport. Ordinary writes
advance the existing index generation; authentication writes retain the session
reset. Pending indexes cannot cross ownership contexts, while completed frozen
indexes remain session cached. Existing epoch/identity and render guards remain.

Local targeted frontend/route suite: 53/53 passed. Full regression is running at
this checkpoint, not yet a completed result. Build and eight asset checks passed;
real browser lifecycle, action registry, formatting and visual evidence are still
pending. Current unminified UTF-8 bundle is 112,496 B, exceeding the 100,000 B
project target; no size pass is claimed.

## Registry and source-layout checkpoint

The core checkpoint subsequently completed the full local suite: 199/199.
Additional body-read/last-subscriber cancellation and actual transport/body/JSON
failure cases pass (15 lifecycle test counts, including three subtests).
The new action registry preserves all original case bodies and action names;
form handlers retain their original validation and payload bodies. Nine event
bindings retain order and capture settings. A structural test compares handlers
with main and all cooked template strings, including HTML whitespace. Formatting
uses the existing unminified esbuild printer (UTF-8); template continuations do
not add output whitespace. No CSS, inline style or CSP change is included.

`npm run check:web` now checks all 30 source modules and 349 functions, without
exclusions: lines <=160 characters and function spans <=80 lines. CI runs this
before regeneration. The targeted UI/route suite passes 59/59 and the registry,
template and checker suite 4/4. Final full CI and browser comparison remain
pending at this checkpoint. The readable bundle is 114,413 B (14,413 B over the
100,000 B target; baseline 106,865 B). This size target is not marked passed.

A test-only loopback probe already completed 12 candidate checks with real
Cookie/CSRF authentication; baseline failed four intended new-behavior checks.
It observed actual duplicate GET counts, HTTP cancellation, a surviving shared
consumer, a write completing across navigation, same-user stale 401 isolation
and current real 401 logout. This intermediate evidence predates the registry
layout and does not replace final full action/form/four-width evidence.
