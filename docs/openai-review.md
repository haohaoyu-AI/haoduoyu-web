# OpenAI API cumulative V字 review

This feature is a separate manual analysis flow. In the explicitly enabled public-business workspace, visitors can trigger analysis, read its safe diary views and edit its complete instructions without administrator login. It does not schedule daily work, publish articles, modify source records, or write to the legacy deletable AI-report collection. Every explicit run creates a separate Beijing-day record; days without runs remain empty.

## Server configuration and authentication

- `DAILY_NOTES_OWNER_ID`: exact existing website owner UUID.
- `OPENAI_API_KEY`: server secret, never a browser setting or repository value.
- `OPENAI_REVIEW_MODEL`: explicit Responses-compatible model identifier. There is no guessed default or configurable provider URL.
- Existing `SITE_ORIGIN`, session authentication and CSRF checks still apply.

When `PUBLIC_BUSINESS_MODE=1`, `/api/v1/openai-review/*` accepts an anonymous actor scoped only to the configured owner and V字. Public writes require the exact site origin and `X-Public-Business: 1`; these checks are not visitor authentication. Valid owner sessions still require CSRF, valid other-owner sessions and all Bearer headers are rejected, and expired or malformed cookies recover as anonymous only in public mode. When public mode is off, the owner's authenticated session remains mandatory. This actor never grants account, key, backup or other administrator access.

Public access means any visitor can use the shared analysis quota, view reports and change instructions affecting later analyses and cumulative conclusions. The operation limits below are not a dollar budget or a guarantee against abuse. Configuration reports `configured` only when key and model are syntactically present. `connectivity: "untested"` does **not** promise current secret connectivity; `last_success_at` records historical successful analysis. Changing the server key is not treated as a new verified connection.

The only outbound endpoint is `https://api.openai.com/v1/responses`, with redirect refusal, `store:false` and explicit model. No real provider call or secret configuration is part of local tests.

## API contract

All successful results use the existing `{data: ...}` wrapper and no-store caching.

- `GET /openai-review/config`: `{account,instructions,version,configured,model,connectivity,last_success_at}`. An unsaved default has version0. First run saves it as version1 atomically with its claim.
- `PATCH /openai-review/config`: `{instructions,version}`. Complete nonempty UTF-8 text, up to32KiB; optimistic exact version required. Returns the new config view. Every run pins exact saved text/version.
- `POST /openai-review/runs`: `{run_id: lower-case UUID, mode:"incremental"|"full"}`. First incremental request becomes a full baseline. Returns completed view, or existing persisted view on replay. The client persists the UUID before submission and never auto-reposts uncertain requests.
- `GET /openai-review/runs?date=YYYY-MM-DD&offset=0`: newest-first `{items,has_more}`, 50 items per page. `date` is the persisted Beijing day. Multiple records per day are retained.
- `GET /openai-review/runs/:id`: safe run view. A404 establishes absence only at that read, not that a delayed original request cannot later arrive.
- `POST /openai-review/runs/:id/release`: `{acknowledgement:"provider_outcome_unknown_no_automatic_retry"}`. Explicit uncertainty recovery described below, never a provider call.

Safe run view: `id, account, status, mode, baseline_run_id, beijing_date, created_at, completed_at, report_markdown, model, instruction_version, released_at, error_message`. Status is `running|succeeded|failed|uncertain`. It never returns raw captured source, the hidden cumulative summary, pending-verification fields, credential material or raw provider errors.

Different unresolved UUID returns409 `OPENAI_REVIEW_IN_FLIGHT` with the existing `error.run_id`. Same UUID replays without dispatching. Deterministic pre-claim rejection codes include `OPENAI_REVIEW_NOT_CONFIGURED`, `OPENAI_REVIEW_NO_DATA`, `OPENAI_REVIEW_INPUT_LIMIT`, `OPENAI_REVIEW_SOURCE_INVALID`, `OPENAI_REVIEW_BASELINE_INVALID`, `OPENAI_REVIEW_RATE_LIMIT` and validation errors. Network/database outcomes are not safe automatic retry signals.

## Data and cumulative memory

The full baseline captures all available approved fields from this owner's V字 articles, snapshots, reports, playbooks, active benchmark accounts/articles, review notes and account-health records. Source fields are explicit allowlists, not wildcard exports. Operational `source_chat` and future database columns are excluded. Article full text is not stored by the website and is never claimed as analyzed.

Subsequent successful runs carry the last successful cumulative summary plus content-hash-based additions/changes/deletions. Mutable snapshots have no updated timestamp, so normalized content hashes determine change. Untouched raw article rows are not resent. When changed snapshots refer to untouched articles, only minimal article identity/title/publication context is included. Every run also receives freshly computed whole-history statistics with explicit missing counts, sample sizes and measurement definitions. Cumulative snapshots are not incorrectly summed across repeated observations. All-article deletion still produces a valid deletion delta.

Source capture, settings, prior successful summary, hashes and input are reserved under the existing global-revision atomic mutation guard. A successful report and complete cumulative summary are saved together. Failures and unresolved outcomes never advance the checkpoint. Full rerun explicitly resets model input to the full current baseline; old reports remain intact. Existing source tables remain independently editable, while each run retains its immutable capture.

A bounded function tool reads only that pinned capture or this owner's earlier successful OpenAI reports. An explicit `source_run_id` can select an earlier successful immutable source capture, including evidence subsequently changed or deleted from live source tables. Query text and IDs are validated and bound; there is no arbitrary SQL, URL fetching, cross-owner data, or tool that modifies anything. Full source text is untrusted evidence, not instructions. Responses continuations replay every returned output item including reasoning and function-call items, with the corresponding tool output; encrypted reasoning content is requested for stateless continuation.

## Limits and uncertain outcomes

- At most20 claimed runs per Beijing day; at least30seconds between new claims.
- At most30,000 source rows,640KiB normalized source,480KiB initial model input,1.5MiB combined persisted claim and48KiB final structured output. Oversize fails before provider dispatch, without truncating or claiming all data was processed.
- At most4 provider calls per run,45seconds per call,6000 output tokens per call; no transport retry. At most3 historical tool calls, one each round,5 results and48KiB per tool result. Tool queries that cannot fit report truncation explicitly.
- An unknown/timeout or process interruption keeps the single owner/account lock. After5minutes, a still-running record is presented as uncertain on read without mutating or redispatching it. Provider5xx and408 results are conservative uncertain outcomes. Provider rejection, incomplete structured output or exhausted analysis budget records a failed run, without checkpoint advancement.
- Explicit release acknowledges the outcome may already have been billed. It keeps an uncertain record, sets `released_at` and frees the lock. It does not fetch, retry, or generate another report. A separate explicit new-run click is required. Late output from a released run cannot update the summary or report.
- Releasing an absent UUID inserts a failed operational cancellation receipt. This solves transport failure before reservation: a delayed original POST can never later dispatch that cancelled ID. Repeated release/replay returns the same receipt. New cancellation receipts have separate durable limits of 20 per Beijing day and a 30-second interval. A rate rejection retains the pending ID for read-only checks. Live nonstale or successful runs cannot be released; a run older than five minutes cannot dispatch another provider round.
- A successful provider response followed by unknown database-save outcome is not automatically called again. Read the existing UUID first. Logs/API errors contain safe fixed messages only.

D1 documents a2,000,000-byte maximum row/string/BLOB; the1.5MiB claim bound plus final output leaves margin. Source: https://developers.cloudflare.com/d1/platform/limits/ (checked2026-11-08). Responses continuation: https://developers.openai.com/api/docs/guides/function-calling and https://developers.openai.com/api/docs/guides/migrate-to-responses?api-mode=responses .

## Deployment preparation and verification

Migration `drizzle/0020_openai_review.sql` is additive: two tables and two indexes, including the partial unique unresolved-run lock. No runtime DDL is permitted. Apply the exact reviewed migration to the intended D1 only through the separately guarded operator release procedure. The existing Worker-only deployment inherits bindings and does not itself apply migrations. Deploying routes before the migration is not a complete rollout. Configure secrets/model only through the authorized private environment setup, then separately approve any real paid smoke analysis. Never put keys in instructions, examples, commit logs, backup data or browser fields.

Backup formatv16 includes existing eight review source tables and the two new analysis tables, preserving historical v1–v15 restore compatibility. Backup access remains administrator-only. The former v15 omitted review source tables; tests explicitly cover the repaired v16 owner-scoped export/restore. Active/uncertain rows restore still fenced: recovery is explicit, not replay.

Local mocked validation: `node --test tests/openai-review.test.mjs tests/openai-review-migration-backup.test.mjs`, full `npm test`, build and migration inventory gates. No production connectivity can be inferred from mocked tests.
