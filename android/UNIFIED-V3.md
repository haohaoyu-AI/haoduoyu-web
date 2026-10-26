# Unified Android preparation

This branch prepares App 3.0 alongside the single web frontend. It does not deploy the website or merge main. Until the web Service Worker, IndexedDB, outbox and mobile acceptance gates pass, the existing 2.0.1 launcher and release version stay active; no preparation APK is described as a completed 3.0 release.

## Preserved baseline

- Complete Android baseline: `d5e417384fc66870e810cd14626f770a1be88d0e`, Android tree `23fcf5cfe9429072b6519faff9d4bee178013995` (34 tracked files).
- Actual 2.0.1 build source: `337140824124c055fe4a94e9746129d5b8583a6c`; the baseline differs only in two delivery documentation lines.
- CI `40333738055`: 80 JVM/SQLite/native tests and 16 Node contract/back tests, no failures or skips; debug/release lint and builds passed.
- Preserved release: 86,644 bytes, SHA256 `6d2ac04d3fe33131c3d90544a41c40d654d006bd186e93584257c6845f77fce6`. Existing Library release is retained separately.
- Package `xyz.haoduoyu.personal`, minSdk 26. The future completed release must use versionName `3.0.0`, versionCode greater than 3 and the existing release certificate `f65c547294ac358bc9c3e3ab8edb3a29d0483182fe01ab74c1fe4e30cbbe0ac5`.
- The existing encrypted key stays in the user's local `Documents/HaoduoyuPersonal/signing` directory and its password stays in Windows Credential Manager. No key, password or user backup belongs in Git, CI artifacts or Library.

Cloud integration must extract only `android/` from the exact baseline, not merge this old web branch over current `web/`, `src/`, `public/` or `db/`. The Android CI workflow is outside that directory and needs separate review.

## Migration boundary

The existing SQLite file and schema remain intact. A verified, durable private backup precedes any legacy migration write. Unknown fields, empty drafts, entity IDs, versions, tombstones, operation order and frozen request bytes must remain recoverable.

The legacy outbox has one owner: the old SyncEngine. It can resume only when the saved public-upload consent is already true and the server confirms the same origin and scope. A private identity, scope change, missing consent or unknown frozen identity pauses recovery; nothing automatically grants upload permission or converts the old queue into a second active web queue.

Successful old writes reach the same server and are then pulled by the new web layer. Unsent records, conflicts and drafts remain available through a small legacy recovery viewer with local copy/export. Imported archives are historical, read-only records and cannot grant the web runtime upload consent. No SQLite deletion or rename is required to claim progress.

## Ownership and release gates

- This branch owns Android only; cloud owns the shared web frontend and the root progress/report documents.
- Shell work may prepare WebView storage, back/file/external-link handling, insets, startup and lifecycle/network events without claiming the web offline layer exists.
- The completed thin-shell launcher and removal of old periodic jobs wait for tested legacy recovery and the web readiness contract. Existing persisted jobs and migration work must never replay the same old queue concurrently.
- No production write or physical-device acceptance is claimed by synthetic JVM/worker tests.
- New website deployments stop at 2026-10-27 01:00 UTC (09:00 Beijing); Android does not deploy the website. No new scheduled automation is created.

Plan source: user-approved Library document `libfile_d157f985b0748191bd9527eef9d384d2` (19,942 bytes, full 383-line read). The latest explicit user instructions take precedence over its original 07:00 cutoff and its removal of old upload-consent protections.
