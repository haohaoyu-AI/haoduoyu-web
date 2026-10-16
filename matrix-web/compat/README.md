# Isolated Worker / D1 feasibility probe

This directory is a local test harness, not the new application or a Sites
deployment. It has no project ID, hosting manifest, Wrangler account/database ID,
publish command, real administrator, or persistent user credential.

From this directory, with Node 24:

```bash
npm --cache /tmp/haoduoyu-npm-cache ci --ignore-scripts --no-audit --no-fund
npm test
```

To retain a fresh, credential-free evidence file and TAP output:

```bash
set -o pipefail
PROBE_EVIDENCE_PATH=/tmp/haoduoyu-probe-results.json \
  node --test --test-reporter=tap probe.test.mjs \
  2>&1 | tee /tmp/haoduoyu-worker-d1.tap
```

The lockfile pins Miniflare 4.20260730.0, workerd 1.20260730.1 and esbuild
0.28.2. The runtime uses compatibility date 2026-07-30 and `nodejs_compat`.
No Cloudflare login, Wrangler deployment, Sites source credential, or production
service is needed. External Worker fetches are rejected by `outboundService`.

The harness opens the existing `src/db.mjs` schema in Node `:memory:`, extracts
only its 15 DDL objects, prefixes their identifiers with `matrix_`, and applies
each statement to an ephemeral Miniflare D1 binding. It does **not** copy rows.
Miniflare uses temporary storage with `d1Persist:false`, then `dispose()` removes
the runtime. This is temporary local storage, not a production D1 database or
a claim that no temporary SQLite file is ever created. Synthetic random passwords,
password hashes and cookies exist only in the running test and temporary fixtures;
they are excluded from retained evidence. The Node tests also use isolated data.

`worker.mjs` directly imports the existing password hash/verification functions.
Its small session and article handlers demonstrate D1 transaction patterns, not
production parity. `/__probe/*` is a fixture-only test surface; it must never be
copied into a deployed application. A harness flag and `.invalid` hostname gate
the entire probe. These gates are accident prevention, not production security.

The probe deliberately omits UI, scoped Bearer keys, rate limiting, complete input
validation, full method routing, production bootstrap, backup/restore and all
business handlers. It does not replace the original constant-time CSRF comparison
or its other security checks. Those must be retained during a real port. In
particular, production writes need current authorization and account checks inside
their atomic SQL operation, not only a session lookup before an `await`.

For atomic writes, the receipt is inserted first and the business/audit statements
follow in one `batch()`. After a uniqueness failure, a committed matching receipt
can be replayed; changed request content conflicts. A failed unrelated constraint
must leave no receipt. Compare-and-swap operations use a probe-only CHECK table
to make a zero-row update abort the batch. The assertion table is a feasibility
technique, not a finalized production schema or error-classification design.

The schema-copy mechanism and fault-injection triggers are only test setup. A real
Sites port needs reviewed, schema-only migrations through its supported build
workflow. The checks do not verify production Sites dispatch, browser cookie
delivery, live D1 replicas, hosted resource quotas or a deployable Sites artifact.

See [the dated report](../docs/WORKER-D1-FEASIBILITY-2026-10-16.md) and its raw
evidence for outcomes, limitations and the smallest next implementation scope.
