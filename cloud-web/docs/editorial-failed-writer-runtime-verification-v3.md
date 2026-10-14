# V83 offline runtime / owner MCP / private HTTP integration

`runtime-failed-writer-integration.mjs` uses the selected source checkout's real TypeScript runtime, generic failed-writer continuation, revision-history verifier, provider credential boundary, contract parser, owner MCP dispatcher and private cloud HTTP route. All hashes use real SHA-256.

The historical authority/configuration read is explicitly mocked, as is the fixed historical old-body continuation verifier. The generic module, runtime, new HTTP transport, and byte hashes are not mocked. Unrelated MCP tool families are stubbed and cannot execute. The test uses an in-memory SQLite D1-shaped adapter and a single-call mock provider. No external network or provider request is permitted. The paid gate is enabled only in the VM copy, never in source.

Required original fixtures in `/workspace/shared`:
- editorial-v81-original-revision-input.json
- editorial-v81-original-snapshot.json
- editorial-v81-body-input.json
- editorial-v81-body-receipt.json
- editorial-v81-history-projection.json

The exact historical authority frozen-bindings JSON must be supplied as `/workspace/shared/editorial-v83-original-authority-bindings.json` or via `TEST_V83_AUTHORITY_BINDINGS`. Its real SHA must equal the original snapshot's `bace6ba9732c17870751f87175e767f8f7d72b763a09dc6fc95d5196435d59ba`. No fabricated hash preimage is accepted.

Run only after the owner of the integration checkout declares source ready:

TEST_SOURCE=/path/to/integration-checkout node --max-old-space-size=192 --max-semi-space-size=4 runtime-failed-writer-integration.mjs

The script reconstructs the actual failed source 6506 with exact input SHA 9f8205996f71ba82fa75fbaffd74ef31d1d66c4616f5a41209aa609b05a79abd through the ordinary old-unknown continuation and its once-consumed HTTP execution. Thereafter it restores that verified fixture baseline for each case.

Output: `runtime-failed-writer-report.json` includes case results, exact source/fixture hashes, complete provider business payloads and their hashes, deadline evidence and peak RSS. Synthetic nonce hashes are recorded; plaintext nonces are not.

Copy the complete script into a candidate repository’s `tests/` directory. Its default source root is then the parent repository directory. `TEST_SOURCE`, `TEST_V81_FIXTURE_ROOT` and `TEST_V83_AUTHORITY_BINDINGS` remain supported. Use `--only "old496 legal failed"` (or `TEST_V83_FILTER`) for the corrected oracle’s focused rerun; the real baseline reconstruction still runs once. `TEST_V83_REPORT_FILE` can put the report outside the repository.

For a split continuation run after the preserved first-run stop, set `TEST_V83_CASE_AFTER` to the exact number of terminal first-run cases and `TEST_V83_REUSE_GRANTED_FIXTURE=1`. The script makes one real owner-authorized grant and delegation, hashes and saves the exact owned SQLite fixture, and restores it for transport/reservation negative cases. Allocation concurrency and the separately authorized second failure hop still use the normal owner APIs. The corrected latefailed oracle and strengthened latecompleted no-change oracle are included even when they precede the continuation boundary.

Four saved-artifact cases use one real completed writer receipt and genuine runtime-saved artifact, then preserve separate structure-review and independently verified snapshots. They corrupt unsafe, incomplete, protocol-code, or budget-cause diagnostics only in the owned offline receipt and test that next claim and final freeze reject with no writes, bucket put, provider request, or row changes.


## Verified split execution

- First run: 21 terminal cases, 20 PASS and 1 too-strict latefailed-recovery oracle; intentionally stopped with exit 130 after the parent requested splitting. The original log and script snapshot are preserved.
- Focused partial: 10/10 PASS, including corrected latefailed and strengthened latecompleted full-record no-change oracles. Intentionally stopped with exit 130 for the parent’s reservation-proof hardening.
- Final source focused: 18/18 PASS, exit 0, 278452 KB peak RSS, three offline provider mocks and zero real provider/network calls. Source hashes are in the report and verified unchanged throughout this run.
- There are 47 distinct cases with a latest PASS across these recorded runs. This is not a claim that all 47 ran together on the final source. A separate interrupted bootstrap had no case results and is not signoff evidence.

The final run can be reproduced from the exact previously owner-authorized fixture with:

TEST_SOURCE=/path/to/check-out TEST_V83_REUSE_GRANTED_FIXTURE=1 TEST_V83_GRANTED_FIXTURE=/path/to/runtime-failed-writer-granted-fixture.json TEST_V83_CASE_AFTER=29 TEST_V83_REPLAY_ANCESTORS=0 TEST_V83_REPORT_FILE=/tmp/v83-focused-report.json node --max-old-space-size=192 --max-semi-space-size=4 tests/editorial-v83-runtime-failed-writer.mjs

The fixture's SHA is e2af1928dad1fabd138e96714b1e8ff4bc323b1b235f3dee501e81d7e600e4ea. It is revalidated through the real normal-owner read and delegation replay on the selected source. Fixtures contain only synthetic owned SQLite records/nonces, not production credentials.

The complete provider business payload is preserved in the final report. Every mock invocation used the same real SHA c0055302b5e40fc55868bc2d670d0588c449f7f19afd5aff4b0273d780f38c69, buffered_v2 and the 900000 ms V3 provider deadline. No source input, prompt, model or token cap was shortened.

Profiling: the final run had no SQL run lasting at least 100 ms. The largest measured owner API phase was an independent review save at 8280 ms; repeated strict reads and owner phases account for the substantial total runtime. This is an offline measurement, not a production latency guarantee.
