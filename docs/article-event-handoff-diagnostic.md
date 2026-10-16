# Article event context handoff: diagnostic and acceptance boundary

Prepared 2026-10-07 UTC. This candidate adds sender observability only. It does **not** repair or claim to repair the platform runner's missing event input.

## Observed incident

- The owner requested a fix because submitted articles no longer automatically begin their authorized illustration workflow.
- The parent assistant reports article-event wakes around 2026-10-07 02:37, 03:17 and 03:31:21 UTC. The supplied input contains the event subscription's workflow instructions and refers to a following `automations.mcp_event` result, but no actual result, `eventId`, `data.article_id`, or other exact article identifier is present in that input.
- The current connected source catalog contains “好多鱼图文”, connector `asdk_app_sites_3c3dc6813cb88191bfa2eeea8fb8e132`.
- The current tool catalog exposes no `mcp_event`, event-result read, or automation peek/run-history action. The automation-list action returned the same task-service ERROR twice during this investigation. No automation configuration was changed.
- An earlier sender log supplied by the parent has `sign_begin` / `fetch_begin` at 2026-10-07 02:37:23.731 UTC and a site request with outcome `ok` at 02:37:24.806 UTC. Request ID: `8d4954d79c0c5ba8c93d410545995efb`. Trace ID: `58af1ba403427c43caafc2acea7f11f1`. The old log contains no outgoing event ID, callback HTTP status, or platform run ID. A completed site request alone cannot establish successful downstream context delivery.
- The new read-only sender-log lookup asked for 180 minutes and 100 entries but returned only 40 recent entries spanning 03:38:40.063–03:41:12.508 UTC. It did not cover the cited wakes. Its absence of event-transport entries is not evidence that the earlier events were never sent.

The three queued article rows shown in the owner's screenshot must not be assigned to those wakes merely by chronology. The separately authorized work on those exact screenshot articles is independent of this event diagnosis.

## Source facts

Source baseline: commit `ef98fb329098f7182e2b1b8758e9ce3edb9fa7bb`, tree `ae455feead119ae6eed5ccb1a714e1b12ac2a585`.

`app/mcp/route.ts` advertises `article.submitted` with a required string `article_id` and no other payload properties. `lib/events.ts` constructs this envelope:

```json
{
  "eventId": "evt_<exact article ID>",
  "name": "article.submitted",
  "timestamp": "<stored article creation timestamp>",
  "data": {"article_id": "<same exact article ID>"},
  "cursor": null
}
```

The exact serialized body is the same body passed to HMAC signing and fetch. The webhook header ID is the envelope's event ID. The current article envelope is unchanged in the prior inspected event-source commits `a66317c` and `79d2de6`. This does not independently prove a historical successful wake, but it gives no evidence for a new sender serialization regression.

There is no platform runner/context-assembly source or writable platform event-context API in this checkout. Replacing the subscription, polling the latest article, or resending an already accepted event would not repair that boundary and could process the wrong article or duplicate work.

## Minimal sender patch

Only `lib/events.ts` and a focused offline regression test change. There are no migrations, queue-state changes, subscription changes, security changes, provider calls, or automatic redispatch changes.

For each existing send attempt, the diagnostic logs:

- Event ID, allowlisted event name, safe subscription identifier, attempt number
- SHA256 and byte length of the exact signed body, allowlisted data-key names
- Send/sign stages and callback HTTP status / whether that status is 2xx
- A fixed `callback_acceptance_only` meaning and duration
- A fixed error type on transport failure, without the error message

It does not log callback URLs, owner IDs, secrets, signatures, verification challenges, article content, raw response bodies, claim tokens, or paid-provider information. Logging/digest diagnostic failures cannot induce another delivery. The callback body is still left for the original caller to handle. A 2xx log cannot establish whether the platform generated a run or supplied its input correctly.

## Platform-owner diagnostic request

Please trace the existing incident across the webhook receiver, accepted event record, automation run, and runner input assembler. Use the exact event/subscription identifiers where the receiver has them; the sender request/trace above can help locate the incoming event, but must not be presented as an already proven event-to-run correlation.

Establish these boundaries without rerunning the article:

1. Which exact signed body and `eventId` did the receiver accept, and which subscription and existing automation run did it bind?
2. Does the stored accepted envelope still contain `data.article_id`?
3. Did the run's persisted input include the actual `automations.mcp_event` result for that same event?
4. Did the parent assistant's assembled model input contain that result, or only the subscription instructions?
5. If the result was missing, repair the context assembly/delivery at the first boundary where it disappeared. Do not deliver an instructions-only wake as though it contains an actionable article. Preserve original run/event identity and duplicate protection.

This investigation cannot determine whether loss occurred at acceptance, run construction, context assembly, or dispatch to the parent. An exact root-cause claim requires the corresponding platform records.

## Single-event acceptance

After the platform fix and any owner-approved publication of sender diagnostics, use **one new, explicitly authorized article** through its normal submit action. Do not use an earlier accepted article as a probe and do not guess a latest article.

Acceptance requires all of the following evidence for the same event:

1. Sender logs identify the exact event ID, signed-body hash, attempt, and callback status.
2. The platform records bind that accepted event to one actual run.
3. The parent model input includes the actual event result with the exact matching `data.article_id`.
4. The assistant reads that exact article, confirms authenticated ownership and the original workflow scope, and only then claims the authorized illustration work once.
5. Duplicate delivery, if tested separately under appropriate authorization, cannot start a second illustration operation.

An HTTP 2xx, a subscription-ready indicator, a manually processed screenshot article, or a passing mocked test alone is not single-event end-to-end acceptance. No live acceptance event has been sent by this candidate.

## Verification

Passed:

- `npm run build`
- Focused strict TypeScript check of `lib/events.ts` and its Worker environment dependencies
- `tests/event-transport-diagnostics.mjs`
- `tests/events-safety.mjs`
- `tests/mcp-contract.mjs`
- `tests/article-tools.mjs`
- `tests/article-state-transitions.mjs`
- `tests/article-claim-recovery.mjs` (15 groups)
- Optional baseline/candidate differential over 9 callback outcomes: exact payload bytes, signed-header contract, destination, send/retry counts and return state unchanged

Limits:

- Whole-project `tsc --noEmit --incremental false` was killed by the execution environment; no full-project type-check pass is claimed.
- Focused ESLint fails on the same 9 existing `no-explicit-any` findings in baseline and candidate. The new test and diagnostic helper introduce no new findings.
- Tests use mocked network/storage and no live article sends, provider calls, production claims, subscription writes, or publication.
- Candidate is unpublished. The original checkout remained clean during this investigation.
