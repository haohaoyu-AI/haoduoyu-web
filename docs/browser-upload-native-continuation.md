# Native picker continuation, protocol 2

This source describes `2026-10-10-private-draft-executor-8`, contract 7, retaining the
`native-fast-3` pending/settlement mechanism. Verify the actual deployed
handoff and source bytes before loading it; this protocol alone does not
authorize a platform action. Keep the existing article, Word, destination,
executor and single-use consume guards.

Production version and publication status come from the actual handoff and
delivery receipt, not this document.

The default entrypoint is the complete independent `createPrivateDraftExecutor`
program. It supports a normal first private import; legacy reimports,
checkpoint-based execution recovery and repair methods fail closed without host
actions. Source pagination is read-only transport, not permission to execute
pieces. The complete new program and matching new-version bridge require normal
acceptance in fresh healthy respective tool sessions; old loaded definitions do
not match. V152/runtime 7's runner/bridge pair was normally approved in the
original official CUA with matching SHA and entrypoints, and the real Toutiao
account query check passed; runtime 8 still needs
its own fresh acceptance and preflight test by the parent thread. No private
draft save or full content verification passed in this round. A source budget check is not approval or platform
success. See [the load boundary](browser-upload-runner.md#加载和接入父执行者).

The website's default native route is Zhihu's **坐标法**. Toutiao defaults to **Codex 法**
with the official browser filechooser; the presence of a native adapter never
automatically switches Toutiao to native. An explicitly named `upload_method`
with the wrong platform or mode is refused before creating a session. Existing
independent tests specifying only `picker_mode` retain both modes under their
existing authorization and single-use guards. A nondefault route cannot claim
either fixed method name and cannot automatically switch after a timeout.
Explicit mode-only tests retain their original arguments and DOM menu steps;
they are not silently converted to the website's coordinate workflow. Prior
standalone attachment-test exemptions remain limited to those authorized tests
and do not exempt the website workflow from its guards.
See [the fixed methods](private-draft-methods.md).

## Actual tool boundary

The native host must await every issued screen, window, mouse or keyboard action
in its current supported tool call. If interpreting a screenshot requires the
next model turn, return an explicit pending value after those actions settle.
Do not start a browser Promise and assume it continues across CUA calls. An
unconsumed resolver queue has no consumer and is not an execution model.

Every actual native adapter must implement `prepare/inspect/submit`. The
website's named/default Zhihu coordinate adapter must also declare
`coordinate_contract: 'screenshot-single-click-open-v1'`. Existing independent
explicit-native tests keep their established host contract. The coordinate
declaration is this project's host behavior contract, not an official native
tool API or evidence of a real screenshot/window. Do not add a declaration to
simulate missing host capability. Missing required methods or contract stop
the default Zhihu route without browser fallback.

Every handler receives the existing scope and arguments plus `runtimeVersion`,
`request_id`, `request_version` and `method`. `prepare` still receives no file
path. For a named/default Zhihu coordinate document,
`coordinate_actions.document_stages` contains the
observed menu/dialog/file bindings. The actual host uses current screenshots to
locate and single-click these steps, waiting for stability between actions;
the runner does not first click those menus through DOM locators. `prepare`
must leave the unique Open File window empty. `inspect` reads that same window.
After the accepted consume and saving acknowledgements, `submit` single-clicks
the exact approved Word file row, confirms that file is selected, then
single-clicks native Open once. Do not use double-click as the default or use
TinyFish. Reobserve coordinates after window position, size or layout changes.

For a pending result, the handler returns these fields:

```text
status: native_pending
runtimeVersion, request_id, request_version, method
article_id, platform, target_account, browser_session, executor_id,
tab_id, editor_url, purpose
window_handle
actions_settled: true
observed_at: the actual completed observation time
checked_at: the same observed_at
```

The runner returns `status: native_pending`, a volatile `request` with that
correlation and scope, and its ordinary checkpoint. The request contains no
file path or grant. Private continuations and handles are not in the checkpoint;
they cannot be restored in another runtime or tool session.

## Resume the retained operation

Use `runtime.resumeNative(session, evidence)` with:

```text
runtimeVersion, request_id, request_version, method
actions_settled: true
observed_at
receipt: { the same eight scope fields, window_handle, checked_at, ... }
```

`checked_at` must equal `observed_at`. The timestamp must come from the pending
observation or a new actual read of the same window. It must not precede the
operation or previous observation, exceed current time, or be older than 60
seconds. Never refresh a screenshot timestamp to the callback or resume time.

The final receipt depends on the method:

| Method | Required actual observation | Continuation |
| --- | --- | --- |
| prepare | ready=true, window_count=1, files_selected=false, submitted=false | Recheck the account, blank editor, control, history and Word; then reserve. Do not reopen. |
| inspect | ready=true, window_count=1, files_selected=false, submitted=false | Continue after the accepted saving acknowledgement. The document grant stays consumed. |
| submit | submitted=true, window_closed=true, window_count=0 | Finalize that same action and observe the resulting draft. Do not submit again. |

Preparation and inspection require the exact editor URL. A completed document
submission may legitimately navigate to a new valid draft editor URL. The
handler's return time and the later model resume time remain distinct.

Wrong version, ID, sequence, method, scope, handle, timestamp, duplicate receipt,
cancelled session or checkpoint-restored session is refused. Ordinary workflow
methods are also refused while a private native operation is pending or unknown.
Invalid evidence does not destroy the legitimate pending state or release its
window ownership.

## Settle a real closed window

`runtime.settleNative(session, evidence)` accepts the same outer correlation,
actual timestamp and scope. Its receipt requires `actions_settled: true` on the
outer evidence, `window_closed: true`, `window_count: 0`, an actual boolean
`submitted`, and the exact retained handle. It does not run the continuation.

If a prepare action failed before any handle was established, the receipt must
instead contain `window_handle: null` and `all_open_file_windows: 0`, supported
by the actual complete window read. Do not guess a handle. An in-flight action
cannot be settled this way before its actual return.

Ready windows remain owned after cancellation, a refused reserve, a false
consume response or a failed precheck. Only actual closed/settled evidence or a
settled successful submission releases that ownership. Closure returns
`reconcile_only` with `native_outcome: closed`; it keeps the read-only fence and
does not establish an upload result or restore permission.

## Verification limits

The offline tests use mock methods and verify correlation, ownership, timestamps
and single-use boundaries. They do not prove that a cloud screenshot identifies
an empty window, that Sky can select the Word, or that Zhihu imported it. Before
any future platform execution, the actual host must implement these receipts
using its current supported API and real observations. The contract declaration
or an offline test cannot substitute for that capability or evidence.

```text
node tests/cua-draft-runner-native-continuation.mjs
node tests/cua-runtime-standalone-local.mjs
```
