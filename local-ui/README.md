# Original website interface, independent local client

This is a separate, unshipped development branch. It preserves the website interface rather than the rejected Android native redesign. The old native preview and its data are untouched.

## Provenance

On 2026-11-08 UTC, read-only anonymous requests captured the public index, app.js, nine style sheets, favicon, manifest and service worker at https://haoduoyu.xyz. The index and 13 referenced/static resources match the preserved source exactly. Running the original frontend build parameters on the readable copied source reproduces the deployed app.js byte-for-byte (901,506 bytes, SHA256 `209767820e131e0e4315a2dca6afcbe74e7b2a3b4d0b632d8a279af04d1cc226`). Shell identifier: `9ee30aaf90e1117f092292da432619cecbc62abd63443b5bd4c8b06d92e9d59a`.

The user believes their previous app was 3.0.2. The 3.x shell loads the website dynamically, so its APK version cannot identify the particular cached frontend they last saw. These checks establish the currently served original website, not an unverifiable historical phone cache. The copied source is from the already isolated backend snapshot, not an arbitrary old default Git branch.

`node local-ui/scripts/verify-provenance.mjs` reproduces the source and static checks. This never requests business API data.

## Architecture

- Original HTML, CSS, icon, page markup and navigation stay unchanged. Both Android and Windows can consume the same `build/site` package.
- The standalone entry point omits service-worker installation and remote updates. A build-time alias replaces network API and online-bound offline initialization with a local transaction service.
- IndexedDB is private to the new application and uses `haoduoyu-standalone-local-v1`. It does not open/import the old website database or the native preview's SQLite file. Draft protection reuses the original durable journal.
- Local data has an explicit local owner/scope. It is not an invented public server identity or upload consent. No production transport or fallback is bundled. Unsupported server-dependent routes fail with an honest error rather than fabricated empty results.
- Android uses an isolated package and fixed secure local asset origin. It has no INTERNET permission, arbitrary native bridge, broad file access or remote navigation.
- Semantic text corrections (for example removing “requires network” for a local future-item move) and nonvisual readiness adapters are listed in `build/manifest.json`; no alternate visual design is introduced.

## Current boundaries

Implementation and tests are still in progress. Do not describe this as a delivered, fully validated APK. Real-phone verification, existing-data import, independent full-backup/export compatibility, remote-only analytics/AI and file-download support are not implied by preserving their original UI buttons. No user data, formal signing key, website deployment or device has been touched.

The phase 2b candidate adds a durable todo/future composer journal, exact-request retry protection,
and the shared close/flush/resume handshake. Original note controllers collect current editor
values before closing. The original content-review loader now reads eight genuine local
collections, empty on a clean installation. It does not invent user records or run AI analysis.
See `draft-lifecycle.md` for protected/unsupported input scope and `phase2-acceptance.md` for
actual page selectors and the still-required real-host checks. The new archive-export guard
explains that saving files is not supported and leaves all retained drafts unchanged.

The previous phase 2 snapshot was withdrawn as a close-safe candidate after an independent
synthetic test reproduced a repaint overwriting raw tail characters before capture. Phase 2b
captures supported editors and identities synchronously before any await or repainting edit,
then rejects conflicting or changed identities without writing into the wrong record. If the
original editor DOM is destroyed, its in-memory request snapshot is not a visible or durable
recovery system. This path refuses close; it is not a promise of lossless arbitrary navigation.

The source/API/contract suite passes 99 tests after rebuilding the phase 2b site, including
the actual Java URL policy and synthetic transaction/controller lifecycle checks. These are
not real-browser IndexedDB or Android/Windows runtime acceptance. Current original navigation
does not expose the old memo page despite its retained service-level compatibility. The shared
JavaScript subset is 92 tests; the other seven require the separate Android host source and JDK.

## Reproducible shared build

Use Node 24 (the package supports Node 22+) and the locked official esbuild 0.28.2 dependency.
On a newly approved checkout, run these commands from the `local-ui` directory in this order:

```
npm ci
npm run verify:provenance
npm run build
npm run test:shared
```

The preservation tests require the freshly generated `build/site`, manifest and input metadata,
so running tests before the build is not a complete fresh-checkout check. `test:shared` excludes
the Android host checks. In the full engineering checkout, `npm test` additionally runs those
seven checks and needs the Android standalone source and a JDK on PATH. A shared-only source
export omits the Android host test and must not report those seven checks as having run there.
Neither command installs Android tooling or runs a real WebView.

Both build scripts check the exact esbuild version. An existing approved installation can be
used read-only through an explicit absolute `ESBUILD_MODULE` path instead of installing again.
The scripts themselves never install dependencies, connect to production, or publish files.
Build working-directory normalization and local `.gitattributes` preserve output asset bytes
across repository-root and package-directory invocation. Browser/device/transaction acceptance
must pass for an exact final build before delivery.
