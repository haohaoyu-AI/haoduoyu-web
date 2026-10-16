# Request cancellation and receipt persistence

This patch changes future request handling only. Existing requested receipt `496c9348-7de3-4322-8462-55892b8162b0` remains unchanged and cannot be retried, re-reserved or replaced.

A known aborted signal is checked on entry, after long preparation/live-configuration awaits and immediately before delegation consumption, reservation and provider dispatch. If cancellation wins before a write, no delegation or reservation is consumed. If cancellation races an already-issued atomic CAS, its durable consumption is preserved; no subsequent provider start is allowed. After a reservation exists, the real provider outcome must still be persisted even if the response stream has been canceled. Cancellation itself is not evidence that the call was free.

Receipt UPDATE exceptions, and the failed-attempt technical-terminal batch exceptions, produce only closed `receipt_persistence`/`stage_persistence` + `storage_error` diagnostics and a safe stage/hash log. The wire result stays unknown with `storage_pending`, and existing requested records stay intact. Transport exceptions use only `execution_unconfirmed` plus `request_cancelled` or `execution_error`. No exception message, response content, header, credential or provider thinking enters these diagnostics. Reads and repeated execution never repeat a model request.

The standard Cloudflare Vite source `compatibility_flags` explicitly adds `enable_request_signal`; the official runtime flag has no default enable date. Generated artifacts and hosting configuration are not edited. Request-signal, response-stream cancellation and enqueue failure have distinct closed log codes. Actual Site deployment flag propagation and disconnect notification still require a zero-provider acceptance test. This patch creates no queue or durable job, and `maxDuration` is not a platform guarantee.

The current POST performs two independent `/v1/models` checks before reservation (revision preparation and runtime preparation), and a third afterward before provider dispatch. Delegation consumption does not itself fetch models. Those checks and all complete input/receipt/report fences remain unchanged.

The observed client used a 450-second POST socket timeout and read until empty bytes. It had no 58/60-second exit rule; the missing terminal frame remains a real transport failure. No Transfer-Encoding, Content-Length or CF-Ray was captured, so the precise layer that produced the 58-second EOF remains unproved. A canceled Worker invocation and its wall duration cannot establish that the provider generated no article or incurred no charge.

References: [Cloudflare incoming Request.signal](https://developers.cloudflare.com/workers/runtime-apis/request/), [compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-requestsignal-for-incoming-requests), [Worker lifecycle limits](https://developers.cloudflare.com/workers/platform/limits/). HTTP while connected has no fixed wall-time limit; `waitUntil` is bounded after disconnect and does not create a durable model job.

A completed receipt followed by artifact recovery failure retains the existing `completed, saved:false` behavior. Content-invalid or stopped gates are not relabeled as storage errors. This patch does not claim to classify every recovery-stage persistence failure.
