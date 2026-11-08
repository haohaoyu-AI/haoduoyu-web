# Shared original-interface phase 2b acceptance

This is a test plan, not evidence that a real browser or Android/Windows host has passed.
Use an isolated profile with synthetic records only. Never open a production profile or
import the user's existing data to run these checks.

## Exact shared interface and host entry

Android enters `https://appassets.androidplatform.net/?page=todos`.
Windows uses its own fixed local origin with the same frozen site files. The origin is
intercepted by the host, not a remote web service. Keep all HTML/CSS and the compiled script
identical to the supplied manifest; `local-ui/** -text` disables Git newline conversion.

Routes and selectors below are from the actual preserved frontend, not a mockup or test UI.

- Current todo: `/?page=todos`, input `#todo-text`, form `#todo-form`, submit
  `#todo-form button[type=submit]`, rows `#todo-items [data-todo-id]` and `.daily-todo-text`.
  Use the actual selected date from `#todo-form[data-date]`.
- Future todo: `/?page=todos&todo_panel=future`, input `#todo-future-text`, form
  `#todo-future-form`, rows `#todo-future-items [data-future-todo-id]`.
- Notes: `/?page=notes`, today's original `button[data-notes-action=new]`, then
  `#notes-active-entry [data-note-entry-editor]`. The selected record's ID is the
  `data-note-entry-editor` value. Submit is `[data-note-entry-action=save]` within the same
  `[data-note-entry]` article. `#notes-editor` is the preserved **read-only legacy** viewer,
  not the new editable note composer.
- Content review: `/?page=review&account=V%E5%AD%97`. `V字` is an original page filter label,
  not evidence of a real local account. A clean profile must show the actual original empty
  state, with no injected user, article, snapshot, report, or benchmark fixtures.
- The current original navigation does not expose memos. Its service and controller contract
  tests do not make a reachable memo feature. Do not add a menu or mutate page state to claim
  that the unmodified UI supports it.

Wait for the intended input to be visible, enabled and not read-only, and for bootstrap error
messages to be absent. These are readiness checks, not proof of a successful durable write.
Notes expose `.note-entry-status[data-phase]`; a saved entry should reach `saved` after submit,
but that alone is not the persistence acceptance. Close and reopen the same isolated profile
and verify the exact text, record identity and expected row count.

## Close/flush contract

The fixed API is `window.haoduoyuLocalLifecycle` with three functions:

- `requestFlush(id)`: returns `pending`, `complete`, `failed` or `unknown`.
- `status(id)`: returns the current one of those four strings.
- `resume(id)`: cancels/releases that lock and makes the status `unknown`.

Use a fresh bounded ID for each close attempt. Cancel native closing first. Only a subsequent
`complete` permits closing. Missing function, failed, unknown, script error or timeout keeps
the native window open and must not clear or recreate its profile/database.

The page first synchronously captures supported raw DOM values and identities across current
documents, before disabling controls, awaiting runtime readiness or editing any store. It then
freezes controls, flushes the original note journals and local todo/future journal, and checks
durable readback. A successful flush remains locked until the host closes or calls `resume`.
Failure/timeout restores controls. When abandoning native close after success, call `resume`.

The old phase 2 candidate did not safely order capture against asynchronous paints and is
withdrawn. Phase 2b includes explicit original-painter regressions for both main and floating
editors. Same-record conflicting raw values fail before either store is edited. Late paints
are guarded while the original DOM remains available. A detached/replaced original editor or
changed identity also refuses close, but the request's memory snapshot is not an accessible
durable recovery copy; never describe that edge case as guaranteed recovery.

Essential actual-host test: enter the final few characters, immediately request native close
before any debounce delay, then reopen and verify those final characters. Run separately for
todo, future todo and a new note. Do not substitute pending=0, a synthetic Promise, a source
assertion or a screenshot for this test. Also test cancel/resume, repeated close requests,
input during a pending save, process recreation, quota/transaction failure and Chinese IME.
Android pause attempts a flush and resumes; it does not guarantee JavaScript time after an OS
kill. Draft writes are queued while editing, not deferred solely to the pause callback.

## Honest unsupported paths

Unsupported transient business forms block a successful close acknowledgment if nonempty;
they are not represented as protected drafts. Known date navigation controls are not business
drafts. A nonempty todo-template edit or unsubmitted future scheduling date must keep the
window open with an explanation until the user completes or cancels it.

Retained-note JSON/TXT download actions explicitly say this version cannot export files and
leave their drafts intact. Neither host currently provides a real file export/selection
receipt. There is no complete backup/restore UI, no cloud sync, no AI execution and no automatic
migration. A local empty review page is not proof of a complete review editing workflow.

## Evidence boundaries

Node tests use deterministic in-memory transactional storage and selected actual controllers
with a synthetic DOM. The Android-free URL policy runs on a real JDK. Neither proves real
IndexedDB/WebView persistence. The cloud preview did not start a usable browser session and
the supported browser's URL policy was respected. There are no real page screenshots yet.
Capture real host screenshots only after running the exact frozen assets, label the host and
synthetic-data status, and do not label browser-only captures as Android or Windows app runs.
