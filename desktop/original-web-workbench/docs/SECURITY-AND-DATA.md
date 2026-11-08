# Isolation boundary and data contract

## What the host does

- The WPF window contains the original responsive website inside Microsoft WebView2. WPF supplies no replacement business pages, themes, sidebars or navigation. Error notices are native text/dialogs only.
- It loads no remote website. Its reserved origin is `https://haoduoyu.original-ui.invalid`. A request event handler always responds with verified in-memory bundle bytes or HTTP 403. There is no virtual filesystem mapping, HTTP server, fallback fetch, remote fallback or service worker registration.
- The shipped executable embeds the expected asset manifest. Only an explicit flat allowlist of original UI asset names is accepted. Exact sizes and SHA-256 are checked at startup; unsupported metadata, duplicate JSON keys, missing or extra files/directories, path traversal, symlinks, Windows reparse points and files with multiple hardlinks are rejected. Files are read into memory before navigation. Later on-disk edits cannot change bytes served in the current process.
- Allowlisted `?__shell=...`, favicon version queries and UI route query/hash fragments are supported. Queries are never interpreted as filesystem paths. Only GET can retrieve assets. Document navigation is restricted to the local root/index document; frames, remote navigation, popups, OS schemes, downloads, new permissions, credentials, native host objects, web messaging and browser debugging UI are denied.
- CSP denies connect sources, frames, workers, objects, forms, eval and inline script. Original inline CSS is needed for unchanged responsive UI. Local/data/blob images are allowed. CSP and interception reduce page network access; the test harness probes a local canary, never production.

## Important limits

This is **application-content restriction, not an OS firewall or proof of zero WebView2-process egress**. WebView2/runtime update services, browser telemetry, registry policy, same-user process injection and OS networking require separate evidence. Startup flags reduce selected background activity but are not security guarantees. No firewall, TLS setting, browser security sandbox, OS security policy, system proxy, or user machine configuration is changed.

The manifest pins bytes within this build, not a publisher signature. An attacker able to replace the executable can replace its embedded hashes. Code signing and installer trust are outside this local prototype. Asset checks are not a guarantee against a hostile same-user process rewriting profile parents between checks; the profile/browser are not a sandbox against the account that owns them. No auto-repair, auto-import or cleanup is attempted.

## Durable local data

Production profile identity is fixed to `%LOCALAPPDATA%\Haoduoyu\OriginalWebWorkbench\v1\WebView2`. It does not use the browser profile, roaming AppData, `NativeWorkbench`, old MSI product/upgrade identities or old install directories. There is no migration, import, read, delete or reset of old data.

The common frontend owns IndexedDB transactions, browser storage and UI save semantics. **This is a new local IndexedDB database, not the previous native DPAPI-encrypted database.** It is not represented as equivalent encryption, synchronization, backup or compatibility. Data resides under the user's local Windows account permissions and WebView2-managed format. Keep this directory for reinstalls; do not remove it to fix startup problems.

Graceful closing calls only the frontend's fixed `haoduoyuLocalLifecycle.requestFlush(id)` and polls its status, without exposing a native bridge. Only `complete` permits closing; pending/error/unknown/missing contract/timeouts preserve the window. A single 10-second deadline bounds script calls and delays. A failed close attempts the matching `resume(id)` within a further 2 seconds; the frontend owns edit-lock release. Forced process termination, OS shutdown, power loss and engine failure cannot make uncommitted edits durable. Frontend notes/memos/todo/future pending-input coverage must be tested against the frozen bundle before claiming close-without-loss.

A renderer failure displays an honest local error and preserves all storage. There is no automatic cache/profile wipe, runtime reinstall or process restart. A missing runtime shows Microsoft's official manual-install URL; the app does not open it or install anything.

## Export state and intended safe extension

All downloads currently stop with an explicit Chinese “export not enabled / file not saved” notice. Existing web export controls are retained but **JSON/TXT export is not yet supported by the host**. This avoids silently ignoring the user or risking replacement of an existing file through WebView2's direct download path.

Before enabling export, implement and test a narrow flow: accept only local-origin bounded JSON/TXT blobs; stage under a private dedicated randomized export path; wait for completed download; open and validate the actual file handle, link count, type, length, UTF-8/JSON validity and digest; let the user select a new destination outside application/profile namespaces; write a same-directory CreateNew temporary file and flush; commit via non-overwriting atomic rename; report cancel/interruption/failure accurately and retain the authoritative database. Never hand WebView2 a user destination directly, overwrite a prior export, follow links, auto-open files, or introduce a generic JS-to-filesystem bridge. Unknown-length blob behavior must be tested on real WebView2 before claiming eligibility support. The pure eligibility helper is only a proposed policy, not implemented export functionality.
