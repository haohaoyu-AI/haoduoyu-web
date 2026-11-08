# Local Windows acceptance staging only

This is a reviewable disabled proposal. Nothing here has uploaded source, created an active workflow, pushed a branch, dispatched CI or installed software. Approval must cover the final complete enumerated source scope, independent workflow, disposable-runner SDK setup and synthetic evidence upload before any external action.

## Proposed destination and isolation

- Existing public repository: `haohaoyu-AI/haoduoyu-web`.
- New independent branch: `desktop/original-interface-webview2`.
- New host source path: `desktop/original-web-workbench/`; separately reviewed shared rebuildable source path: `local-ui/`.
- New workflow path: `.github/workflows/windows-original-interface-acceptance.yml`.
- Push triggers only that exact branch and the new host/shared-source/workflow paths. Manual dispatch is optional, not required for a workflow absent from the default branch.
- No merge/default-branch change, website deploy, production call, old desktop source/package overwrite, installer, user-machine installation, secret or new persistent access.

The locally inspected existing `ci.yml` triggers push only on `main`/`opt/**`; old `windows-desktop.yml` filters `desktop/windows/**` and its own workflow; `cloudflare-manual-release.yml` is manual. The proposed branch/path does not match those automatic triggers. Re-read the current remote workflows immediately before an approved push, because this local snapshot alone cannot prove unchanged remote deployment routing.

## Actions and runtime discovery

The proposed job uses temporary `windows-2022`, `contents: read` only, exact checkout SHA with credentials not persisted, official SHA-pinned `actions/setup-dotnet` v5.4.0 for SDK 10.0.403, official SHA-pinned `actions/setup-node` v4.4.0 for Node 24, and official SHA-pinned `actions/upload-artifact` v6.0.0. The fixed action commits are reused from the previously successful desktop CI configuration. Installing the official SDK/Node tools and public lock-pinned esbuild 0.28.2 dependencies into the disposable runner is part of the proposed approval scope; no user computer or machine-security setting is changed.

WebView2 is **not installed or upgraded**. After locked restore/build, `runtime-query` only asks Microsoft's SDK for the existing stable runtime version. It creates no WebView/profile. The same job passes the discovered exact version into every initialized acceptance process and records/checks it. A caller may optionally specify an expected version; a mismatch fails. Runtime missing, nonstable discovery, failed real navigation/DOM/PNG rendering or runtime initialization is reported accurately, without repair, installation, permission bypass or altered security policy. The NuGet WebView2 SDK version is not the installed runtime version.

The UI test shows the exact shipping host class. UserInteractive and SessionId are diagnostic fields, not an unsupported hard gate. Real navigation, intended DOM assertions and a valid normal CapturePreview PNG must succeed; otherwise the run fails. A cross-build is not UI evidence. A pending/failed/missing lifecycle preserves the window; only complete permits close. Each synthetic process is bounded to 120 seconds. Timeout stops only that test process tree and fails the run, retaining local evidence.

## Exact evidence upload boundary

The approved proposal would upload `artifacts/windows-acceptance/evidence/**` as a named CI artifact for **3 days**. This is a dedicated generated directory, not the entire `artifacts/` tree or `%TEMP%`. Its contents are copied using an exact leaf allowlist:

- Runner transcripts `runner-log.txt` and `shared-rebuild-log.txt` containing tool/build/test output, plus `shared-rebuild-result.json` with exact rebuilt asset hashes.
- Read-only runner session facts `runner-session-result.json` and runtime discovery `runtime-query-result.json` or `runtime-query-failure.txt`.
- Run summary `acceptance-evidence.json`.
- For each named phase, only `<phase>-stdout.txt`, `<phase>-stderr.txt`, `<phase>-result.json`, `<phase>-failure.txt`, `<phase>-1280.png` and `<phase>-430.png` when created.

No recursion/copy of WebView2 profiles, IndexedDB files, cache, cookies, sentinel directories, real records, credentials, EXE/DLL/MSI or arbitrary temp files occurs. Test inputs are synthetic and never import user data. Public source and CI evidence may be visible to people with repository/artifact access, so both transmissions need to be included in the user's exact approval. Artifacts are not a release or signed application.

Product screenshots must say “云Windows WebView测试运行（交互session/非交互session，共享原界面，合成本机数据）”, with source-manifest hash, bundle ID, runtime, OS, dimensions and scale. The original content-review orange/gray/sidebar/cards page is captured with an honest empty synthetic local database. Todo/note captures contain clearly synthetic test text. Fixture screenshots are “SYNTHETIC HOST TEST ONLY”, never product design evidence. Browser-only captures are not Windows screenshots.

## Local reproduction after prerequisites are present

`pwsh -NoProfile -File staging/windows-acceptance/run-ci.ps1`

This reads the installed official runtime, then pins that value for the same run. Optional `-ExpectedWebView2Version <exact-version>` rejects an unexpected installed version. The script itself does not install the SDK/runtime; only the separately approved official workflow action installs SDK tooling into the disposable CI runner.

The shared bundle must be the latest explicitly accepted immutable checkpoint. HTML/CSS/script bytes are copied exactly, not redesigned or line-ending normalized. Source scope must distinguish host code, shared built site, and the owner's separately reviewed rebuildable shared source/tests. Do not copy the owner's entire repository, private notes, backups or APK. Current lifecycle candidate status is recorded separately; compilation is never proof of safe close. The new IndexedDB is not DPAPI-compatible storage, migration, sync or backup. Exports remain visibly unsupported. Application request blocking is not OS-wide WebView2 no-egress.


The separate `local-ui/**` trigger is intentional: later shared-source edits must rerun its provenance, local API/runtime/lifecycle tests and rebuild. The proposed `test-shared-rebuild.ps1` runs `npm ci --ignore-scripts --no-audit --no-fund`, original public-source provenance, the pinned esbuild build, then shared tests (which require fresh build outputs). Every one of the 13 rebuilt assets must exactly match the already adopted host manifest's size/SHA; it never silently updates the frozen host bundle. A deliberate new frontend checkpoint therefore requires explicit adoption/review. `local-ui` must be exported from the owner's exact reviewed commit/scope with byte-preserving Git attributes; no uncommitted backup directory is input.

UserInteractive and process SessionId are recorded before runtime testing but do not prevent a real synthetic rendering probe. Screenshots/JSON are labeled “云Windows WebView测试运行（交互session/非交互session）” using the actual diagnostics, with original-interface/synthetic-data scope. They never claim a human desktop or the user's machine. This changes only a test preflight assumption, no host isolation, OS/account/security setting or denied operation.
