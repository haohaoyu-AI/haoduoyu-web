# Daily independent editorial pipeline

Only newly claimed `daily` rows receive `editorial_contract_version: 1` in their input snapshot. Existing daily, manual, test, rewrite and stepwise snapshots are not upgraded or reinterpreted.

## Sequence

1. Claim and prepare the complete frozen daily topic/materials/sources/outline as before. New input is checked before freezing and before any paid request.
2. Save the exact initial article. For Claude, the initial article must still match the actual completed provider response. The initial text is stored separately as immutable version 1. State is `review_pending`; no article object, Word, image search, event or platform draft is created yet.
3. Execute three real, separate agent stages: independent review with issues; rewrite with a change for every issue; independent verification of all changes and newly introduced problems. Use `create_daily_text_revision`, then the existing claim/read/save revision stage tools. Pass actual attested actor/execution IDs and model labels, not invented provider provenance. Reviewers and verifiers must differ from initial writer and rewriter. These are owner-attested receipts, not cryptographic proof of model execution.
4. `verified` is not `user_confirmed`. The old stepwise confirmation tool rejects a daily flow. With no review issues the daily rewrite may retain exact original text; it still requires independent verification.
5. `finalize_verified_daily_revision` receives only the flow ID, expected body hash and confirmation. It reads version 2 from the server, keeps the original article ID, records `agent_text` final provenance and the original writer/provider attempt separately, and joins the existing private-draft illustration workflow once. It never accepts replacement body text.

## Failure and recovery

- Failed or expired stages cannot silently retry or generate another initial article. Read the existing flow and preserve its output.
- The revision stages never call a paid provider; approved and used additional calls remain zero. A later configuration/model change does not prevent these zero-provider agent stages from using their frozen inputs.
- New daily provider output is inspected before storage and return, including errors, partial JSON, encoded credentials, metadata and usage. Both the captured request key/token and current owner credentials are checked, so key rotation during a request does not remove protection. Unsafe payload is suppressed; only trusted bindings and numeric diagnostics remain.
- The provider response is not overwritten when the final article is saved. Read-only progress derives from the editorial/author state, including recovery when initial persistence succeeded but the provider metadata update failed.
- Writing lists exclude stage lease rows before limiting results, show the actual initial title while review is pending, and label final output as initial author plus independent agent revision.
- Finalization is idempotent. A failed private-draft dispatch recovers the same verified article, not another generation.

## Verification boundary

The offline suites use SQLite and mocked provider/network/events, including concurrent finalization, legacy snapshots, credential rotation, truncation and save recovery. The real cloud-browser 310-second zero-model probe confirms connection continuity only. It does not establish a real Claude end-to-end generation or full scheduled automation acceptance.

The 08:00 automation stays paused until explicitly resumed. This deployment creates no writing run, no model request and no platform draft by itself. Real paid acceptance remains separately authorized.
