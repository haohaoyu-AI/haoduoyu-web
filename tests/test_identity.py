"""Read-only article identity migration analysis tests."""

import copy
import hashlib
import io
import json
import re
import tempfile
import unittest
import uuid
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from article_hub import identity
from article_hub import __main__ as hub_main


UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)


def fp(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def tree_snapshot(root: Path) -> dict[str, tuple]:
    snapshot: dict[str, tuple] = {}
    for path in [root, *sorted(root.rglob("*"))]:
        name = "." if path == root else path.relative_to(root).as_posix()
        if path.is_dir():
            snapshot[name] = ("directory", path.stat().st_mtime_ns)
        else:
            snapshot[name] = ("file", path.read_bytes(), path.stat().st_mtime_ns)
    return snapshot


class IdentityMigrationTests(unittest.TestCase):
    def test_uuidv5_proposal_is_repeatable_normalized_and_strict(self):
        first = identity.proposed_article_id("Folder/主题甲", fp("one"))
        self.assertEqual(first, identity.proposed_article_id("folder\\主题甲", fp("one").upper()))
        self.assertEqual(
            identity.proposed_article_id("folder/name. ", fp("trimmed")),
            identity.proposed_article_id("FOLDER/name", fp("trimmed")),
        )
        self.assertNotEqual(first, identity.proposed_article_id("Folder/主题乙", fp("one")))
        self.assertNotEqual(first, identity.proposed_article_id("Folder/主题甲", fp("two")))
        self.assertEqual(uuid.UUID(first).version, 5)
        with self.assertRaises(ValueError):
            identity.proposed_article_id("主题甲", "not-sha256")

    def test_dry_run_is_pure_and_existing_id_is_never_recomputed(self):
        existing = str(uuid.uuid4())
        ledger = {"文章": {
            "旧文": {"标题": "旧文", "指纹": fp("old"), "文章ID": existing},
            "新文": {"标题": "新文", "指纹": fp("new")},
        }}
        before = copy.deepcopy(ledger)

        report = identity.analyze_identity_migration(ledger)

        self.assertEqual(ledger, before)
        self.assertEqual(report["已迁移"], 1)
        self.assertEqual(report["缺失ID"], 1)
        self.assertEqual(report["可迁移"], 1)
        self.assertNotIn("旧文", report["建议ID"])
        self.assertIn("新文", report["建议ID"])

    def test_duplicate_title_and_fingerprint_are_ambiguous(self):
        shared = fp("shared")
        ledger = {"文章": {
            "主题甲": {"标题": "相 同 标题", "指纹": shared},
            "主题乙": {"标题": "相同标题", "指纹": shared.upper()},
            "主题丙": {"标题": "唯一", "指纹": fp("unique")},
        }}

        report = identity.analyze_identity_migration(ledger)

        self.assertEqual(report["记录数"], 3)
        self.assertEqual(report["可迁移"], 1)
        self.assertEqual(report["有歧义"], 2)
        self.assertEqual(set(report["建议ID"]), {"主题丙"})
        self.assertEqual({item["类型"] for item in report["歧义项"]},
                         {"重复标题", "重复指纹"})

    def test_missing_and_invalid_fields_fail_closed_but_missing_id_only_counts(self):
        shared = str(uuid.uuid4())
        ledger = {"文章": {
            "缺指纹": {"标题": "甲", "指纹": None},
            "坏指纹": {"标题": "乙", "指纹": "a" * 63},
            "缺标题": {"标题": " ", "指纹": fp("three")},
            "坏标题": {"标题": 42, "指纹": fp("four")},
            "坏ID": {"标题": "戊", "指纹": fp("five"), "文章ID": "not-a-uuid"},
            "空白ID": {"标题": "空白", "指纹": fp("blank-id"), "文章ID": " "},
            "重复一": {"标题": "己", "指纹": fp("six"), "文章ID": shared},
            "重复二": {"标题": "庚", "指纹": fp("seven"), "文章ID": shared},
            "仅缺ID": {"标题": "辛", "指纹": fp("eight")},
        }}

        report = identity.analyze_identity_migration(ledger)
        kinds = {item["类型"] for item in report["歧义项"]}

        self.assertEqual(report["可迁移"], 1)
        self.assertEqual(set(report["建议ID"]), {"仅缺ID"})
        self.assertEqual(report["缺失ID"], 5)
        self.assertTrue({"缺失指纹", "非法指纹", "缺失标题", "非法标题",
                         "非法文章ID", "重复文章ID"}.issubset(kinds))

    def test_invalid_record_and_non_string_topic_never_crash(self):
        ledger = {"文章": {
            1: {"标题": "数字主题", "指纹": fp("one")},
            "坏记录": [],
        }}
        scanned = [{"主题": "1", "指纹": fp("one")},
                   {"主题": "坏记录", "指纹": fp("two")}]

        report = identity.analyze_identity_migration(ledger, scanned)

        self.assertEqual(report["可迁移"], 0)
        self.assertEqual(report["有歧义"], 2)
        self.assertIn("非法主题", {item["类型"] for item in report["歧义项"]})
        self.assertIn("无效记录", {item["类型"] for item in report["歧义项"]})

    def test_unicode_trailing_dot_space_equivalents_and_traversal_are_blocked(self):
        ledger = {"文章": {
            "Caf\u00e9/Topic": {"标题": "甲", "指纹": fp("one")},
            "Cafe\u0301\\topic": {"标题": "乙", "指纹": fp("two")},
            "folder/name.": {"标题": "丙", "指纹": fp("three")},
            "folder/name": {"标题": "丁", "指纹": fp("four")},
            "folder/trailing ": {"标题": "戊", "指纹": fp("five")},
            "folder/trailing": {"标题": "己", "指纹": fp("six")},
            "folder/../name": {"标题": "庚", "指纹": fp("seven")},
        }}

        report = identity.analyze_identity_migration(ledger)
        kinds = {item["类型"] for item in report["歧义项"]}

        self.assertEqual(report["可迁移"], 0)
        self.assertEqual(report["有歧义"], 7)
        self.assertIn("重复主题", kinds)
        self.assertIn("可疑主题路径", kinds)

    def test_historical_punctuation_urls_and_reserved_names_are_valid_topics(self):
        ledger = {"文章": {
            "历史标题:为什么?可以": {"标题": "甲", "指纹": fp("punctuation")},
            "https://example.com/a?x=1:y": {"标题": "乙", "指纹": fp("url")},
            "CON": {"标题": "丙", "指纹": fp("reserved")},
        }}

        report = identity.analyze_identity_migration(ledger)

        self.assertEqual(report["阻断数"], 0)
        self.assertEqual(report["有歧义"], 0)
        self.assertEqual(report["可迁移"], 3)
        self.assertEqual(set(report["建议ID"]), set(ledger["文章"]))

    def test_scan_duplicates_missing_values_and_only_unique_matches_are_checked(self):
        ledger = {"文章": {
            "Folder/Topic": {"标题": "文章", "指纹": fp("ledger")},
            "另一个": {"标题": "另文", "指纹": fp("other")},
        }}
        scanned = [
            {"主题": "folder\\topic", "指纹": fp("first")},
            {"主题": "FOLDER/Topic", "指纹": fp("second")},
            {"主题": "新增一", "指纹": fp("duplicate-scan")},
            {"主题": "新增二", "指纹": fp("duplicate-scan")},
            {"主题": None, "指纹": fp("none-topic")},
            {"主题": "另一个", "指纹": None},
        ]

        report = identity.analyze_identity_migration(ledger, scanned)
        kinds = {item["类型"] for item in report["歧义项"]}

        self.assertIn("扫描重复主题", kinds)
        self.assertIn("扫描重复指纹", kinds)
        self.assertIn("扫描缺失主题", kinds)
        self.assertIn("扫描缺失指纹", kinds)
        self.assertNotIn("扫描指纹不一致", kinds)
        self.assertEqual(report["可迁移"], 0)

    def test_scan_relationship_reports_one_to_one_mismatch_without_inventing_match(self):
        ledger = {"文章": {
            "历史": {"标题": "历史", "指纹": fp("old")},
            "变化": {"标题": "变化", "指纹": fp("before")},
        }}
        scanned = [
            {"主题": "变化", "指纹": fp("after")},
            {"主题": "新增", "指纹": fp("new")},
        ]

        report = identity.analyze_identity_migration(ledger, scanned)

        self.assertEqual(report["扫描核对"]["历史记录未在当前成稿中"], ["历史"])
        self.assertEqual(report["扫描核对"]["当前成稿未在台账中"], ["新增"])
        self.assertEqual(report["扫描核对"]["指纹不一致"], ["变化"])
        self.assertIn("历史", report["建议ID"])
        self.assertNotIn("变化", report["建议ID"])

    def test_render_uses_only_opaque_refs_and_never_outputs_topic_control_or_uuid(self):
        secret = "\x1b[31mSECRET\nTOPIC"
        report = identity.analyze_identity_migration({"文章": {
            secret: {"标题": "标题", "指纹": fp("secret")},
            "正常主题": {"标题": "正常", "指纹": fp("normal")},
        }})

        rendered = identity.render_identity_report(report)

        self.assertNotIn("SECRET", rendered)
        self.assertNotIn("TOPIC", rendered)
        self.assertNotIn("\x1b", rendered)
        self.assertIsNone(UUID_RE.search(rendered))
        for proposed in report["建议ID"].values():
            self.assertNotIn(proposed, rendered)
        self.assertRegex(rendered, r"#[0-9a-f]{12}")

    def test_cli_reads_existing_tree_without_creating_or_touching_any_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data = root / "data"
            formatted = root / "已排版文章"
            data.mkdir()
            formatted.mkdir()
            ledger_path = data / "库.json"
            ledger_path.write_text(json.dumps({"文章": {
                "历史主题": {"标题": "标题", "指纹": fp("article")},
            }}, ensure_ascii=False) + "\n", encoding="utf-8")
            before = tree_snapshot(root)
            output = io.StringIO()

            with patch.multiple(
                hub_main.config,
                ROOT=root,
                DATA=data,
                FORMATTED=formatted,
                UNFORMATTED=root / "未排版文章",
                PREVIEW=root / "预览",
            ), patch.object(hub_main.library, "LEDGER", ledger_path), redirect_stdout(output):
                code = hub_main.main(["identity-check"])

            self.assertEqual(code, 0)
            self.assertEqual(tree_snapshot(root), before)
            self.assertFalse((data / "库.json.lock").exists())
            self.assertIsNone(UUID_RE.search(output.getvalue()))

    def test_cli_missing_tree_stays_missing_and_returns_clean_empty_report(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data = root / "missing" / "data"
            formatted = root / "missing" / "formatted"
            ledger_path = data / "库.json"
            before = tree_snapshot(root)
            output = io.StringIO()

            with patch.multiple(
                hub_main.config,
                ROOT=root / "missing",
                DATA=data,
                FORMATTED=formatted,
                UNFORMATTED=root / "missing" / "unformatted",
                PREVIEW=root / "missing" / "preview",
            ), patch.object(hub_main.library, "LEDGER", ledger_path), redirect_stdout(output):
                code = hub_main.main(["身份检查"])

            self.assertEqual(code, 0)
            self.assertEqual(tree_snapshot(root), before)
            self.assertFalse((root / "missing").exists())
            self.assertIn("记录 0", output.getvalue())

    def test_cli_returns_one_for_blocker_without_printing_sensitive_values(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data = root / "data"
            formatted = root / "formatted"
            data.mkdir()
            formatted.mkdir()
            ledger_path = data / "库.json"
            ledger_path.write_text(json.dumps({"文章": {
                "敏感主题": {"标题": "标题", "指纹": "bad"},
            }}, ensure_ascii=False), encoding="utf-8")
            output = io.StringIO()

            with patch.multiple(
                hub_main.config,
                ROOT=root,
                DATA=data,
                FORMATTED=formatted,
                UNFORMATTED=root / "unformatted",
                PREVIEW=root / "preview",
            ), patch.object(hub_main.library, "LEDGER", ledger_path), redirect_stdout(output):
                code = hub_main.main(["identity-check"])

            self.assertEqual(code, 1)
            self.assertNotIn("敏感主题", output.getvalue())
            self.assertIsNone(UUID_RE.search(output.getvalue()))


if __name__ == "__main__":
    unittest.main()
