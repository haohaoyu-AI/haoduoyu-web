# Local composer drafts and host close handshake

This adapter preserves the existing website files. `scripts/draft-transforms.mjs` contains narrow, checked build-time substitutions; `scripts/build.mjs` records each applied substitution in the build manifest. No original HTML, CSS, controls, or layout was edited.

## Protected content

- Dated todo composer text is journaled verbatim under the standalone scope and exact date.
- Unscheduled/future todo composer text is journaled under a separate identity.
- Original note-entry and legacy draft journals remain in use. Refresh capture reads every current main-page note editor, not only already-queued writes.
- Original durable memo storage remains in use. The original refresh handler reads raw title/body and awaits its durable write.
- Floating notes join the same synchronous capture as the main page. The exact selected note/store is bound before any notifications, paints, disabling, or asynchronous work. Their document also joins the close lock.

Composer changes have separate write identities and monotonic per-composer revisions. Storage completion requires a committed transaction plus readback. Quota and readback errors retain the editing cache, report failure, and block a safe-close acknowledgement. There is no memory-only fallback presented as durable storage.

An original create request object is bound once to its exact payload and initial composer snapshot. Retries and receipt replays retain that snapshot. A successful todo/future create compare-clears only its matching revision inside the same `entities/meta` transaction as the created item and receipt. Newer inputs, including text changed away and back to identical content, survive an old retry or replay. Failed transactions keep both draft and item creation uncommitted. JSON cannot forge a journal snapshot or an executable commit callback.

Close capture also binds a composer capability synchronously from the already-ready local journal when, and only when, its exact raw text matches that revision. It binds the newly journaled revision after collecting an unreported edit. The journal can prove consumption only while its current cache row is the exact `consumed:<writeId>` tombstone produced after that item transaction committed. A newer revision, including text changed away and back, invalidates this proof. A nonempty composer without a ready capture-time journal fails preflight rather than assuming an empty journal means its raw text was consumed.

This precise consumption proof applies to both successful and failed close requests. If an in-flight create consumes the captured revision during the awaited-runtime gap, the later collector does not re-journal its submitted text. If a different note write fails, recovery still preserves every unproven raw editor, but does not restore the composer revision already committed as an item. Late paints, consumption after failure, and another close attempt retain this same capability check. A raw final character different from the older journal snapshot is never cleared by that older revision's consumption. The implementation does not infer consumption from an empty string, a stale painter proposal, or a forged JSON snapshot.


## Windows host contract

`window.haoduoyuLocalLifecycle` exposes synchronous string-returning methods:

- `requestFlush(id)`: use a fresh nonempty string ID (maximum 160 characters). Returns `pending` when asynchronous saving starts; synchronous preflight rejection (such as divergent raw values, ongoing composition, or unsupported unsaved forms) may return `failed` immediately.
- `status(id)`: `pending`, `complete`, `failed`, or `unknown`.
- `resume(id)`: cancels/invalidates the acknowledgement, restores controls, and returns `unknown`.

The host must wait for `complete` for the exact request ID. `unknown`, timeout, and `failed` are never success. Reusing an existing ID does not replay the operation. A second request while a first request holds the lock fails without releasing the first lock.

`requestFlush` first captures immutable raw values, composition flags, DOM identity data, and controller-bound owner/store/entity identities for every participating document, synchronously. This happens before its first await and before controls are disabled, because notifications, focus changes, or a queued controller paint could otherwise replace an unreported final character. Only supported editors enter this snapshot registry. Unknown fields are checked for unsaved content without copying their raw values into the registry or any journal.

Audited capture hooks register immutable edits without editing stores or painting. All registrations are validated together before any captured edit is applied. If the main page and floating page show different raw text for the same note identity, the request returns `failed` before any `store.edit`. The error explicitly asks the user to reconcile the two versions. It does not arbitrarily choose one.

After capture and validation, the adapter locks current and newly rendered controls, obtains the runtime, validates the original identities again, applies only captured raw values to their bound editors/stores, dispatches `haoduoyu:before-refresh`, awaits all synchronous `detail.waitUntil(...)` registrations, and finally verifies durable journals. Controllers do not reread possibly overwritten DOM values on this local path. Each supported editable DOM field must be explicitly acknowledged; an absent/stale controller cannot silently produce `complete`. New uncollected business inputs or replacement editors appearing while a request waits also block acknowledgement.

Narrow audited guards around the actual original todo, future-todo, note, memo, and floating-note value assignments prevent late paints from replacing the captured raw text. On failure or cancellation while pending, controller resumes run first and original raw text is restored last only when its original field/entity identity still matches. Paint protection then remains for that editor until a real user edit or identity change. This covers repeated main-to-floating and floating-to-main repaint, not just a momentary DOM restoration. After successful completion, `resume` retires guards before the note/memo/floating controllers repaint their current bound state. Todo/future composers have no such controller resume painter, so the lifecycle then reads their exact original kind/date from the captured runtime composer journal and synchronously reconciles the still-matching field. It rechecks owner/date/DOM identity and does not use a painter's potentially stale proposed value. A successfully consumed composer is therefore empty immediately after real `resume`, and a second close does not resurrect it; no extra host or test repaint is required.

On `complete`, editors stay locked until the host actually closes or explicitly calls `resume(id)`. If native close is cancelled or fails, the host must call `resume(id)`. On write failure or the adapter's 8-second timeout, controller resume callbacks and controls are restored automatically. A late write cannot turn a failed request into `complete`, run an obsolete collector after cancellation, or release a newer request's lock.

## Recovery boundary after identity or DOM replacement

Divergent main/floating values remain separately visible and protected against the audited original painters while their original editor identities remain present. They are not automatically persisted as two conflicting durable drafts. A new close attempt fails again until their raw values agree. A forced reload, process kill, or bypass of a failed handshake can still lose either uncommitted version.

If an owner changes, a selected memo/note changes, a todo form date changes, or the original editor is detached during the runtime wait, validation returns `failed` and never pastes the old raw value into the new entity. If the original DOM has already disappeared, its captured raw text remains only in that request's in-memory snapshot. There is no user-visible recovery route or durable-retention guarantee for that copy, and returning to the old entity is not claimed to restore it. The error distinguishes this boundary rather than saying the vanished editor's text was safely retained. These paths block close; they are not successful saving or recovery.

## Unsupported transient fields

This is not an all-form draft implementation. Nonempty editable transient fields outside the four composer families block close and identify their field IDs rather than claiming they are protected. Examples include:

- `todo-template-text`, `todo-template-edit-text` (template create/edit)
- `todo-note-input` (todo note modal)
- `memo-dialog-title` (memo group/action dialog)
- `notes-new-label` (label creation)
- Article, review, OpenAI-settings, login and administration forms, including password fields, which are never copied into the journal
- Nonempty or changed unknown date/time/number/search fields, including unsent future scheduling choices

Audited view-navigation fields (`notes-date`, `notes-history-month`, `notes-month-input`, `reminder-date`, `todo-date`, and `todo-calendar-month-input`) are exempt only under their exact original root and type. Programmatic paint of a current date/month is not an unsaved draft. Unknown business date/number fields remain fail-closed.

Their text is not restored after a forced reload or application kill. The safe-close path refuses to approve their loss. A user or host that bypasses a failed handshake can still lose those transient inputs.

## Android and compatibility

`haoduoyu:local-background` and hidden-document notifications collect and flush, then resume automatically. They do not hold an indefinite close lock. Android can kill a process before asynchronous lifecycle JavaScript or IndexedDB finishes; pause handling is best effort, not an immediate-kill guarantee. Normal todo/future input events also journal continuously.

Bootstrap checks IndexedDB, structuredClone, crypto.randomUUID/subtle, String.isWellFormed, and Object.hasOwn. An incompatible browser component gets an explicit System WebView/WebView2 update message without deleting existing data or weakening validation with polyfills.

## Verification and limits

`tests/draft-lifecycle.test.mjs` and `tests/close-snapshot.test.mjs` use synthetic memory databases, EventTarget/fake DOM, and actual extracted original note/memo capture/refresh handlers, original inputTodo/notifyTodoChanges, and the original main/floating painters after the audited nonvisual transforms. It checks date/scope reload, atomic cleanup, rollback, failed retries, old receipt replays, same-text newer revisions, concurrent input, quota/readback errors, collector acknowledgement, floating locks, failure restoration, timeout/late completion, and Android resume. The close-snapshot suite additionally covers the reproduced synchronous floating overwrite (A), a synthetic queued main paint during the awaited-runtime gap without a popup (B), zero-edit conflict rejection, repeated repaint after failure, user reconciliation, cancelled-request retries, owner/entity/date changes, detached replacement DOM, newly uncollected fields, composition state, and unknown private fields staying outside the raw snapshot registry. Successful host cancellation is checked by calling real `resume` without a test-driven repaint: todo/future consumes remain empty through a second close, original note/floating/memo resume callbacks repaint current store values, and changed owner/date/DOM identities never receive an old captured value. Additional todo/future cases cover exact consumption plus a different note flush failure and retry, consumption during runtime readiness, an unreported tail that must survive older consumption, newer same-text revisions, and consumption after a failed request with no intervening painter.

These tests are not browser/device end-to-end acceptance. Actual browser validation is blocked in this environment and was not claimed. Real IndexedDB durability, IME behavior, WebView suspension, native Windows close integration, and simultaneous independent application instances still require platform testing. No true user data, source phone data, credentials, server operations, or external writes were used.
