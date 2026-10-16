User-facing one-time start is `/writing/editorial-run`; the forms below are assistant-only execution controls.

# Contract v2 ordinary webpage

Authenticated entry: `/writing/editorial-helper` (optionally `?run_id=<UUID>`).
The server page requires the owner’s ChatGPT sign-in and supplies the exact current
prompt version. This UI uses ordinary HTTP adapters, not raw MCP.

## Workflow

1. Open a known run or refresh the owner-only recent list, optionally including archives.
2. Fill the complete create JSON template with topic, angle, style requirements,
   materials, at least two distinct public HTTPS sources, dated/contextual facts,
   and five actual pairwise-distinct participant UUIDs. Source and identity placeholders
   deliberately remain blank. There is no UUID or provenance generator.
3. Explicitly claim the current stage. Claiming makes no model request.
4. For outline/body/structure revision/fact revision, separately confirm this specific
   paid phase. Only this page’s winning ephemeral claim can submit it. Each request
   binds run, stage, expected model and exact input hash. Synchronous in-flight and
   per-run/stage attempt guards prevent duplicate submissions. NDJSON uses the shared
   `readDailyNdjson` reader.
5. For the four independent reviews, obtain the exact claimed input, run the actual
   independent participant, and supply the full report, actor UUID, real execution
   UUID and actual model. Identity/model must match the frozen participants.
6. Zero-issue revision stages explicitly skip the paid revision and retain the same
   full article and SHA-256. Final independent review is still mandatory.
7. Final verification requires fresh title/full-body coverage and a separate full-text
   read attestation. A separate unchecked confirmation freezes that exact version.
8. A further separate unchecked confirmation dispatches the same frozen article to
   the existing illustration/private-draft flow. It does not publish publicly.

## Safety and readback

- Mount, browser navigation, refresh and online recovery only read existing records.
  They never claim, call a model, dispatch or resume a run automatically.
- Paid claim tokens exist only in a ref and request memory. They are never rendered,
  logged by this component, or placed in browser storage. Refresh/navigation loses
  the winning token; the existing API intentionally does not reissue it. The UI then
  permits only readback. This can strand an unexecuted paid claim; do not try to fix it
  with a second paid call or fabricated token.
- All eight stages remain visible with actual server state, exact full artifacts,
  identity/execution/provenance, hashes, requested/returned models, usage and receipt
  diagnostics. Independent owner-attested reports are never labelled provider text.
- HTTP 524 is a technical receipt failure; `content_invalid` means the completed
  provider output failed the content contract; `content_blocked` means an independent
  report found a material/content blocker. These are displayed separately.
- Completed provider receipts can be parsed/saved through `recover_completed`, with
  no provider retry. Failed or unknown paid calls stay read-only.
- Archive/pause/restore use reasoned, explicit buttons. Restoration never generates
  or dispatches. A paused run archived then restored remains paused.
- Authentication errors clear selected results and all ephemeral execution/review state.
- Owner/run-scoped session storage saves only disclosure open/closed booleans. Exact
  title and paragraphs are rendered as text, preserving whitespace, without HTML
  injection or full-text truncation. Frozen text is labelled frozen only if its exact
  hash matches `final_sha256`.

## Offline verification

Run:

- `node tests/editorial-ui.mjs`
- `node_modules/.bin/tsc --noEmit --incremental false`
- `node_modules/.bin/eslint components/editorial-run.tsx app/writing/editorial-helper/page.tsx tests/editorial-ui.mjs`

The test uses the real TS components and contract helpers with an offline loader,
React SSR and mocked hook/HTTP interactions. It covers authenticated entry, complete
safe templates, all eight stages, exact final text, separate technical/content states,
all four separately-confirmed paid phases, same-tick duplicate clicks, token-loss
behavior, zero-issue skipping, independent final-coverage attestation, auth clearing,
completed-receipt recovery, archive/restore/dispatch separation, and stable folding.
No real database, browser session, account, model, or network is used. Browser visual
QA, live identity execution, paid model calls, and deployment are not verified here.
