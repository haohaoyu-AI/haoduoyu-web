# Account readiness and private upload diagnostics

`createZhihuAccountReader` keeps its existing browser and binding inputs. It adds
`waitForReadiness(milliseconds)`, `readinessTimeoutMs` (default 5,000),
`readinessIntervalMs` (default 100), and `readinessMaxChecks` (default 20).
The account menu and profile link are checked after the one navigation and one
menu click. Ambiguous controls, changed page identity, unsafe actions, login,
challenge, and permission UI stop the check immediately.

The default delay uses the standard JavaScript `setTimeout` only when that
execution context provides it; an explicitly validated, awaitable delay adapter
is also supported. In a timerless CUA VM, the observed locator's documented
`waitFor({state:'visible', timeoutMs:remaining})` is awaited at most once per
control, with an explicit positive integer remaining deadline. Its return is
followed by fresh page, blocker, count, visibility, enabled and identity reads.
A visible disabled control stops when no enabled-condition wait is supported.
Unknown wait errors stop immediately and remain private; no timeout type or
cancellation is inferred. If neither a delay nor the condition method exists,
a not-ready control fails with `Account readiness wait unavailable in this
execution context`. Immediately ready controls need no delay. A maximum check
count also bounds polling when a test clock does not advance. The deadline is
shared across the menu and profile checks, with a final control, page and time
guard before the menu click. These bounds do not cancel or interrupt an already
awaited browser method or delay; underlying tool timeouts retain uncertainty.

`reader.diagnostic(error)` and `runtime.diagnostic(session)` return fresh copies
of a fixed safe schema: version, source, stage, substep, kind, error name, fixed
summary, count, visible, enabled, check count, last successful observation time,
and failure time. Unattempted or failed reads use `not_checked`, not `false` or
zero. Times come from the configured clock at actual completed reads. Only
exact whitelisted summaries are public; unknown messages, stacks, URLs,
selectors, arguments, credentials, and exception properties are omitted.

Static `ui.account` denotes the editor/list page's profile link, and uses
`account_binding`, `account_binding_count`, `account_binding_visible`, and
`account_binding_href`. `account_editor_url` identifies both scoped URL reads
before and after the independent `account_live_read`. The separate verification
page's avatar remains under `account_menu_*`; these names distinguish a stale
editor/list handle from a failure inside the account reader.

Original thrown values remain in a module-private WeakMap across the helper,
account catch, and outer runtime catch. They are available to an internal
debugger without being attached as an Error cause or a session property. The
normal API exposes only the safe schema. Events, checkpoints, bridge requests,
and normal tool receipts keep their existing fields and receive no raw errors.
Repeating an already blocked operation does not replace its original diagnostic.

Offline checks require only Node.js and use synthetic browser methods:

```text
node tests/cua-zhihu-account-readiness.mjs
node tests/cua-draft-runner-diagnostics.mjs
```

An optional `CUA_DRAFT_RUNNER_SOURCE` absolute local module path allows the same
tests to verify a proposed module before its patch is applied. The tests also
evaluate the emitted standalone definitions in a VM without timers. No real
browser, computer, account, bridge, claim, permission, or upload is invoked.
