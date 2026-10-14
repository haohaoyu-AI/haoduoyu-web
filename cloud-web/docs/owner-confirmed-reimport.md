# Owner-authorized manual-draft reimport

## Current owner policy and scope

For actively requested manual Word uploads, the owner explicitly accepts duplicate private drafts and wants an uncertain save retried efficiently. Within that authorized manual task, do not ask again solely because the old attempt is unknown, lacks a URL, or a duplicate may exist. The goal is at least one correct, complete private draft. Automatic writing and hot-topic runs remain `text_saved`; this does not grant platform delivery to generated runs. Only the authenticated owner's allowed Haoduoyu accounts are eligible. No public/scheduled publication, deletion, changes to user-edited/published drafts, or relaxed website access.

Consumed attempts use `reserve_article_upload` mode `owner_confirmed_reimport`. A consumed attempt never resets. Each new reservation is a linked, independently audited attempt with one fresh execution claim and one fresh, single-use consume token. Exact one-off approval remains supported. `authorization_scope=duplicate_tolerant_task` uses explicit standing owner approval within the same frozen manual task without requiring another duplicate confirmation. Message references are audit references, never signatures or proof of human identity. Caller confirmation policy must establish authorization and the actual prior executor's termination.

The server does not run a retry loop. End all browser/file/status writes before recording an end acknowledgement. Do not claim that a crashed tab's exit is server-proven. If the same fault repeats without progress, stop and report the concrete fault rather than repeatedly importing. Stop after one complete independent verification succeeds. No arbitrary count limit is imposed.

## Safe sequence

1. Read the current article, frozen Word, upload attempt and destination. Verify manual source bytes exist and there is no generated-run lineage. Check the same account's current editor and draft list.
2. Establish that the prior executor has actually ended all browser/file/status writes. If its current claim expired, claim normally; a lost live claim needs the separate exact recovery protocol. Never retrieve hidden credentials or SQL-clear a lock.
3. `record_article_upload_executor_end` receives the exact current consumed attempt, monotonic revision, Word SHA/size, account, current execution claim and actual execution-end reference. Its full snapshot/CAS acknowledgement freezes the old attempt and old status writers. It grants no import.
4. Reserve one linked new attempt with fresh browser-visible named `.docx` evidence and a new empty private editor. Keep every known historical draft URL. Prior submission remains submitted/unknown; do not rewrite it to never-attempted.
5. Only the first successful reservation returns fresh `execution_claim` and `consume_token`. Keep them only in volatile memory. Identical replay returns the allocated attempt without secrets or a new grant.
6. Immediately before one actual file submission, consume the new attempt/token with exact fresh file evidence and `reimport_editor_confirmation`. Only this response's `execute_import=true` permits one native Open OR supported file-chooser submission. Never replay old grants.
7. Record the new real URL, independently reopen, and verify full title/body, all ordered images and Word paragraph anchors, saved state, account, and Zhihu cover. Only then record `verified` and final completed/saved. Preserve all old attempts, receipts and known drafts. No fabricated URL or historical save time.

## Required inputs

All normal reservation fields remain required. Reimport additionally requires:

- `previous_attempt_id`: exact current consumed source attempt
- `current_word_sha256`: identical frozen and regular `word_sha256`
- `authorization_key`: fresh bounded action key, unique per child; exact replay is idempotent
- `confirmation_message_id`: real owner approval audit reference
- `prior_executor_end_reference`: exact append-only actual-end acknowledgement
- `confirm_reimport=true`, `confirm_new_draft=true`, `preserve_existing_draft=true`, `prior_executor_stopped=true`
- `preflight.existing_drafts.editor_empty=true`, `private_draft=true`, current blank private-editor URL and all known historical matching URLs

Known URL path is backward-compatible: omit `prior_draft_identity` (or use `known_editor_url`) and supply `existing_editor_url`, a real canonical URL already recorded on the old attempt. It must remain in matching URLs.

Unknown/no-URL path, for both executor-end and reservation:

- `prior_draft_identity=unknown_without_editor_url`
- Omit `existing_editor_url` entirely. Do not substitute the blank editor or a invented draft ID.
- Old attempt must be consumed `outcome_unknown`, with empty recorded editor URLs and no attempt/destination readback or destination draft URL.
- Reservation additionally requires `current_task_id`, a stable non-secret reference to this current manual task.
- An empty matching URL list is legitimate if there are no known historical URLs; prior submission stays `submitted_unknown`.

### Cached-schema compatibility

Older clients still advertise `existing_editor_url` as a required string with no minimum length or URL-format constraint. Their supported compatibility input is exactly `existing_editor_url=""`, in both executor-end and `owner_confirmed_reimport` calls. The backend explicitly normalizes that input to unknown identity and omits the URL; an empty string is never recorded as a draft URL. A blank-editor URL, whitespace or an invented ID is not this compatibility input.

If that old reservation schema cannot supply `current_task_id`, only this exact one-off compatibility branch derives a stable non-secret task audit reference from authenticated owner/article/platform. It still requires the new specific owner approval reference, exact consumed unknown/no-URL source attempt, frozen Word/account, actual executor end, live current claim and all confirmation/preflight/consume checks. It does not infer `duplicate_tolerant_task` or any standing permission. Supplying a changed task/account/Word or replaying an old grant remains fenced. A normally reacquired live claim after the original lease expires may record the actual end; the original attempt's claim hash remains unchanged audit evidence.

Standing duplicate-tolerant task authorization additionally uses:

- `authorization_scope=duplicate_tolerant_task`
- `current_task_id`: unchanged for this task
- `confirm_duplicate_tolerant_task=true`: only under actual owner's explicit duplicate-tolerant authorization

Later attempts in that same task may retain the real original owner approval reference, but need a fresh action key, exact new source attempt, actual end acknowledgement and fresh browser evidence. The same approval cannot be rebound to another task, account or frozen Word. Each source has at most one child; races and replay cannot issue a second consume grant. Default `authorization_scope=exact_reimport` continues to require a separate owner approval for a later child.

## Legacy manual Word with no recorded attempt

An old manual intake may have uncertain platform history and `attempt:null`. It cannot supply a consumed parent or truthfully confirm never-submitted. Only existing, explicit owner approval to accept a possible duplicate private draft authorizes mode `owner_confirmed_legacy_reimport`. This is a separate, single-use root attempt, not a fabricated historical upload.

The executor must first stop all prior browser/file/status writes for this task, hold a current execution claim, retain the unchanged Word, check the actual account and current draft list, and prepare a new empty private editor and the actual file chooser. An empty list is evidence only; it does not grant permission. The server records the stop declaration as an attestation and cannot prove browser termination.

Use the normal Word/account/preflight fields and the existing owner-confirmation fields, with:

- `mode=owner_confirmed_legacy_reimport`
- `expected_attempt_id=null`, `confirm_unrecorded_history=true`
- `current_task_id`, the real owner `confirmation_message_id`, and a fresh `authorization_key`
- `current_word_sha256` equal to the frozen `word_sha256`
- `prior_executor_stopped=true` and an actual `prior_executor_end_reference`
- `confirm_reimport=true`, `confirm_new_draft=true`, `preserve_existing_draft=true`
- No `previous_attempt_id`. Keep `prior_submission=submitted_unknown` and all known historical URLs; do not invent a URL or `never_attempted`.

The branch is limited to an authenticated owner's verified manual intake with no recorded destination attempt and an actual integer upload guard version of 0 or 1. Word finalization sets version 1; this does not prove that earlier browser uploads never happened. Explicit duplicate-risk authorization remains required, and historical submission remains unknown for either version. Generated runs, completed deliveries and deletion are excluded.

The server freezes its actual guard value in `reserved_upload_guard_version` on the authorization audit, without changing the article or accepting a caller-supplied guard value. Reservation compares that exact snapshot; consumption and lineage validation require it to remain unchanged. Earlier root records without this audit field are compatible only with their original guard 0. Read-only upload and recovery responses expose the current guard for diagnosis, without granting submission. A race that changes the guard or creates an attempt invalidates the reservation. The first winner records the historical destination snapshot and unknown submission history, rotates the claim, and returns one volatile consume token. Identical replay never reissues that token. Consumption requires the exact unchanged task, source, Word, snapshot, live claim, token and fresh empty private editor. Record and independently verify the newly created draft through the normal pipeline.

If a `verify_existing` attempt already exists, this root branch is unavailable. Preserve that record and report the condition; do not clear it or fabricate `consumed_at`. After a genuine root submission is consumed, any later authorized retry must use the normal consumed-parent/executor-end chain.

The Cua session uses this `import_mode` with the same `reimport` object. The bridge additionally needs the exact owner-approved legacy scope. Refresh and load the matching runner and bridge source; a website deployment alone does not update running closures.

## Migration and verification

Migration `0028_manual_upload_duplicate_tolerant_task.sql` adjusts only the confirmation-reference unique index. Exact one-off confirmations remain unique; standing-task authorization can cover later linked attempts. No historical row, receipt, URL, status, claim, source or Word byte is changed. Source-once, version uniqueness, immutable history, actual-end and consume fences remain.

Run `node tests/article-upload-reimport-migration.mjs`, `node tests/article-upload-reimport.mjs`, the existing upload guard/recovery tests and `tsc --noEmit`. Tests use actual in-memory SQLite migrations, synthetic Word/R2 and no browser/platform/network. Deployment and a real saved-draft verification are separate checks, owned by the authorized publisher/executor.
