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
