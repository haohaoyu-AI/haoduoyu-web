# Core performance observations

This is an explicit synthetic benchmark, excluded from the normal Core test project. It does not run as a PASS check, call production, load existing client data, show WPF, or measure Windows frame latency.

From the repository root, with the pinned .NET SDK:

```sh
dotnet run --project desktop/windows/Haoduoyu.Core.Tests/Performance/Haoduoyu.Core.Performance.csproj --configuration Release -- desktop/windows/artifacts/core-perf-latest.json
```

Without an output argument, the report goes to a new file in the system temporary directory. The benchmark generates 12,000 review articles, 120 detail copies, 1,500 daily todos, 1,000 notes and 25 synthetic drafts across 171 cache keys. The row count includes the detail copies. It warms each measurement and records three samples, process allocations and Gen2 collection counts. Source hashes identify the current Core files used by an after run. No timing threshold decides success.

The saved [before](observations/before-20261104.json) and [after](observations/after-20261104.json) reports were observed on the same Linux cloud environment. The earlier report was captured before the optimization without an exact source commit binding; its stated boundary is the former full JSON serialize/deserialize snapshot and default escaping writer. The current runnable project measures the current implementation. These reports are observations, not a Windows performance acceptance claim.

| Near-limit CJK scenario | Before | After |
| --- | ---: | ---: |
| Raw cached response bodies | 21.75 MiB | 21.75 MiB |
| Serialized workspace | 42.48 MiB | 22.14 MiB |
| Snapshot median | 229.73 ms | 0.0092 ms |
| Snapshot allocated bytes | 63,676,864 | 12,456 |
| Former two-snapshot + todo projection pattern, median | 537.25 ms | 84.03 ms |
| Current one-snapshot projection worker, wall median | Not observed | 84.68 ms |

The former two-snapshot measurement reproduces the old synchronous call pattern. The current UI captures one snapshot in asynchronous work, so that measurement is not a claim about the present UI. Worker wall time includes awaiting the worker in the console; it does not measure whether WPF remains responsive.

Projection still parses the full cache: the after CJK observation measured about 93 ms for todo projection and 151 ms for a review page, with about 64–83 MB allocated. Scheduling projection off the dispatcher remains necessary. JIT, GC and shared cloud CPU cause visible sample variation; small cross-run differences in the unchanged projection algorithm are not evidence of a speedup or regression.

The original CJK scenario was below the 24 MiB download limit but expanded beyond the unchanged 32 MiB workspace limit. The before probe exercised the actual product rejection before protection or a ciphertext write. The after encoding fits that check; the benchmark does not time a large DPAPI write. The revised encoder is used only for local encrypted JSON, never HTML, and the format/schema and size limit remain unchanged. The normal safety suite verifies prior escaped JSON readability, exact Unicode/HTML-character preservation and backup retention.

Structural copying detaches dictionaries, the outbox list and each dependency array. Strings and the current draft record fields are immutable. Adding a mutable model field requires updating that copy boundary and its isolation test.
