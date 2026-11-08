# Windows original-website host (local prototype)

This isolated project replaces the rejected WPF business-page redesign with a minimal WPF **window hosting the shared, bundled original website**. It does not modify the previous desktop repository, mobile source tree, production, old data, user computer, installer, or remote CI.

## Current checkpoint

- Linux synthetic host-policy suite: 52 passing checks (see `policy-test-output.txt`), plus 16 static boundary assertions (`source-boundary-output.txt`). Neither is Windows UI execution.
- Windows x64 cross-build: Host and shown-window test harness both succeeded with 0 warnings and 0 errors; PE32+ x64 executables verified. See `build-output.txt`.
- Real shown WebView2 execution/screenshots: **not run in this Linux environment**. The executable acceptance harness and instructions are provided, not represented as passed.
- Revised phase 2b is adopted byte-for-byte for local integration from immutable source commit 51505afbc00ee4c223bdb48a794e4000a29d3571. Source manifest SHA-256 is 0303e9eab153b65adb5b419ea4fb52c47e591007c2bdd37e855c7ab60da34aff. Its 13 files rebuild exactly from the separately reviewed 173-file shared source. This remains an acceptance candidate, not a Windows-runtime or safe-close pass. A host built without the pinned embedded manifest fails closed with an honest local message. The synthetic fixture is test-only and is never bundled as the user's UI.

The historical phase 1 source checkpoint remains in `CHECKPOINT.json`. Current local acceptance preparation is recorded separately under `artifacts/`; the previous phase 2 was withdrawn and archived locally without modifying its source checkpoint. Revised phase 2b has passed source/rebuild/policy/static/cross-build checks, but still requires actual Windows execution and screenshot review before delivery as a usable app.

## Dependencies

.NET 10 SDK (pinned 10.0.403 for this workspace), Windows desktop targeting pack, and official `Microsoft.Web.WebView2` NuGet SDK 1.0.4314.35. Runtime deployment requires Windows x64, the .NET 10 Desktop Runtime for this framework-dependent build, and a current stable Microsoft Edge WebView2 Runtime installed by the environment owner. No runtime is auto-downloaded or installed. The NuGet SDK is not the WebView2 runtime. No MSI/installer/updater/startup entry is supplied, and no old product identity is reused.

## Local build/test

On this Linux workspace, `scripts/dotnet-local.sh` directs SDK caches/home exclusively into this project and reuses the existing SDK without changing it. Set `DOTNET_BIN` elsewhere if needed. `global.json` requires the exact SDK, without roll-forward.

```
scripts/dotnet-local.sh run --project tests/PolicyTests -c Release
scripts/dotnet-local.sh build tests/WindowsIntegration -c Release
```

On Windows with prerequisites installed, use `dotnet` directly. See `docs/WINDOWS-ACCEPTANCE.md` for real shown-window tests. No command here triggers remote CI.

After independent review of the immutable shared checkpoint:

```
python3 scripts/adopt-shared-bundle.py <checkpoint/site> <checkpoint/manifest.json> <reviewed-manifest-sha256>
dotnet build src/Host -c Release
```

The adoption command verifies every common asset digest and exact allowlist, copies bytes without editing them, and generates a manifest embedded by the host build. It refuses to overwrite an existing checkpoint. `bundle/site` is the very same common frontend intended for Windows/Android, not a duplicated CRUD or UI implementation. Only the frontend owner changes the data adapter.

See `docs/SECURITY-AND-DATA.md` for exact restrictions, separate profile, encryption limitations, close-handshake contract, explicitly unsupported file exports, and page-network versus browser-process networking distinction.


Local acceptance staging is in `staging/windows-acceptance`, not `.github/workflows`. It does not create or dispatch CI. The expanded host failure/timeout harness cross-compiles but still requires real Windows execution. `scripts/package-source.py` creates a deterministic local source-only archive and exact SHA-256 file-scope manifest for subsequent upload approval. It never uploads, installs, publishes or includes build/profile/cache output. See the acceptance document for phase 2's reachable-page limits and the immediate-last-keystroke close/reopen gate.
