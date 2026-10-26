# Unified Android preparation

This branch prepares App 3.0 alongside the single web frontend. It does not deploy the website or merge main. The source now builds a 3.0.0/code 4 thin-shell candidate; the already delivered 2.0.1 remains the actual signed release until website readiness, physical-device gates and the original signing machine are available. No unsigned/reference APK is described as a completed formal release.

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

## Cloud continuation: lossless archive and recovery core

Cloud work resumes from `76ba1e3` in the independent `android/unified-v3` worktree. The existing SQLite name/schema, old launcher and release version are unchanged in this first implementation step. `SqliteStateStore.readRawPayload()` exposes only the existing verified original chunk bytes; it does not normalize unknown JSON fields before archiving.

The new read-only archive validates version, UTF-8, bounds, canonical base64, byte length and SHA256. Private backup files are fsynced, atomically recorded and re-read before the old queue may run. Repeated acknowledgement-only passes reuse the original backup; newly found operations or drafts require a fresh retained archive. Imported archives remain in a separate read-only directory and cannot become the active database or grant upload consent.

The coordinator requires the pre-existing public upload grant, exact origin/account/scope, original frozen-wire identity, an independently reverified target and one process owner. A changed source aborts a write rather than replacing new local content. No source is renamed, deleted or copied into an executable web queue. Missing consent, failed backup, failed storage, incompatible wire or scope change retains the old state and does not authorize a fallback upload.

Local cloud validation: the available Java 21 runtime contains the compiler module, so pure Java was compiled with Java 8 source/target and pinned existing JUnit/org.json dependencies in `/tmp`; 81 pure JVM tests and 16 Node contract/back tests pass. This is not the Android JDK17/SDK35 build: no local Android SDK/Gradle/device is installed. The dedicated hosted workflow must still validate actual Android compilation, native SQLite/UI and lint. No signing key or password was transferred or generated; the original release certificate remains required on the signing machine.

Hosted verification for the first implementation commit `08284507cf8cbeb48236f3a353b383f182bee161`: [CI 40362708976](https://github.com/haohaoyu-AI/haoduoyu-web/actions/runs/40362708976) passed 95 JVM/SQLite/native tests (0 failures/errors/skips), 16 Node checks, both lints and both build types on JDK17/SDK35. That commit still used the preserved 2.0.1 candidate metadata; it is not evidence for the later thin-shell activation below.

## Thin-shell candidate and legacy recovery integration

The candidate starts the existing safe WebView at `https://haoduoyu.xyz/?page=todos`, retaining its first-party cookies/storage, original `android-back.js`, chooser checks, external-link routing, TLS rejection and keyboard/inset behavior. Service Worker settings use the standard first-party profile without a native API cache or custom worker interceptor. Native network callbacks and page completion emit only the reviewed fixed network event or bounded legacy counts, with both native URL checks and a JavaScript top-document/origin guard.

Old persistent job IDs are cancelled on thin-shell startup and the old service is disabled. The old runtime, when explicitly exercised by retained tests, shares the same process semaphore as recovery. Actual 3.0 user entry points do not expose the old editable native business activity. Foreground recovery uses the original engine, existing operation IDs/frozen wire/receipts and the verified archive guard. Unconsented/private/changed-scope queues do not make upload requests; they remain local, viewable and exportable. Corrupt/unsupported/oversize data pauses only recovery while the website still opens; original DB/WAL/SHM/journal files can be exported as an explicitly selected local ZIP without pretending they form a verified archive.

The separate native recovery activity is read-only. Empty draft keys, entity/tombstone metadata, operation order, frozen requests, full conflict history and unknown root fields remain in the complete JSON/text export. Large previews are labelled as previews; complete file export retains the original payload. Clipboard decisions count UTF-8 bytes without allocating another large record, capped at 64 KiB. Only system-provider `content:` URIs are accepted. Imported archives stay quarantined under a separate read-only directory, and cannot set active consent or initialize either outbox.

The dedicated workflow is updated only on `android/unified-v3`. It independently reconstructs fixed 2.0.1 source and runs its original checks unchanged, then compiles/tests/lints the actual 3.0.0/code 4 `MainActivity` candidate and inspects APK metadata. Release signing is explicitly required to remain absent in CI. The hosted ephemeral `.debug` reference cannot replace the installed stable release; final signing still requires the original private key at the authorized house machine. No credential, original APK, production record or device operation is consumed by synthetic tests.
