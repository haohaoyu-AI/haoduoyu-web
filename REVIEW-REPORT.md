# Local integration review

## Changes in this stage only

- Added `article_hub/console_access.py` and `console_network.py` from the
  inspected network candidate.
- Added explicit HTTPS-origin/LAN-test CLI wiring to `__main__.py`; default
  console launch remains unchanged. Platform module locations now resolve
  relative to the project root instead of a fixed personal drive path.
- Integrated exact request-source validation, HTTPS `Secure` login/logout
  cookies, and exact-address HTTPS listener startup in `console.py`. Listener
  readiness checks bound socket/thread state only; it does not self-probe over
  HTTP, scan ports, fall back, or widen the peer allowlist.
- Retained staged business/UI source rather than replacing it with the older
  candidate copy. Strengthened `.gitignore`; sanitized personal paths and
  test-only email fixtures; updated migration and exclusion notes.

## Checks

- Python `ast.parse` on the four changed/added Python modules: passed.
- Offline pure-function smoke checks: canonical HTTPS origin, exact peer-IP
  allowlist, and private IPv4 validation: passed.
- `unittest` console/auth discovery: 62 tests run; 60 passed, one failed and
  one errored, both in image-clear behavior. Re-ran only those two cases in
  isolated copies of both the pre-merge snapshot and merged stage; the same
  failures occurred in both, so they predate this network merge. The failing
  assertions are recorded in `../haoduoyu-network-targeted-tests/RESULTS.md`.
- The environment's existing Python had no `pytest`; the initial pytest
  invocation stopped immediately with `No module named pytest`. No dependency
  was installed.
- No service was started, no real configuration or user data was read, and no
  external/network action was performed.
- The test-generated runtime configuration was moved outside this stage without
  reading its contents. No `.pyc` or cache directory was found in the stage.

## Remaining limits

Windows package/start/stop scripts and automated LAN restart launch were not
carried over. Linux/cloud portability and second-device acceptance remain
unverified. This is not an upload or deployment approval. `SOURCE-MANIFEST.json`
contains final per-file byte counts and SHA-256 values; its own hash is omitted.
