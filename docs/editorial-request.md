# One-time background writing request

## User surface

`/writing/editorial-run` has one start button and one bounded consent. Topic/angle are optional ordinary text; otherwise the assistant selects and researches a current public entertainment topic. The user never fills JSON, participants, claims or review reports.

The consent names the currently enabled exact Claude model, full V2.2 prompt version, output-token cap, the fixed YYLX origin, public-material transfer, at most four necessary calls (outline/body/optional structural revision/optional factual revision), zero-issue skips and private drafts only. It says the token/request limits are not a guaranteed currency ceiling. There is no paid retry. Model/version/cap changes between disclosure and start reject the new start instead of silently widening authorization. A duplicate `request_key` recovers the same original request before new-input validation; it cannot create another article or reopen old charges.

The normal status GET and MCP read are provider-free. Only explicit initial/new-start preview (`start_preview=1` or `read_editorial_start_preview`) reads unpaid current model capability metadata. Polls never create work, refresh a grant or make model calls. UI stores only owner-scoped request IDs/keys, never credentials, reports or provider tokens.

## Durable request, wake and real execution

Migration 0017 adds `editorial_requests` and `editorial_request_outbox`. Creation freezes the scope, exact full prompt/model/cap, permission and task instructions before dispatch. It persists even if the user closes the webpage or turns off their own computer. `editorial.requested` contains only `request_id`; it uses the existing signed challenge transport in a separate event namespace. It does not change any article/topic subscription or the paused 08:00 schedule.

Pending delivery has an atomic lease and cooldown; retries preserve the same ID and cannot call a paid model. Accepted delivery means the wake was accepted, not that the writing/reviews ran. No connected trigger means the request stays genuinely queued. The application has no embedded agent launcher.

The verified assistant trigger must:

1. Read the authenticated owner's request and call `claim_editorial_request`. Only the atomic winner receives a bounded, ephemeral claim token and the frozen instructions/authorization. Do not fabricate progress or identities.
2. Actually research public entertainment sources and recent-title overlap. `record_editorial_request_progress` accepts only actual research/coordination records, with actor/execution/model; research completion also requires the full dated `fact_pack` (`sources` and `facts`) and saves its hash. It cannot mark a body/review/verification completed.
3. Create the contract2 flow with `request_id`, `request_token` and fixed `authorization_key=editorial-request:<request_id>`. The claim, frozen model/prompt/cap, optional user-selected topic/angle and single bound flow are server-checked. The flow's fact pack must exactly match the latest completed actual research receipt/hash; missing or blocked research prevents creation. Claim tokens are hash-stored and suppressed if echoed into materials/reports.
4. Coordinate the real distinct independent stages using the frozen stage inputs and exact actual reports. Paid writer work uses the existing SSE-aware NDJSON transport through the cloud assistant helper (`/writing/editorial-helper?run_id=<flow_id>`); no user per-stage confirmation or local-computer dependency is required. Do not substitute the retired short MCP generation route. Each actual request still has one atomic reservation and immutable actual provider receipt.
5. Skip genuinely zero-issue revisions with unchanged text/version/hash. Independently recheck the exact complete final version including new facts, freeze, and dispatch the same article through the existing illustration/Word/private-draft chain.
6. On an actual content/technical/execution failure, record the honest blocker and stop. Never reset quotas, recreate a failed attempt, change provider provenance, launch an old outline test, or silently start another article.

The real trigger and cloud-helper authentication/transport must be separately verified by the parent. A deployment cannot honestly establish that real independent agents, paid generation or end-to-end private drafts have worked. If the cloud helper cannot execute authenticated long connections, stop and report that specific blocker; do not claim a durable provider queue exists.

## Cancellation and preserved data

Cancel only changes the new request/control state and its pending outbox. It preserves the original flow state, all actual paid receipts and any already frozen article/drafts. SQL request fences prevent subsequent paid/phase/freeze/dispatch mutations after cancellation. An in-flight actual paid return is retained but cannot revive a cancelled flow. The exact old Deng Ziqi parent/child tests are never imported, resumed or reused by this request path; they remain separately archived under the original reversible control.

New requests have a 24-hour authorization lifetime and one 8-hour orchestration claim. Expired/failed/unknown work remains readable; there is no blind paid retry or automatic token reissue. A new round requires fresh user input/start authorization, not a hidden quota reset.

## Verification boundary

Everything tested here is offline: SQLite, local provider/event/storage mocks and React SSR/hooks. Genuine four necessary writer receipts, independent reports, final full-text coverage/hash and same-article one-time dispatch are exercised under one saved user authorization. The separate signed editorial event preserves existing topic/article rows. No real subscription, model, database migration, website deployment, public publication or schedule was changed by implementation.

Independent-review hardening: every optional paid revision is rejected server-side
before reservation/provider when its preceding report has no actionable issue;
UI skipping is not the security boundary. The new payload boundary performs
bounded Unicode/JSON/percent inspection, including keys and truncated packets,
canonical hash-only request-token checks, and captured old-key checks during key
rotation. Provider progress stores only fixed/trusted model information and safe
numeric usage/diagnostics. Legacy callers omit the optional new inspection hook.
First-use unconfigured reads return configured=false without a provider request.
The writing brief directs new work to this request/contract2 path and labels old
outline operations as existing-frozen-scope compatibility only.
