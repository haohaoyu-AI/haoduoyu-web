# Window controls and safe data handoff, 2026-11-09

## Scope and current status

The user approved the existing website-style interface and requested a conventional desktop window, like the 得到大脑 reference: minimize, maximize/restore, resize and close. This patch changes the native Windows container, not the business-page design or data storage.

The previous constructor used a fixed 1280 × 850 device-independent-pixel window. That can exceed a smaller/high-scaling desktop work area and put the caption outside the usable screen. This is a source-based diagnosis, not a confirmed reproduction on the user's computer.

The new constructor explicitly requests standard Windows chrome, a normal resizable taskbar window, and startup bounds centered within the primary desktop work area. The outer window is at most 1280 × 850 DIPs and leaves a visible inset. Minimum dimensions are reduced when necessary so even a very small work area remains reachable. Existing native close events still pass through the unchanged durable-draft flush/resume handshake.

## Checks completed in the Linux cloud workspace

- All 59 materialized baseline source/bundle files verified against Git blob identities at `3c0af618f2c897ba078c7ab1b06df213e6ad0ca1` before modification.
- Pure policy suite: 68 checks passed, including six work-area sizes/origins and four invalid-input cases.
- Static host/data/security checks: 18 assertions passed.
- Frozen shared UI: all 13 assets remain byte-for-byte unchanged. Source-manifest SHA-256: `aaebe137f2add03bdbdab47468a013d32da92217c805baf2a355e7d4809480d8`.
- Windows x64 host and integration harness cross-build using official SHA-512-verified .NET SDK 10.0.403: succeeded with 0 warnings and 0 errors, locked package restore.

These are not Windows UI execution results. The added Windows test must still run and its images must be inspected. The previous 15-stage Windows pass does not establish that this new patch works.

## New Windows acceptance gates

For the synthetic fixture and the actual frozen site, verify native caption/system-menu/resize/minimize/maximize style bits, startup frame within the work area, native minimize/restore/maximize and resizing. Existing close-safety tests remain required. The tests capture the full application HWND with PrintWindow in addition to existing WebView-only images; they never capture another desktop window. A PNG file or successful PrintWindow call alone is not proof that the image is visually useful. Inspect both the normal and maximized frame images and disclose blank/partial captures.

The evidence allowlist adds only `*-window-controls.json`, `*-window-frame.png` and `*-window-maximized-frame.png` to the existing synthetic artifacts. It does not include browser profiles or real user records. Existing CI has a 3-day evidence retention period.

Before calling this usable, validate an actual Windows session with small work areas and 125%, 150% and 200% scaling, drag/resize, maximize/restore, minimize/taskbar restore, native close and Alt+F4. Test immediate last-character input and failed-close recovery again. Cross-compilation does not cover these gates.

## Why the test installation has no previous data

This offline candidate deliberately uses a separate IndexedDB database/profile. It does not sign into, fetch, import or synchronize the website, the user's browser profile or the old native SQLite/DPAPI database. An empty initial account/article/review list is therefore expected for a new local profile. It does not show that existing website data was deleted. No such data has been read or changed by this patch.

Preserve `%LOCALAPPDATA%\Haoduoyu\OriginalWebWorkbench\v1\WebView2` across upgrades. Do not reset the profile, replace it with a downloaded profile, reuse an older product identity, or uninstall with data removal to troubleshoot a window problem. A release must visibly distinguish “new local database, not imported” from “failed to read local data”; an I/O error must never be presented as an empty successful collection.

## Safe import implementation plan

1. Resolve the authoritative source and supported export format first. Website CSV export is not automatically a full-fidelity backup of notes, drafts, relations and all account metadata. Old native data may need a separate exporter. Do not silently scrape a signed-in browser or read/decrypt an old database.
2. User selects an export/backup locally. Keep the source read-only and record its SHA-256, source version, date and coverage. Import must remain local; it must not upload user data or credentials. Never import authentication tokens, passwords, private API keys or browser sessions.
3. Validate the complete bounded UTF-8/JSON schema, field types, lengths, dates, IDs, references and record counts before writing. Reject unknown executable content, remote assets, path traversal, archive links and inconsistent relations. Unsupported fields must be reported, not silently dropped. No generic JS-to-filesystem bridge or arbitrary path input.
4. Show a read-only preview with counts by record type, unsupported items, exact duplicates and conflicting edits. Preserve source identities with explicit source namespaces. Exact duplicates may be skipped; conflicting records require an explicit resolution. Do not overwrite or delete existing local records by default, and never replay queued requests, receipts or old upload permissions as new actions.
5. Verify a recoverable backup of the current local data before import. Stage validated records separately and commit atomically only after the complete import is ready. Interruption, disk-full, malformed source, scope changes or conflicts must leave the original database and export unchanged. Keep an import manifest/receipt for audit and duplicate detection.
6. Reopen the application and reconcile source/target counts and hashes, parent links, labels, dates and representative exact text. Verify repeat-import idempotency and failure rollback on synthetic copies. Only then enable the real-data import path for the selected source. Do not claim synchronization or backup compatibility from an import-only test.

No import feature, old-data migration, production connection or real-user-data transfer is implemented by this window patch. Full export/restore, migration, installer/update/data-retention behavior, complete supported business routes and actual Windows acceptance remain separate release gates. This candidate must not be labeled a finished official release.
