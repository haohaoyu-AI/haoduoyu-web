# Migration notes

## Source and merge

This review copy derives from an independent Windows network-development source
snapshot captured 2026-10-01; the source tree had no Git metadata. Network
support was merged selectively from the separate LD033 candidate into the
newer staged business source. Existing staged business/UI changes were kept;
the older candidate's full `console.py`, page branding, and package README were
not copied wholesale. `SOURCE-MANIFEST.json` records per-file hashes.

## Contents and boundaries

Included: `article_hub` Python/HTML source, Python/CJS tests, platform module
source and safe fixtures, dependency lists, project notes, and the referenced
favicon. Excluded: Git history, virtual environments, runtime data/config/state,
credentials, sessions, browser profiles, private keys, user manuscripts/images,
generated documents, logs/caches, and phase evidence. See
`EXCLUSION-SUMMARY.md`.

## Runtime and portability

The current source targets Windows and uses Windows-oriented browser/platform
automation. Root fixed-path start/stop scripts were not carried over. The
console now includes explicit network-test CLI wiring and exact-interface,
HTTPS/peer-allowlist server code; no LAN service was started in this review.
Python listener readiness is checked by socket/thread state without an HTTP
self-probe. The separate Windows launcher change and automated LAN restart
launcher are not included. Linux/cloud path, browser, certificate, and runtime
adaptation remain unverified; this is not a cloud-ready package.

## Verification boundary

The user-reported development-instance login and sample-save/refresh result is
an observation about that other instance, not this copy. Second-device/LAN
acceptance remains outstanding. Only the targeted offline checks recorded in
this package's review report were run; no external service, model, search,
platform posting, or user data was used.

This is a local review stage only: no Git initialization, commit, authentication,
upload, or push has occurred.
