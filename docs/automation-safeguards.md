# Automation integrity contract

Implemented independently from the existing application and public interface requirements. No Easel source, third-party skill text, queue, or license-restricted code is copied.

## Scope and compatibility

The four nullable migration columns are `writing_runs.input_snapshot`, `articles.artifact_manifest`, `articles.draft_readback`, and `article_deliveries.readback`. There is no data backfill, deletion, schedule change, authorization-slot change, or API-key change.

New daily claims receive contract version 1. Existing claims, old articles, explicit historical tests, and the already-authorized v46 manual pair retain their original contract. Absence of historical evidence is displayed as `legacy_unverified`, never converted into a successful new verification. Existing daily quotas, the single manual pair, and Claude 14000-output / 300-second / one-request limits remain unchanged.

## Complete deterministic input

`prepare_writing_input` binds one owner's active article claim to the full unchanged V2 prompt, current output instructions, independent research materials, and canonical sources. Missing material blocks preparation before a provider request. An agent may do the research; no new user checklist is required. The returned system and user strings, their hashes, and the frozen source records are authoritative. Duplicate preparation returns the same snapshot, while changed inputs or stale leases are rejected. Claude's daily route performs this same preparation automatically.

Canonicalization removes fragments and known advertising tracking fields, orders query keys, rejects embedded credentials and signed/authenticated query parameters, and disallows duplicate canonical sources. It is a mechanical provenance check, not semantic event deduplication or factual verification. Source facts still require the existing research workflow.

## Frozen output and images

The existing text save and SHA-protected Word upload remain authoritative. Contract-v1 articles add an immutable original-text digest and evidence digest, plus an ordered image plan. Each planned image has original-byte SHA256, public source, and placement over the title/body paragraph indexes.

The actual DOCX is checked for exact nonempty paragraph text/order and actual embedded image bytes/order/placement. Images must be independent inline paragraphs, with supported PNG/JPEG/WebP containers; floating images, bare or alternative representations, missing image references, malformed images, and changed text fail verification. PNG checks are bounded and streamed. Supported container validation does not replace the existing document rendering and visual review.

Final Word verification is stored in the existing output metadata. Destinations retain their existing independent states. A new completion requires a fresh agent readback of title, full ordered body, observed image URLs/order/placement, and the matching Word digest. Image `reference_sha256` maps a visually inspected platform image to the frozen plan: it is not falsely presented as the hash of a platform's recompressed image. Image relevance is reviewed by the existing agent workflow; hashes verify completeness and identity/order, not semantic meaning. Only private draft links are accepted. Public publishing is never introduced.

Authorized temporary-file cleanup cannot prevent another platform from finishing: a fresh platform readback must still match the retained immutable original digest even after extracted text is removed.

## Disconnects and safety

Generation status is a read-only projection of the existing attempt. Gateway/transport uncertainty is distinct from a completed result awaiting save. Manual-page reconnects and polling only read existing results, with stale-refresh responses ignored. An existing attempt continues to block a new provider request, including after disconnect, partial response, expired claim, failed save, or unknown outcome. Reservation checks the active owner/article/token/expiry atomically.

Known claim tokens and high-confidence credential patterns are rejected before input/body freezing. Provider secret echoes are redacted from unsuccessful diagnostics and cannot become saved text. Public workflow errors use fixed application messages rather than parser, database, or provider error bodies. The original article is never automatically redacted or rewritten.

## Verification

Offline `tests/automation-safeguards.mjs` covers complete prompt bytes, absent and duplicate evidence, canonical sources, token rejection, frozen text, missing/reordered/misplaced/floating/bare/invalid images, actual DOCX SHA, independent platform receipts, cleanup followed by later delivery, cross-owner/stale-token rejection, legacy non-mutation, and read-only recovery. Existing Claude/manual suites cover concurrent one-charge reservation, response disconnects, save recovery, preserved daily/manual scopes, and additional expiry-at-reservation / secret-echo cases. All providers, storage, and destinations are mocked; no production generation or publication is used for tests.
