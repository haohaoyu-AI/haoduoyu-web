"""Compare saved offline V84 outputs and SQL/inspection reports, without Node."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("baseline_report", type=Path)
parser.add_argument("candidate_report", type=Path)
parser.add_argument("baseline_outputs", type=Path)
parser.add_argument("candidate_outputs", type=Path)
parser.add_argument("--output", type=Path)
args = parser.parse_args()
baseline = json.loads(args.baseline_report.read_text())
candidate = json.loads(args.candidate_report.read_text())
before = json.loads(args.baseline_outputs.read_text())
after = json.loads(args.candidate_outputs.read_text())
assert baseline["fixture_sha256"] == candidate["fixture_sha256"]
assert not baseline["failures"], baseline["failures"]
assert not candidate["failures"], candidate["failures"]
assert before == after, "Full returned content or safety information changed"

def observations(report):
    return {item["name"]: item for item in report["observations"]}

base_cases = observations(baseline)
next_cases = observations(candidate)
assert set(base_cases) <= set(next_cases), "A baseline safety case was omitted"
for name in base_cases:
    assert base_cases[name]["passed"] and next_cases[name]["passed"]
    for key in ["credential_race_executed", "stale_scope_rejected", "claim_denied",
                "history_accepted", "frozen_field_tamper_denied", "live_claim_gate_denied",
                "read_only_rows_unchanged", "owner_denial"]:
        assert base_cases[name].get(key) == next_cases[name].get(key), (name, key)

phases = {}
for name in base_cases:
    if not name.startswith("performance "):
        continue
    old, new = base_cases[name], next_cases[name]
    phase = name.split()[1]
    old_sql, new_sql = old["sql"]["count"], new["sql"]["count"]
    assert new_sql < old_sql, (phase, "SQL queries did not decrease", old_sql, new_sql)
    old_pure = old["pure_and_context_calls"].get("credential-boundary.inspectCredentialValue", 0)
    new_pure = new["pure_and_context_calls"].get("credential-boundary.inspectCredentialValue", 0)
    assert new_pure <= old_pure, (phase, "Pure inspections increased", old_pure, new_pure)
    assert old["requests"] == new["requests"], "Full output hashes/bytes changed"
    phases[phase] = {
        "requests": len(old["requests"]),
        "sql_queries": {"baseline": old_sql, "candidate": new_sql,
                        "reduction_percent": round((1 - new_sql / old_sql) * 100, 2)},
        "sql_by_kind": {"baseline": old["sql"]["kinds"], "candidate": new["sql"]["kinds"]},
        "pure_inspection_calls": {"baseline": old_pure, "candidate": new_pure},
        "real_aes_gcm_decrypt_calls": {
            "baseline": old["pure_and_context_calls"].get("real_aes_gcm_decrypt", 0),
            "candidate": new["pure_and_context_calls"].get("real_aes_gcm_decrypt", 0),
        },
        "offline_elapsed_ms": {
            "baseline": old["offline_elapsed_ms"],
            "candidate": new["offline_elapsed_ms"],
            "reduction_percent": round((1 - new["offline_elapsed_ms"] / old["offline_elapsed_ms"]) * 100, 2),
            "qualification": "SQLite local runtime timing; does not represent production D1 latency",
        },
        "expected_synthetic_application_writes": old.get("expected_application_writes", 0),
        "all_counted_calls": {"baseline": old["pure_and_context_calls"], "candidate": new["pure_and_context_calls"]},
        "full_return_bytes_and_hashes": old["requests"],
        "full_content_and_safety_fields_equal": True,
    }
for report in [baseline, candidate]:
    for key in ["real_network_calls", "provider_calls", "event_calls", "bucket_puts"]:
        assert report["totals"][key] == 0
    assert report["totals"]["writes"] == report["totals"]["expected_application_writes"]
comparison = {
    "passed": True,
    "qualification": candidate["qualification"],
    "fixture_sha256": candidate["fixture_sha256"],
    "shared_cases": len(base_cases),
    "shared_safety_cases": sum(not name.startswith("performance ") for name in base_cases),
    "candidate_only_cases": sorted(set(next_cases) - set(base_cases)),
    "phases": phases,
    "all_full_output_content_equal": True,
    "baseline_source_hashes": baseline["source_hashes"],
    "candidate_source_hashes": candidate["source_hashes"],
    "report_sha256": {"baseline": hashlib.sha256(args.baseline_report.read_bytes()).hexdigest(),
                      "candidate": hashlib.sha256(args.candidate_report.read_bytes()).hexdigest()},
}
rendered = json.dumps(comparison, ensure_ascii=False, indent=2)
if args.output:
    args.output.write_text(rendered + "\n")
print(rendered)
