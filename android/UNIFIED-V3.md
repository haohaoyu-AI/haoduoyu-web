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

## Saved migration draft for cloud continuation

No migration implementation or real-user database read has run yet. The proposed portable format is `haoduoyu-legacy-archive`, format version 1, with an archive UUID and source app/state-schema provenance. Its authoritative payload is the original validated SQLite chunk bytes, encoded as base64 with byte length and SHA256; base64 is not encryption. A new read-only raw-payload method must reuse the existing chunk/manifest verification rather than round-trip unknown JSON fields through parse/stringify. The entire original state remains in that payload: entities/server/local/dirty, tombstones, operations in original order including frozen wire, all conflict history, drafts including intentionally empty keys, workspace/consent, UI, manifest, staging and retry state.

The cloud can implement and test these Android pieces without the signing machine:

1. Read-only validated archive export and a durable app-private backup before any old engine write; never delete or rename the old database.
2. A single migration coordinator that resumes only the old engine, only under the original consent and reverified origin/scope. Missing consent, unknown identity/wire, target changes, backup failure or corruption preserve the source and pause only that recovery step.
3. A small local recovery viewer with per-record copy and complete local JSON/text export. Large clipboard payloads must offer file export instead of risking Android Binder limits. No automatic archive upload and no duplicate import into an executable web outbox.
4. Shell lifecycle/network events and a counts-only legacy-status contract for the web-owned banner. Do not expose raw legacy user content through an unrestricted JavaScript interface. The web layer owns its UI, IndexedDB and one active new outbox.
5. Keep the old launcher/jobs until recovery and the actual web offline layer are accepted. A later completed 3.0 activation must cancel old persistent periodic jobs and keep any legacy recovery work under one owner. Existing synced server records then arrive through the normal new web pull.

Required synthetic checks, still to implement: exact multi-chunk archive round-trip including Chinese/emoji/empty/null/unknown fields; corruption/truncation/unknown-version/oversize rejection; preservation of operation IDs, frozen wire, order, receipts, tombstones, conflicts and drafts; consent=false zero writes; consent=true same-target recovery only; scope/identity change pause; successful and partial-failure old SQLite samples; failed backup/write leaves source intact; duplicate archive import remains read-only/idempotent. No test may consume production records.

## Safe shutdown handoff

The user is shutting down this computer. Stop expanding local work after committing and pushing this draft. The old signed APK and key remain in their existing locations; no pre-signing or secret transfer is performed. The cloud can continue source implementation, synthetic tests and unsigned CI builds. The completed 3.0 APK still requires the web readiness gates and then this computer's existing private signing key at the next authorized online session.

Consumer materialization of the plan reached the official helper but failed because Windows Python lacks `os.setxattr`; do not claim a successful local materialization or retry that unsupported step. The authorized Library full read completed with all 383 lines and no continuation. This limits only the local plan copy, not the preserved source or APK.
