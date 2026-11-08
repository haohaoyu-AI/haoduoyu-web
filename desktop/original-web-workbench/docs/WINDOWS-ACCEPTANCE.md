# Required Windows acceptance (not yet executed)

Run on a disposable hosted Windows test environment, never the user's machine or a production account. Use the official .NET 10 SDK and an existing stable Microsoft Edge WebView2 Evergreen Runtime. The proposed independently approved CI workflow may provision the pinned SDK through its official fixed action. No script installs or upgrades WebView2. Session diagnostics do not alone prove or disprove actual WebView content rendering. Do not call a cloud capture a human desktop screenshot. No active workflow or CI job has been created/dispatched; a disabled local review proposal is described below.

```
pwsh -File scripts/test-windows.ps1 -ReviewedSite bundle/site
```

The harness builds and **shows the exact host class**, using an isolated synthetic directory under `%TEMP%\HaoduoyuOriginalUiTest-<GUID>`. It loads synthetic fixtures first, commits IndexedDB in one process, then starts a separate process against the same profile to verify persistence. A separate site phase shows the reviewed original bundle with a new empty local profile. It captures real WebView2 screenshots at 1280 and 430 window widths, plus explicit source/runtime/result metadata. Fixture screenshots say SYNTHETIC HOST TEST ONLY and must never be presented as the website or new product design. Site screenshots must be labeled “云Windows WebView测试运行（交互session/非交互session，共享原界面，合成本机数据）” according to actual session diagnostics, with bundle ID and runtime version. A browser preview is not a Windows host screenshot.

Current implemented harness checks:
- Real shown window, local secure-origin boot, test fixture IndexedDB commit and independent-process restart.
- Original bundle nonempty DOM smoke test only. This does not validate business CRUD or unsaved editors.
- A loopback canary gets no page fetch/image/script/frame/WebSocket/worker/beacon connections; remote/file/OS-scheme navigation blocked. No real endpoint is contacted.
- Host objects, web messages and devtools setting disabled; graceful close contract accepted; synthetic legacy sentinel unchanged.
- Actual WebView screenshots and JSON results retained, no automated deletion of profile/test evidence.

Required before release, not covered by current executed tests:
1. On the frozen shared app, create/edit/check/reorder/delete a todo, unscheduled todo, note/tag and memo; restart and verify. Test offline reload. Verify deletion confirmations and honest unsupported routes. Capture 1280, 1440, 100%/150% scaling, narrow layout and keyboard access.
2. Type pending content and immediately close for each editor (notes, memo, current/future todo), including Chinese IME, repeated close, concurrent edits and simulated storage/quota failures. Verify saved/recovered drafts on restart. Timeout/missing lifecycle/failed transaction must retain the window and release editing locks; a hung renderer cannot hold the host close handler forever.
3. Modify/misspell/remove one bundled asset, replace by symlink/junction/hardlink, alter its length/hash, add an unlisted file/directory, supply malformed manifest. Startup must fail before page execution, with no remote fallback and no profile or old-data changes. Linux tests cover these policy cases; Windows native filesystem behavior remains to verify.
4. Exercise iframe/new-window/navigation redirects, remote HTTPS/WSS and DNS destinations, user info/ports/escaped paths, `javascript:`, `data:`, `blob:`, `file:`, `ms-settings:`, `mailto:`, service worker and custom-protocol attempts. Confirm no external application or popup opens. The URI policy unit tests are not proof of all engine behavior.
5. Trigger camera/mic/location/notifications/clipboard/other browser permissions, basic auth/client cert/server certificate errors, external file drop and downloads. None may silently grant, bypass or save. Downloads must show the visible blocked-export notice and create no file. Preserve original JS confirm dialogs.
6. Stop renderer/browser process and attempt recovery. Preserve the entire profile and sentinel files under synthetic old browser/NativeWorkbench roots; never clear caches as a repair. Test missing/outdated runtime and environment overrides. Record the precise error instead of starting an installer.
7. Verify new profile stable across app restarts/replacement binaries and independent from old data. Do not describe IndexedDB as DPAPI encryption. Test file locks/concurrent launches without wiping data.
8. Runtime-level no-egress is a separate controlled network-capture/firewall test with explicit environment authorization. Application request/canary tests do not prove it. Registry overrides and machine policy are environmental trust inputs.

No user/production data, remote frontend, production database, sign-in, migration, installer identity, upload, public code or CI write is needed for this acceptance.

## Phase 2 acceptance staging (local only)

`staging/windows-acceptance` contains a disabled proposed workflow and a local PowerShell entry point. Nothing has been uploaded or dispatched. The entry point requires exact SDK 10.0.403 (provided by the proposed official fixed setup action in CI), a Windows x64 test environment, an existing WebView2 Evergreen runtime, and an already adopted bundle. The locked NuGet SDK remains 1.0.4314.35. The staged CI entry point queries the existing stable WebView2 read-only in the same job, fixes that exact version for every test process and records/checks it. No unknown runtime constant blocks initial discovery and no runtime is installed. `global.json` disables SDK roll-forward. `.gitattributes` protects all adopted frontend bytes from Windows autocrlf changes.

The expanded compiled harness includes shown-window failed/pending/missing lifecycle cases. It verifies that the exact host retains its window, invokes same-token resume when available, and only closes after a new successful handshake. Its native dialog helper dismisses only the exact Chinese close-failure dialog in the synthetic test process. It does not accept arbitrary prompts or other applications' dialogs. Each independent test process has a 120-second upper bound; timeout terminates only that synthetic process tree, retains evidence/profile, and fails acceptance. The runtime-override phase verifies honest initialization refusal and preserved synthetic old-data sentinel, without installing/removing any runtime or altering machine settings. These new tests are compiled, **not yet executed on Windows**.

The reviewed-site phase now validates against the actual shipping host's embedded asset manifest, rather than generating new trusted hashes from its input. Screenshot JSON records the shared bundle ID, OS, runtime and scale. All screenshots still require human inspection and labeling.

Real editor coverage must use phase 2's public reachable notes and todos pages, including future todos. The original memo route is not reachable/editable, so local memo API unit tests must not be presented as usable memo UI. In notes, `[data-note-entry-editor]` is the new-entry editor; `#notes-editor` is an old read-only record and cannot stand in for a new user draft. The frozen owner acceptance contract supplies exact route/selectors; the compiled harness uses those real public editor controls. Type final characters into the actual editor, invoke close immediately without waiting for debounce, restart the process with the same synthetic profile, and verify the recovered content. A synthetic pending Promise or an empty queue is only host-policy testing, not evidence that real editor drafts were flushed. Unsupported nonempty transient forms must reject close and preserve editing.

On the Linux preparation machine:

```
scripts/dotnet-local.sh run --project tests/PolicyTests -c Release
python3 scripts/check-source-boundaries.py
scripts/dotnet-local.sh build tests/WindowsIntegration/WindowsIntegration.csproj -c Release -m:1 -p:RestoreLockedMode=true -p:UseSharedCompilation=false
# Only after owner sends the exact frozen phase 2 checkpoint and hash:
python3 scripts/adopt-shared-bundle.py <phase2/site> <phase2/manifest.json> <reviewed-manifest-sha256>
python3 scripts/verify-shared-bundle.py <reviewed-manifest-sha256>
# Re-run all applicable checks/build after adoption, then package the exact final scope:
python3 scripts/package-source.py
```

`artifacts/windows-original-ui-acceptance-SOURCE-SCOPE.json` enumerates each proposed source upload path, size and SHA-256. The deterministic local ZIP contains code, tests, scripts, docs, locks and any explicitly adopted immutable bundle, no runtime output, profiles, databases, caches, credentials or signed/unsigned EXE. Packaging is not approval to upload it. Obtain approval for that exact final file scope and destination first. Do not use the previous 0.20 source tree or its frozen 0.21 workflow/package.


## Revised compiled shared-page acceptance

The harness now includes separate `site-review`, `site-todo-seed/restart`, `site-future-seed/restart`, and `site-note-seed/restart` processes. It drives the actual editable original control with Chromium `Input.insertText`, captures the shown UI before the final characters, inserts the final Chinese characters, and requests native close with no intervening screenshot, delay, queue polling or security probe. Recorded native-close initiation must be within 100 ms of final input. The next process opens the exact same isolated profile and verifies text, note identity and record counts. It then uses the original submit controls, edits a saved note, performs an offline page reload, and checks actual displayed records. These cases are compiled, not Windows-executed. They are not a real keyboard/IME or cross-window floating-editor test.

Content review captures use the actual `/?page=review&account=V%E5%AD%97` empty state, not seeded private accounts or article data. This is original orange/gray interface evidence only when an actual Windows run produces captures and a human inspects them. Memo UI remains unreachable. Existing unsent transient business fields, quota failures, real IME, concurrency, process crash and floating-window raw-input collection still require the corresponding platform checks.

The initially frozen phase 2 common lifecycle was withdrawn for a raw-input collection ordering issue and archived locally. Revised immutable phase 2b source 51505afbc00ee4c223bdb48a794e4000a29d3571, manifest 0303e9eab153b65adb5b419ea4fb52c47e591007c2bdd37e855c7ab60da34aff, is now adopted and rebuilt byte-exact from its reviewed 173-file export. Local source tests pass; this is still not Windows execution or a safe-close runtime pass. The final upload approval must include full reviewed shared rebuildable source/tests supplied by the owner, not only the compiled JS. No entire source repository, APK, private backup or user data is implicitly included.

The compiled actual-shared-page cases additionally verify complete holds the editor lock until same-token resume, and inject a synthetic IndexedDB put failure into an isolated shown page to verify window retention, exact draft preservation and input restoration. Only the platform function is temporarily replaced in this test; original lifecycle methods are delegated unchanged and restored. These cases are not yet run. The required source rebuild order is npm ci → verify:provenance → build → test:shared → exact asset comparison, so no test depends on leftover build files.

Session diagnostic revision: UserInteractive/SessionId are recorded, not hard blockers. The exact host still must complete real navigation and intended DOM assertions and produce a normal valid CapturePreview PNG; API/DOM/PNG failure fails acceptance. No host data/network/path/close rule or OS security setting was relaxed. Session type is included in each result and its evidence label, without claiming a human desktop or user computer.
