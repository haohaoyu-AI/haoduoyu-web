# Review-only recovery of the current length-invalid body

Scope is exactly run `bd6d4434-273b-426e-a17f-9390fc124c84` and already-consumed continuation body `383496c8-a6e7-4c93-8f18-44d0e3bacdec`. This never sends a model request, resets an attempt, rewrites the receipt, qualifies the text, or freezes an article.

The existing authenticated-owner `recover_editorial_v3_stage` accepts explicit `quality_candidate: true` and `expected_provider_text_sha256`. With this flag it validates the exact completed owner/stage/input/snapshot/model receipt, safe buffered-v2 stream completion, end_turn, full EOF and message_stop. The original strict JSON body schema must pass every condition except the 2000–3000 character length requirement. Duplicate keys, unknown fields, truncation, unsafe response, missing stop/EOF or mismatched models cannot become candidates.

The three-statement D1 transaction stores `{article, quality_evidence}` with full artifact SHA, preserving the original body `content_invalid` state and error. Evidence freezes the original provider-text and complete receipt byte hashes, input/snapshot hashes, article hash and actual character count. The run moves only to `structure_review`. A conditional final assertion rolls back both writes on any intervening binding/state/control change. Reads never invoke this recovery or write a candidate.

Independent structure and fact pre-reviews read the exact entire candidate and frozen evidence. Structure must have genuine revision-needed issues; a pass cannot make a short candidate qualified. Fact pre-review must save actual full-text coverage and issues before the first structure revision can be claimed. The revision freezes the structure report as `previous_report`, plus the particular initial fact stage/artifact/input SHA and full report. Subsequent facts never dynamically replace the frozen initial report.

Only the first issue-driven `structure_revision` may use this explicitly bound length-invalid input. Its full new article must pass the original strict 2000–3000 gate and account for the structural issues. All later structural, factual and final checks use the original strict contract. Freeze independently reparses the exact full article and rejects any outstanding quality-candidate flag before bucket writes. Actual author/reviewer identities, execution IDs, original rule instructions, source/fact snapshot and final one-article dispatch remain bound.

Each necessary Claude revision uses a new current revision stage, normal owner claim and explicit one-stage cloud HTTP delegation. The existing consumed body capability cannot run again. No general failed/unknown retry permission, new run intent or standing credential is introduced.

## Owner execution sequence after reviewed release

1. Read the current run. Use normal owner recovery on the exact existing body stage with `quality_candidate: true`, `confirm: true` and original source SHA `0b38eafa3da38b9d65f3389ee0e872d2dde9a842d068669b67e6be310bb08b1e`. There is no author call.
2. Normally claim `structure_review`. The original frozen structure participant saves the genuine report against this new exact input/version; external pre-review data alone is not a persisted stage.
3. Normally claim `fact_check`. The original frozen fact participant saves the genuine full-candidate fact coverage against this new exact input/version.
4. Only after both saved reports permit the transition, claim the new `structure_revision`, inspect frozen `previous_report` and `initial_fact_report` identities, and explicitly delegate that new claimed stage through the existing owner transport tool. The cloud consumer keeps its nonce volatile and executes one POST to the existing endpoint. Original consumed body credentials remain read-only.
5. The new strictly valid full article repeats independent structure, full fact and final full-text reviews. Any genuinely necessary additional revision uses the existing dynamic stage machinery and a separate current-stage delegation. Final freeze and dispatch keep the original article ID.

Length-invalid revision outputs remain blocked under the existing strict output contract; this narrow recovery only admits the particular already-returned body above. Failed/unknown attempts and incomplete or unsafe responses never become quality candidates.
