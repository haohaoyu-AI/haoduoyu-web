# Atomic snapshot WIP handoff — model change boundary

Parent requested immediate safe stop so the next turn can use `gpt-6.1-sol/high`.
This WIP is **not ready to deploy**. No commit, push, PR, merge, migration, or deployment was performed for this task.

## Checkout and authorization

- Repository: `/workspace/haoduoyu-web`, branch `opt/atomic-daily-snapshot`.
- HEAD/base: `fe8efa479c0c2865970b43053db4deb62a3380c9` (previously completed article UI).
- Current source, tests, and documentation are saved as uncommitted files in this checkout.
- Authorized scope: step 1 only, no-migration atomic daily snapshot/index; finish necessary focused checks, one final CI, commit and push this independent branch. Parent handles integration. No new PR, merge, deploy, production access, credentials, Notion token, or Cron.
- Do not implement reconciliation UI, insurance progress, or slot configuration. Memo migration 0006 belongs to another worker. Global visual/CSS work belongs to another worker.
- Existing todo/notes implementations and business data, frontend/CSS, and schema remain outside this change.

## Saved implementation

- `src/snapshot.mjs`: GET `/api/v1/snapshot?date=YYYY-MM-DD` and GET `/api/v1/snapshot/index`. One outer `consistentRead` includes initialized control, scope/auth resolution, data projection, serialization, session recheck, and the surrounding revision checks.
- `src/snapshot-access.mjs`: configured public owner and designated notes owner; existing public account scope; only the configured owner's real session can read the all-account owner projection. Other sessions and any Authorization header are rejected. Valid sessions cannot downgrade to anonymous after revocation. Scope changes across retries return 409. Public anonymous limiter runs before D1 where no cookie exists.
- `src/snapshot-budget.mjs`: read-only SELECT adapter tracks every query and D1 rows_read receipt including retries/auth/control. Limits: 45 queries; 4000 materialized projection rows; 1 MiB materialized projection bytes; 1000 index dates; 8 MiB cumulative hash input; 1 MiB response; 100000 observed rows scanned. Whole-response errors, no truncation. Auth/scope results have their own bounds rather than counting against projection rows/bytes. The rows_read cap is observed after a query, not a pre-query scan/CPU guarantee.
- `src/snapshot-projection.mjs`: bounded pages, explicit authorized columns, draft run_date and Beijing publication dates, notes and observation/metric dates, pipeline null/unknown states, active template links, 30 inclusive days `[D-29,D]`, distinct completed dates, habit threshold 21. Full index uses one scan plus in-memory grouping and the same daily hash builder. Shared canonical article references avoid repeated large payload copies across dates. The year 9999 boundary was fixed and tested.
- `src/worker.mjs`: import and exact two-route dispatch before the existing general publicBusinessAccess/control flow. This is the principal shared integration touchpoint.
- `src/lib/request-trace.mjs`: adds only static `snapshot` and `snapshot/index` route labels.
- Documents: two inline-schema additions in `public/openapi.json`; bounded `snapshot-contract` section in `public/api-docs.html`; additive `public/llms.txt` text; `docs/atomic-daily-snapshot.md`.
- Contract preservation: `tests/article-pipeline-projection.mjs` first validates/removes only the exact new snapshot document delta, then retains existing historical assertions. New frozen fixture `tests/fixtures/snapshot-document-delta.json` and mutation tests verify this.

## Evidence completed before stopping

- `tests/snapshot-projection.test.mjs`: final **8/8 passed**, including the final article-memory sharing/date-count guard changes.
- `tests/snapshot-api.test.mjs`: **11 cases passed** across initial 10 passing cases and one targeted successful rerun after fixing an invalid synthetic fixture. Real Worker/D1 receipts showed zero SQL writes for GET; concurrency, scope, session revocation, index history/deletion, hashes, and lowered budgets covered.
- `tests/snapshot-document-projection.test.mjs` plus existing article/request-trace projection tests: **13/13 passed**. After removing the exact approved document additions, OpenAPI structurally restores the fe8efa base and HTML restores byte-for-byte.
- Initial `npm run build` passed before the last core resource-bound refinement and late root edits. It is **not evidence of a final build**.
- Independent read-only review found no remaining auth/atomicity blocker. Its one contract observation is deliberate: new snapshots include active template link metadata only; links to soft-deleted templates are omitted. Confirm the final docs state this clearly; existing todos API is unchanged.
- No final full CI, final secret scan, final artifact hash validation, commit, or push yet. Do not report the entire task complete.
- Edge CPU/free-tier execution cost remains **unmeasured**. Official Cloudflare documentation was checked; batch() is one invocation query call under current limits, unlike older repository text. Do not claim free-tier CPU compliance or benchmark production.

## Resume with minimum remaining work

1. Read repo instructions already applicable to this checkout and this handoff. Preserve all uncommitted files. Use the newly requested `gpt-6.1-sol/high` setting for resumed workers.
2. Inspect final diffs for scope and active-template-link documentation; do not redo completed implementation or unchanged tests.
3. Update `.ci/public-assets.json` for only changed public documentation assets (openapi/api-docs/llms). Frontend app/style must remain identical to fe8efa; app SHA256 `bea903e4d79668f372ab9c631352dab0a7aa36024ef1a9b95f66754b5c175cd7`, style SHA256 `6397232ef788775f21ba6f19835afb4ffec183e459ad7230e1b9bfa729d7591f`.
4. Run final build and required artifact/secret checks. Final core resource refinements happened after the earlier Worker build; perform only appropriate targeted checks if needed, then rely on the single final CI for integrated coverage.
5. Confirm no schema, migrations, todo/notes implementation, frontend, or CSS change. Run diff checks. Record exact validation evidence in task docs.
6. Commit and push `opt/atomic-daily-snapshot`; wait for the one final CI. Fix necessary failures rather than skipping them. Do not create a PR or deploy.
7. Report final SHA, branch, CI URL/result, shared worker/trace/document touchpoints, and unmeasured edge CPU limitation to parent.

## Tooling and operations status

- Git fetch/push works. The local gh CLI token/API route was not usable earlier; use the connected authorized GitHub tools for CI reads, discovered from `ALL_TOOLS` (not an approval denial or reason to bypass permission).
- Useful connected read: `mcp__codex_apps__github_fetch` with the repository actions/runs URL filtered by head_sha; result structuredContent.content holds JSON. Job log fetch is available after completion.
- At safe stop, no live build/test/git write process was observed; unrelated old zombie processes remain. Contract agent explicitly confirmed no pending write/test. All saved modifications are local and known.
- No auto-review denial or uncertain external write exists in this task.
