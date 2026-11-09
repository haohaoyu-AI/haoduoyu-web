# AI诊断: cumulative V字 review

This feature is a separate manual analysis flow. In the explicitly enabled public-business workspace, visitors can trigger analysis, read its safe diary views and edit its complete instructions without administrator login. It does not schedule daily work, publish articles, modify source records, or write to the legacy deletable AI-report collection. Every explicit run creates a separate Beijing-day record; days without runs remain empty.

## Server configuration and authentication

- `DAILY_NOTES_OWNER_ID`: exact existing website owner UUID.
- `OPENAI_API_KEY`: server secret, never a browser setting or repository value.
- `OPENAI_REVIEW_MODEL`: explicit Responses-compatible default model identifier. There is no guessed default or configurable provider URL. Each new request may select one supported model; it does not alter the environment variable.
- Existing `SITE_ORIGIN`, session authentication and CSRF checks still apply.

When `PUBLIC_BUSINESS_MODE=1`, `/api/v1/openai-review/*` accepts an anonymous actor scoped only to the configured owner and V字. Public writes require the exact site origin and `X-Public-Business: 1`; these checks are not visitor authentication. Valid owner sessions still require CSRF, valid other-owner sessions and all Bearer headers are rejected, and expired or malformed cookies recover as anonymous only in public mode. When public mode is off, the owner's authenticated session remains mandatory. This actor never grants account, key, backup or other administrator access.

Public access means any visitor can use the shared analysis quota, view reports and change instructions affecting later analyses and cumulative conclusions. The operation limits below are not a dollar budget or a guarantee against abuse. Configuration reports `configured` only when key and model are syntactically present. `connectivity: "untested"` does **not** promise current secret connectivity; `last_success_at` records historical successful analysis. Changing the server key is not treated as a new verified connection.

The only outbound endpoint is `https://api.openai.com/v1/responses`, with `redirect:'manual'` and rejection of 3xx (never following Location), `store:false` and explicit model. No real provider call or secret configuration is part of local tests.

## API contract

All successful results use the existing `{data: ...}` wrapper and no-store caching.

- `GET /openai-review/config`: `{account,instructions,version,configured,model,default_model,supported_models,model_access,connectivity,last_success_at}`. The bounded catalog lists GPT-6.1 Sol (`gpt-6.1-sol`), GPT-6.1 Terra (`gpt-6.1-terra`), GPT-6 Astra (`gpt-6-astra`) and the configured server default if different. Model access is `unverified`; documentation availability is not account entitlement. An unsaved default has version0. First run saves it as version1 atomically with its claim.
- `PATCH /openai-review/config`: `{instructions,version}`. Complete nonempty UTF-8 text, up to32KiB; optimistic exact version required. Returns the new config view. Every run pins exact saved text/version.
- `POST /openai-review/runs`: `{run_id: lower-case UUID, mode:"incremental"|"full", model?: supported model ID}`. The selected model is pinned for every provider round and historical record. Reusing a UUID with a different explicit model is an idempotency conflict. First incremental request becomes a full baseline. Returns completed view, or existing persisted view on replay. The client persists the UUID before submission and never auto-reposts uncertain requests.
- `GET /openai-review/runs?date=YYYY-MM-DD&offset=0`: newest-first `{items,has_more}`, 50 items per page. `date` is the persisted Beijing day. Multiple records per day are retained.
- `GET /openai-review/runs/:id`: safe run view. A404 establishes absence only at that read, not that a delayed original request cannot later arrive.
- `POST /openai-review/runs/:id/release`: `{acknowledgement:"provider_outcome_unknown_no_automatic_retry"}`. Explicit uncertainty recovery described below, never a provider call.

Safe run view: `id, account, status, mode, baseline_run_id, beijing_date, created_at, completed_at, report_markdown, model, instruction_version, released_at, error_message, stage, elapsed_ms, provider_calls`. Status is `running|succeeded|failed|uncertain`. `stage` derives only from durable state: preparing, awaiting_provider, succeeded, failed or uncertain. The provider call count is a pre-dispatch intent marker, not confirmation that OpenAI received or billed a request. Completed elapsed time is fixed. It never returns raw captured source, the hidden cumulative summary, pending-verification fields, credential material or raw provider errors.

Different unresolved UUID returns409 `OPENAI_REVIEW_IN_FLIGHT` with the existing `error.run_id`. Same UUID replays without dispatching. Deterministic pre-claim rejection codes include `OPENAI_REVIEW_NOT_CONFIGURED`, `OPENAI_REVIEW_NO_DATA`, `OPENAI_REVIEW_INPUT_LIMIT`, `OPENAI_REVIEW_SOURCE_INVALID`, `OPENAI_REVIEW_BASELINE_INVALID`, `OPENAI_REVIEW_RATE_LIMIT` and validation errors. Network/database outcomes are not safe automatic retry signals.

## Data and cumulative memory

The full baseline captures all available approved fields from this owner's V字 articles, snapshots, reports, playbooks, active benchmark accounts/articles, review notes and account-health records. Source fields are explicit allowlists, not wildcard exports. Operational `source_chat` and future database columns are excluded. Article full text is not stored by the website and is never claimed as analyzed.

Subsequent successful runs carry the last successful cumulative summary plus content-hash-based additions/changes/deletions. Mutable snapshots have no updated timestamp, so normalized content hashes determine change. Untouched raw article rows are not resent. When changed snapshots refer to untouched articles, only minimal article identity/title/publication context is included. Every run also receives freshly computed whole-history statistics with explicit missing counts, sample sizes and measurement definitions. Cumulative snapshots are not incorrectly summed across repeated observations. All-article deletion still produces a valid deletion delta.

Source capture, settings, prior successful summary, hashes and input are reserved under the existing global-revision atomic mutation guard. A successful report and complete cumulative summary are saved together. Failures and unresolved outcomes never advance the checkpoint. Full rerun explicitly resets model input to the full current baseline; old reports remain intact. Existing source tables remain independently editable, while each run retains its immutable capture.

A bounded function tool reads only that pinned capture or this owner's earlier successful OpenAI reports. An explicit `source_run_id` can select an earlier successful immutable source capture, including evidence subsequently changed or deleted from live source tables. Query text and IDs are validated and bound; there is no arbitrary SQL, URL fetching, cross-owner data, or tool that modifies anything. Full source text is untrusted evidence, not instructions. Responses continuations replay every returned output item including reasoning and function-call items, with the corresponding tool output; encrypted reasoning content is requested for stateless continuation.

## Limits and uncertain outcomes

- At most20 claimed runs per Beijing day; at least30seconds between new claims.
- At most30,000 source rows,640KiB normalized source,480KiB initial model input,1.5MiB combined persisted claim and48KiB final structured output. Oversize fails before provider dispatch, without truncating or claiming all data was processed.
- At most4 provider calls per run,120seconds per call,6000 output tokens per call; no transport retry. At most3 historical tool calls, one each round,5 results and48KiB per tool result. Tool queries that cannot fit report truncation explicitly.
- An unknown/timeout or process interruption keeps the single owner/account lock. After10minutes, a still-running record is presented as uncertain on read without mutating or redispatching it. Provider5xx and408 results are conservative uncertain outcomes. Provider rejection, incomplete structured output or exhausted analysis budget records a failed run, without checkpoint advancement.
- Explicit release acknowledges the outcome may already have been billed. It keeps an uncertain record, sets `released_at` and frees the lock. It does not fetch, retry, or generate another report. A separate explicit new-run click is required. Late output from a released run cannot update the summary or report.
- Releasing an absent UUID inserts a failed operational cancellation receipt. This solves transport failure before reservation: a delayed original POST can never later dispatch that cancelled ID. Repeated release/replay returns the same receipt. New cancellation receipts have separate durable limits of 20 per Beijing day and a 30-second interval. A rate rejection retains the pending ID for read-only checks. Live nonstale or successful runs cannot be released; a run older than ten minutes cannot dispatch another provider round.
- A successful provider response followed by unknown database-save outcome is not automatically called again. Read the existing UUID first. Logs/API errors contain safe fixed messages only.

D1 documents a2,000,000-byte maximum row/string/BLOB; the1.5MiB claim bound plus final output leaves margin. Source: https://developers.cloudflare.com/d1/platform/limits/ (checked2026-11-08). Responses continuation: https://developers.openai.com/api/docs/guides/function-calling and https://developers.openai.com/api/docs/guides/migrate-to-responses?api-mode=responses .

## Deployment preparation and verification

Migration `drizzle/0020_openai_review.sql` is additive: two tables and two indexes, including the partial unique unresolved-run lock. No runtime DDL is permitted. Apply the exact reviewed migration to the intended D1 only through the separately guarded operator release procedure. The existing Worker-only deployment inherits bindings and does not itself apply migrations. Deploying routes before the migration is not a complete rollout. Configure secrets/model only through the authorized private environment setup, then separately approve any real paid smoke analysis. Never put keys in instructions, examples, commit logs, backup data or browser fields.

Backup formatv16 includes existing eight review source tables and the two new analysis tables, preserving historical v1–v15 restore compatibility. Backup access remains administrator-only. The former v15 omitted review source tables; tests explicitly cover the repaired v16 owner-scoped export/restore. Active/uncertain rows restore still fenced: recovery is explicit, not replay.

Local mocked validation: `node --test tests/openai-review.test.mjs tests/openai-review-migration-backup.test.mjs`, full `npm test`, build and migration inventory gates. No production connectivity can be inferred from mocked tests.

## Model documentation

Verified official API catalog: https://developers.openai.com/api/docs/models/gpt-6.1-sol , https://developers.openai.com/api/docs/models/gpt-6.1-terra and https://developers.openai.com/api/docs/models/gpt-6-astra . Astra is GPT-6, not a fabricated GPT-6.1 identifier. Each supports Responses, function calling and structured outputs. No additional provider call is made merely to populate the selector.


## Runtime incident fix and safe failure diagnostics (2026-11-08)

The original provider call used `redirect:'error'`. Under this repository's Workers runtime (`compatibility_date: 2026-07-30`, flags `nodejs_compat`, `global_fetch_strictly_public`, `enable_request_signal`), real workerd rejects this option locally before dispatch. The dispatch-intent count had already been committed, and the old catch converted the local TypeError to UNKNOWN. Node tests with an injected response never exercised this runtime validation.

`tests/openai-review-runtime.test.mjs` now uses real workerd through Miniflare and the exact checked-in runtime file. Verified locally with Node v24.22.1, Miniflare 4.20260730.0 and workerd 1.20260730.1. Every outbound request is intercepted by an in-memory handler; no internet/provider request or real credential is used. It verifies the old option produces a TypeError with zero outbound calls, the corrected manual mode succeeds through both default and injected native fetch, 301/302/303/307/308 never follow Location, and the real AbortSignal/response stream path works. The production worker uses the same source/options and checked-in runtime profile, but these local checks do not verify production bindings, account entitlement, network connectivity or actual billing.

Official runtime documentation: https://developers.cloudflare.com/workers/runtime-apis/request/ . Workers does not implement redirect error mode; manual mode preserves redirect refusal without forwarding Authorization to a redirect destination.

A separate UI regression was reproduced after releasing an uncertain historical record. Observation had checked the historical status without matching the new pending ID. Both observation gates now stop only when the current pending ID itself is uncertain. New submissions get GET-only progress checks; no POST retry or automatic release was added.

Failure diagnostics use existing storage only, with no migration or new endpoint:

- Existing run `error_code` and safe Chinese `error_message` distinguish local preparation, uncertain dispatch registration, connection, timeout, response reading, and incomplete response. A received HTTP status is appended as a validated integer. GET views expose only a known error code and the fixed safe description, never provider request/response IDs or usage.
- Config reads distinguish absent key from invalid key format using a fixed configuration error. Accepted key syntax is the existing 20–512 length range restricted to printable ASCII, with no trimming. Invalid format fails before claim/provider dispatch; no key value, fragment or length is exposed.
- Existing `openai-review.finished` audit detail stores at most four whitelisted diagnostic entries with round number, phase, timeout flag, HTTP status, bounded request/response IDs, known response status/incomplete reason and nonnegative bounded integer usage fields actually returned by the provider. Unknown fields and secret-shaped IDs are omitted. Raw errors, provider messages, authentication headers and model input/output are never diagnostic fields.
- Existing `provider_response_id` preserves the last actually observed response even when a later round fails. It is not necessarily the failed round's response ID and is not evidence that an unknown later call is retrievable. The audit entry identifies the exact round that supplied each ID. Token/HTTP metadata is neither a complete report nor an exact bill.
- Audit evidence and final run state commit together. A hard interruption before final persistence can still leave diagnostics unavailable. This patch does not add durable background execution or promise survival after browser disconnect.
- Connection, timeout, response-read and dispatch-registration uncertainty continue to retain the unresolved lock. Reads remain side-effect-free; explicit release still never invokes the provider. No time limit, model, token budget, provider-call limit or automatic retry policy changed.

## Bounded report completion (2026-11-09)

A production verification after the runtime repair reached OpenAI successfully but exhausted all four provider rounds while the model continued requesting evidence. The previous loop offered the evidence tool on the final round, then rejected another tool request without giving the model a final synthesis turn.

The final permitted provider round (or an already exhausted evidence-tool allowance) now uses `tool_choice: "none"` and instructs the model to produce the structured report from the supplied capture and evidence already returned. Missing or unverified evidence must remain explicitly qualified; the report must not claim to have inspected additional material. Earlier rounds retain the normal bounded evidence tool. This preserves the existing four-provider-call/three-tool-call budget, output limits and no-retry behavior.

The Responses API documents `tool_choice: "none"` in its [function-calling guide](https://developers.openai.com/api/docs/guides/function-calling?api-mode=responses#tool-choice). The provider/database regression covers three evidence lookups followed by a persisted report within the original limit. The existing real-workerd runtime tests also pass.

A second production verification with roughly 95,000 input tokens hit the former 45-second provider deadline while waiting for the third response. The provider deadline is now 120 seconds per call. The browser POST deadline is 540 seconds, allowing four provider calls plus a persistence margin, and the server's stale-run fence is ten minutes. These deadlines are aligned without adding retries or increasing the provider-call or output-token limits. GET status checks remain read-only and bounded separately.
