# V68 editorial pipeline fault matrix

Audit date: 2026-10-06. Baseline: `9d8c4ad5c989ec2ef88469d92af86ff95f80212b` (V67). This audit is local only. It inspected the request → frozen evidence/prompt → stage claim → long-connection writer → independent reviews → final freeze → existing article event chain. Production data, actual provider requests, subscriptions, schedules, uploads, pushes and deployment were not used.

The V67 reproductions used an isolated source snapshot, in-memory SQLite, synthetic provider packets and mocked event/object storage. The durable V68 regression suite is `tests/editorial-faults-v68.mjs`; existing production implementations are not mocked away inside the flow service. Fixtures never represent real article research or genuine independent agent execution.

## Findings and expected regression outcomes

| ID | Fault / evidence | V67 outcome | V68 regression requirement |
| --- | --- | --- | --- |
| F01 | Throw during flow phase update after saving an actual completed outline artifact | Completed stage, completed receipt, but flow remained `outline`; ordinary re-claim read-only | Artifact and phase roll back together. Actual receipt survives. Explicit recovery of that same receipt advances once with zero extra provider requests |
| F02 | Throw while marking stage requested after provider reservation | Orphan `claude_attempts.requested`, stage still `claimed`, no receipt linked; replay cached although provider calls were zero | Reservation and stage requested state commit together. Rollback leaves no reservation, allowing the exact unexecuted claim to make its originally authorized one request |
| F03 | Pause after preflight, before artifact write transaction | Separate writes could save a review then fail phase advance; returned `saved:true` with old phase | Pre-transaction pause defeats the artifact/phase CAS together; neither review nor phase changes |
| F04 | Genuine outline review has `decision:blocked` and an anchored issue | Later condition relabeled it `outline_needs_revision` | `content_blocked` takes precedence; body remains unavailable |
| F05 | Bound old four-stage grant: one actual outline receipt, review `revise` with eight anchored issues | Correctly stopped, with no authorized outline revision path | Preserve all eight issues, old snapshot/grant JSON/hash, original receipt and single request. Remain `outline_needs_revision`; no body, hidden extra call, fake pass, new key or batch |
| F06 | Expire a standalone already verified flow | Freeze and dispatch could proceed because only delegated expiry was fenced | No new object put, article freeze or event. Existing owner-bound data stays readable |
| F07 | Expire an already frozen standalone flow | A new event could still be dispatched | Repeated freeze returns the existing result without a new write; new dispatch is rejected |
| F08 | External dispatch throws after local handoff reservation | Remained `dispatching` indefinitely without a durable unknown result | Persist `dispatch_unknown`; repeated call reads that state and does not send again |
| F09 | Pause before local dispatch reservation transaction | Late separate article queue update could still precede an event after pause | Return read-only frozen state; article stays `uploaded`; zero event calls |
| F10 | Throw during article queue mutation in dispatch transaction | Local handoff state and article state could diverge | Flow remains `frozen` and article `uploaded`; zero external calls |
| F11 | Change current stage instruction wording without changing the snapshot | Reconstructing old inputs from current code made completed flows unreadable | New flows freeze stage instructions plus validation version. Old V67 inputs use the exact retained V67 instructions/validation route. No historical input/hash is rewritten |
| F12 | Completed DB receipt whose JSON has `state:failed` or the wrong `stage`, while model/hash/text are otherwise valid | Ordinary recovery and load accepted its artifact, even though author text projection reported `binding_mismatch` | Reject before artifact or phase mutation; normal recovery and subsequent load enforce the same receipt state/stage/text binding as format conversion |
| F13 | Repeated/concurrent archive of a previously paused flow, then restore | Re-archive could erase the saved prior pause | Repeated archives remain reversible, and restore returns to `paused`; no claim/provider/dispatch is revived |
| F14 | Pause after entering the actual external dispatch function | External accepted work could still complete | Preserve the accepted result. Test records exactly one dispatch invocation. Do not claim cancellation can recall an already in-flight external request |
| F15 | External dispatch accepted, then terminal DB transaction failed | External outcome exists but local row remains `dispatching` | Remain conservative and read-only; re-entry cannot send another event. A local row alone does not establish external success or failure |
| F16 | Request expiry advances between two statements in one SQL batch | Separate wall-clock predicates can make one CAS pass and the other fail, despite transactional rollback on exceptions | Use one operation timestamp for all relevant expiry predicates. Artifact and phase must have the same linearization outcome even if wall-clock time advances within the batch |
| F17 | Throw during flow technical-failure classification after stage classification | Actual failed receipt survives, but stage became `technical_failed` and flow stayed at the prior stage | Classify the terminal stage/flow pair atomically while retaining the actual failed receipt; never repeat the provider |
| F18 | Throw during flow content-invalid classification after stage classification | Stage became `content_invalid` and flow stayed prior; outline format recovery was subsequently ineligible | Classify stage/flow together. After rollback, the same completed receipt may be re-parsed/reconciled without another provider request |

F01–F04, F06, F08, the pre-send V67 F09 race, F11 and F12 were reproduced against the isolated V67 baseline. F05 is a preserved authorization boundary, not evidence of an authorized additional paid stage. F14/F15 describe unavoidable external-system uncertainty rather than an absolute external exactly-once guarantee. F16 is an additional expiry-tick regression for the repaired transactional path. F17/F18 were then reproduced against the V68 terminal-classification path during the final independent review.

## Required invariants by boundary

- Request identity: fixed owner/request key, one request and one bound flow. Frozen grant/model/prompt/capability remain immutable; source audit references are not independent permission evidence.
- Facts and prompts: public evidence pack matches the latest completed real research record; all writing and stage instructions are frozen. Style examples are never treated as new factual evidence.
- Claims and charging: one winning claim; token never in prompt/UI persistence/artifact metadata. Exactly one provider reservation per allowed writer stage. A failed/unknown/reserved outcome is not permission to reset, rename or retry a paid call.
- Completed author receipt: owner, receipt ID, response state, stage, model, input hash, snapshot hash, full exact provider text and parsed artifact must bind together. A successful HTTP response, provider label or shape check alone is insufficient.
- Independent review: real separately executed identities, exact frozen full input and quote anchors. A review cannot be supplied as a Claude writer revision. Server validation is not cryptographic proof the reviewer ran or semantic proof every factual claim is true.
- Skip: only a genuinely passed zero-open-issue report can retain the same complete article/hash; mandatory final verification still runs.
- Freeze: exact independently verified clean full text, including new facts; same article ID, immutable final hash and original provenance. Concurrent freezes may repeat an identical object put, but cannot create a second article or charge a model.
- Controls: owner-scoped pause/archive/cancel wins before its corresponding local commitment gate. Read/restore never launches work. Real in-flight provider returns retain their actual receipt without reviving stopped processing.
- Credentials: inspect the entire untrusted packet, including keys, escaped/percent-encoded/truncated data and captured old key across rotation; return only safe numeric accounting/diagnostics. Cross-owner IDs cannot expose private artifacts or receipts.
- Dispatch: local CAS prevents another invocation of the flow's dispatch operation. Existing webhook transport can retry delivery using its stable event ID; downstream receivers must deduplicate. This is not a guarantee of a single network attempt or exactly-once downstream processing.

## Unresolved execution / acceptance boundary

The paid writer still runs in the request process behind the NDJSON helper, with the existing SSE-aware provider adapter and 300-second deadline. There is no durable Worker/job that owns and resumes an unfinished provider call.

- Closing a UI stream cancels UI delivery, not proof the provider stopped. The execution promise may continue while the host process survives, but host termination can lose it.
- A `requested` receipt after process loss is an uncertain reservation. It is read-only; neither a new key nor a new batch is a recovery mechanism.
- A lost winning token before invocation is not an authorization to issue a fresh paid claim.
- Accepted editorial wake is not proof research, independent agents, long-connection authenticated execution or private drafts succeeded.
- Local mock success does not prove the cloud assistant can authenticate and hold the real helper connection, that real independent agents ran, or that YYLX/output/accounting and downstream image/Word/private-draft integration worked.
- If external event acceptance happens and the final local write fails, `dispatching` is conservative evidence of unresolved outcome. Confirm downstream status by a read-only, owner-authorized observation before deciding any recovery; do not blindly resend.

A separately authorized real acceptance should establish the exact cloud helper authentication/long-connection behavior, actual provider receipt/model/usage, genuine independent execution IDs, final full-text/hash agreement and same article private-draft handoff. It must not consume the preserved failed/unknown old grant as a fresh test or change the daily schedule as a side effect of code repair. The latest scheduling instruction is handled separately; scheduling does not supply a missing daily adapter or broader paid grant.

## Proposed finite outline revision extension (design only, not enabled)

This audit does not implement or authorize a second grant version. The current production default remains the original four named possible writer stages. The real old `revise` case with eight issues stays stopped.

If the user later approves an additional narrowly bounded request, the minimum complete design is:

1. Bind the extension to the same authenticated owner, original request ID, existing flow ID, exact snapshot hash, current outline hash and exact independent review hash/eight issues. Keep the original grant/snapshot/outline/review/receipt unchanged. No new article batch or request key.
2. Add only one optional paid `outline_revision`, written by the same frozen Claude writer/model/provider under the same public-material/privacy limits. Its separate receipt/reservation cannot consume or rename the original `body` allowance.
3. Require full revised outline and an explicit accepted/rejected decision for each original issue. Rejections need a substantive evidence-grounded reason. New blocking gaps stay explicit. No invented pass and no manual GPT rewrite mislabeled Claude.
4. Add mandatory independent `outline_recheck` on the exact revised outline/full frozen evidence. The reviewer remains independent of the writer; use a new real execution ID and preserve the initial review. Only a genuine pass permits body generation.
5. Cap the combined flow at five possible requests: original four named stages plus this one revision. Every stage still has one stable receipt key and zero automatic paid retries. A second `revise`, failed/unknown revision or failed recheck stops again. The cap is not a guaranteed currency limit.
6. Use a versioned additive extension record and frozen extension instructions/artifact schemas rather than mutating old `input_json`, prior hashes or historical stage inputs. Old-only flows remain readable by their original route. A new five-stage start would require a separate explicit disclosure/approval; this design alone grants nothing.
7. Display the added one-call commitment, exact model/output cap, YYLX destination/public-material transfer, unchanged private-draft destination and no-retry restrictions before approval. Do not silently enlarge all future requests or old daily budgets.

This resolves an editorial sequencing gap only when new authority exists. It does not resolve the non-durable long-connection runtime boundary; that still requires the separately scoped real acceptance above.

## Verification commands and scope

- `node tests/editorial-faults-v68.mjs`: fault/expiry/concurrency/compatibility/receipt-binding and bounded old-grant cases with in-memory SQLite and provider/event/bucket mocks.
- `node tests/editorial-flow.mjs`: original necessary four-request / zero-issue paths; exact receipt and same-article binding; HTTP/MCP/NDJSON adapters; archive/format-recovery gates.
- `node tests/editorial-safety.mjs`: encrypted-key wrapper, request/stage token suppression, complete packet inspection and safe usage.
- `node tests/editorial-request.mjs`: original bounded request/wake/claim path, no stage setup for the user, exact four-request route and cancellation preservation.
- `node tests/editorial-contract.mjs`: original contract validation suite (267 baseline assertions), plus separately maintained current strictness regressions.
- `node tests/claude-outline-provider.mjs`: fixed-origin metadata, actual one-shot adapter under mocks, interrupted/timeout/HTTP524/SSE/UTF-8/credential boundaries and no paid retry.

The above baseline suites passed during audit; the final V68 suite passed all 18 groups after fixes, including the deterministically injected F16 database-clock tick and the F17/F18 terminal-classification rollback/receipt-only recovery cases. Each terminal recovery preserves the exact original attempt row and causes no extra provider request. A prior real 180-ms delay reproduced the same split before the shared operation timestamp repair. Final aggregate tests/lint/type checking after all contributors finish remain the parent's verification step. No live acceptance is implied.

## Independent review follow-up fixes

The first frozen candidate was `7cc8f293256d85328e62ecd87ecee0d63986480b`. Independent review subsequently reproduced two additional gaps; that deliverable remains preserved as the prior version.

- F19: A completed provider packet returned another model, and its technical-failure phase write failed. The actual receipt persisted but recovery rejected model binding forever. Recovery now reconciles only the exact owner/receipt/stage/input/snapshot-bound packet to `technical_failed`; it never accepts an artifact or changes the receipt/model/text, never advances to body and never invokes the provider again. Wrong owner/stage/input/snapshot/state still fails closed.
- F20: Research legitimately changed between preflight and flow insertion, or between insertion and binding. The old implementation could preserve a stale unbound flow and lock the same authorization key. New delegated insertion and request binding share one transaction and the same exact progress JSON/operation-time CAS. Research also cannot change after the precisely owner/request-bound flow is frozen. A pre-insert update leaves no flow and permits the latest evidence under the same key; a post-insert update is rejected and rollback permits the original unchanged evidence under the same key. No frozen evidence is rewritten and no new request key is created.

`node tests/editorial-review-followups.mjs` covers the model-mismatch terminal-write rollback plus both evidence windows, original receipt byte equality, invalid binding rejection, no extra provider calls, same-key recovery and legacy invariance. The original 18-group fault suite and original flow/request suites are rerun against the repaired candidate. This remains local mock verification, not paid/live acceptance or daily adapter implementation.
