"""Durability and concurrency tests for the article ledger."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from article_hub import config, library, storage  # noqa: E402


class LedgerStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self._saved = (
            config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
            config.SETTINGS, config.PUBLISH_RULES, library.LEDGER,
        )
        config.UNFORMATTED = self.root / "未排版文章"
        config.FORMATTED = self.root / "已排版文章"
        config.PREVIEW = self.root / "预览"
        config.DATA = self.root / "data"
        config.SETTINGS = config.DATA / "平台设置.json"
        config.PUBLISH_RULES = config.DATA / "发布规则.json"
        library.LEDGER = config.DATA / "库.json"
        config.ensure_directories()
        config.SETTINGS.write_text("{}\n", encoding="utf-8")

    def tearDown(self):
        (
            config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
            config.SETTINGS, config.PUBLISH_RULES, library.LEDGER,
        ) = self._saved
        self.temp.cleanup()

    def test_only_a_missing_ledger_becomes_empty(self):
        self.assertEqual(library.load_ledger()["文章"], {})
        self.assertFalse(library.LEDGER.exists())

        library.LEDGER.write_text('{"文章": ', encoding="utf-8")
        with self.assertRaisesRegex(library.LedgerError, "JSON.*损坏"):
            library.load_ledger()

    def test_invalid_existing_structure_is_rejected(self):
        library.LEDGER.write_text('{"文章": []}\n', encoding="utf-8")
        with self.assertRaisesRegex(library.LedgerError, "结构无效"):
            library.load_ledger()

    def test_unreadable_existing_ledger_is_not_treated_as_empty(self):
        library.LEDGER.write_text('{"文章": {}}\n', encoding="utf-8")
        with patch.object(Path, "read_bytes", side_effect=PermissionError("denied")):
            with self.assertRaisesRegex(library.LedgerError, "无法读取台账.*denied"):
                library.load_ledger()

    def test_backup_is_the_last_valid_primary(self):
        first = {"文章": {"甲": {"标题": "第一版"}}}
        second = {"文章": {"甲": {"标题": "第二版"}}}
        library.save_ledger(first)
        backup = library.LEDGER.with_name(library.LEDGER.name + ".bak")
        self.assertFalse(backup.exists())

        library.save_ledger(second)
        self.assertEqual(json.loads(backup.read_text(encoding="utf-8"))["文章"]["甲"]["标题"], "第一版")
        self.assertEqual(library.load_ledger()["文章"]["甲"]["标题"], "第二版")

    def test_unchanged_receipt_sync_does_not_touch_primary_or_backup(self):
        stable = {"文章": {"甲": {"标题": "标题", "分发": {}, "已发": {}, "分发平台": []}}}
        library.save_ledger(stable)
        changed = library.load_ledger()
        changed["文章"]["甲"]["备注"] = "真正变化"
        library.save_ledger(changed)
        backup = storage.ledger_backup_paths(library.LEDGER)[0]
        before_primary = (library.LEDGER.read_bytes(), library.LEDGER.stat().st_mtime_ns)
        before_backup = (backup.read_bytes(), backup.stat().st_mtime_ns)

        library.sync_receipts()
        library.sync_receipts()

        self.assertEqual((library.LEDGER.read_bytes(), library.LEDGER.stat().st_mtime_ns),
                         before_primary)
        self.assertEqual((backup.read_bytes(), backup.stat().st_mtime_ns), before_backup)

    def test_read_only_sync_preserves_backup_before_bad_logical_mutation(self):
        good = {"文章": {"甲": {"标题": "正确标题", "分发": {}, "已发": {}, "分发平台": []}}}
        library.save_ledger(good)
        bad = library.load_ledger()
        bad["文章"]["甲"]["标题"] = "逻辑上错误但结构有效"
        library.save_ledger(bad)
        backup = storage.ledger_backup_paths(library.LEDGER)[0]
        good_backup = backup.read_bytes()
        bad_primary = library.LEDGER.read_bytes()

        library.sync_receipts()

        self.assertEqual(library.LEDGER.read_bytes(), bad_primary)
        self.assertEqual(backup.read_bytes(), good_backup)
        self.assertEqual(json.loads(good_backup)["文章"]["甲"]["标题"], "正确标题")

    def test_last_known_good_rotation_is_bounded(self):
        for version in range(5):
            library.save_ledger({"文章": {"甲": {"标题": f"版本{version}"}}})

        backups = storage.ledger_backup_paths(library.LEDGER)
        titles = [json.loads(path.read_text(encoding="utf-8"))["文章"]["甲"]["标题"]
                  for path in backups]
        self.assertEqual(titles, ["版本3", "版本2", "版本1"])
        self.assertEqual(len(list(config.DATA.glob("库.json.bak*"))), 3)
        self.assertFalse((config.DATA / "库.json.bak.3").exists())

    def test_invalid_primary_is_never_copied_to_backup_or_overwritten(self):
        bad = b'{"articles": "wrong shape"}\n'
        library.LEDGER.write_bytes(bad)
        with self.assertRaises(library.LedgerError):
            library.save_ledger({"文章": {}})
        self.assertEqual(library.LEDGER.read_bytes(), bad)
        self.assertFalse(library.LEDGER.with_name(library.LEDGER.name + ".bak").exists())

    def test_corrupt_primary_never_enters_existing_good_rotation(self):
        library.save_ledger({"文章": {"甲": {"标题": "版本0"}}})
        library.save_ledger({"文章": {"甲": {"标题": "版本1"}}})
        backup = storage.ledger_backup_paths(library.LEDGER)[0]
        old_backup = backup.read_bytes()
        corrupt = '{"文章": '.encode("utf-8")
        library.LEDGER.write_bytes(corrupt)

        with self.assertRaises(library.LedgerError):
            library.save_ledger({"文章": {"甲": {"标题": "版本2"}}})

        self.assertEqual(library.LEDGER.read_bytes(), corrupt)
        self.assertEqual(backup.read_bytes(), old_backup)
        self.assertFalse(storage.ledger_backup_paths(library.LEDGER)[1].exists())

    def test_repeated_primary_replace_failures_leave_all_history_exactly_unchanged(self):
        for version in range(4):
            library.save_ledger({"文章": {"甲": {"标题": f"版本{version}"}}})
        paths = [library.LEDGER, *storage.ledger_backup_paths(library.LEDGER)]
        before = {
            path: (path.read_bytes(), path.stat().st_mtime_ns)
            for path in paths
        }
        real_replace = os.replace

        def fail_primary(source, destination):
            if Path(destination) == library.LEDGER:
                raise OSError("injected replace failure")
            return real_replace(source, destination)

        with patch.object(storage.os, "replace", side_effect=fail_primary):
            for version in range(4, 7):
                with self.assertRaisesRegex(library.LedgerError, "原台账已保留"):
                    library.save_ledger({"文章": {"甲": {"标题": f"版本{version}"}}})
                self.assertEqual(
                    {
                        path: (path.read_bytes(), path.stat().st_mtime_ns)
                        for path in paths
                    },
                    before,
                )

        self.assertEqual(list(config.DATA.glob(".库.json.*.tmp")), [])
        self.assertEqual(list(config.DATA.glob(".*.rollback")), [])

        library.save_ledger({"文章": {"甲": {"标题": "版本7"}}})
        titles = [
            json.loads(path.read_text(encoding="utf-8"))["文章"]["甲"]["标题"]
            for path in [library.LEDGER, *storage.ledger_backup_paths(library.LEDGER)]
        ]
        self.assertEqual(titles, ["版本7", "版本3", "版本2", "版本1"])

    def test_backup_replace_failure_is_nonfatal_and_preserves_existing_history(self):
        for version in range(4):
            library.save_ledger({"文章": {"甲": {"标题": f"版本{version}"}}})
        backups = storage.ledger_backup_paths(library.LEDGER)
        old_history = {path: path.read_bytes() for path in backups}
        real_replace = os.replace

        def fail_newest_backup(source, destination):
            if Path(destination) == backups[0]:
                raise OSError("injected backup replace failure")
            return real_replace(source, destination)

        with patch.object(storage.os, "replace", side_effect=fail_newest_backup):
            with self.assertWarns(storage.LedgerBackupWarning):
                library.save_ledger({"文章": {"甲": {"标题": "版本4"}}})

        self.assertEqual(library.load_ledger()["文章"]["甲"]["标题"], "版本4")
        self.assertEqual({path: path.read_bytes() for path in backups}, old_history)
        self.assertEqual(list(config.DATA.glob(".库.json.*.tmp")), [])
        self.assertEqual(list(config.DATA.glob(".*.rollback")), [])

        library.save_ledger({"文章": {"甲": {"标题": "版本5"}}})
        titles = [
            json.loads(path.read_text(encoding="utf-8"))["文章"]["甲"]["标题"]
            for path in backups
        ]
        self.assertEqual(titles, ["版本4", "版本2", "版本1"])

    def test_concurrent_publish_transactions_do_not_lose_updates(self):
        library.save_ledger({"文章": {"主题": {"标题": "标题"}}})
        start = threading.Barrier(3)
        errors: list[BaseException] = []

        def publish(platform: str, when: str) -> None:
            try:
                start.wait()
                library.record_publish("主题", platform, when)
            except BaseException as exc:  # surfaced in the main test thread
                errors.append(exc)

        workers = [
            threading.Thread(target=publish, args=("今日头条", "2026-09-20 20:00")),
            threading.Thread(target=publish, args=("知乎", "2026-09-21 20:00")),
        ]
        for worker in workers:
            worker.start()
        start.wait()
        for worker in workers:
            worker.join(timeout=10)

        self.assertFalse(any(worker.is_alive() for worker in workers))
        self.assertEqual(errors, [])
        published = library.load_ledger()["文章"]["主题"]["发布"]
        self.assertEqual(published["今日头条"]["实际"], "2026-09-20T20:00")
        self.assertEqual(published["知乎"]["实际"], "2026-09-21T20:00")

    def test_public_transaction_commits_mutation_and_keeps_old_backup(self):
        library.save_ledger({"文章": {"主题": {"标题": "标题", "次数": 0}}})
        before = library.LEDGER.read_bytes()

        with library.ledger_transaction() as data:
            data["文章"]["主题"]["次数"] = 1

        self.assertEqual(library.load_ledger()["文章"]["主题"]["次数"], 1)
        backup = library.LEDGER.with_name(library.LEDGER.name + ".bak")
        self.assertEqual(backup.read_bytes(), before)

    def test_public_transaction_exception_does_not_save(self):
        library.save_ledger({"文章": {"主题": {"标题": "标题", "次数": 0}}})
        before = library.LEDGER.read_bytes()

        with self.assertRaisesRegex(RuntimeError, "rollback"):
            with library.ledger_transaction() as data:
                data["文章"]["主题"]["次数"] = 99
                raise RuntimeError("rollback")

        self.assertEqual(library.LEDGER.read_bytes(), before)
        self.assertFalse(library.LEDGER.with_name(library.LEDGER.name + ".bak").exists())

    def test_public_transaction_sync_also_refreshes(self):
        library.save_ledger({"文章": {}})
        with patch.object(library, "_merge_formatted_unlocked",
                          wraps=library._merge_formatted_unlocked) as merge, patch.object(
                              library, "_sync_receipts_into_unlocked",
                              wraps=library._sync_receipts_into_unlocked) as sync:
            with library.ledger_transaction(sync=True):
                pass
        merge.assert_called_once()
        sync.assert_called_once()

    def test_concurrent_public_transactions_do_not_lose_updates(self):
        library.save_ledger({"文章": {"主题": {"标题": "标题", "次数": 0}}})
        start = threading.Barrier(3)
        errors: list[BaseException] = []

        def increment() -> None:
            try:
                start.wait()
                with library.ledger_transaction() as data:
                    value = data["文章"]["主题"]["次数"]
                    time.sleep(0.05)
                    data["文章"]["主题"]["次数"] = value + 1
            except BaseException as exc:
                errors.append(exc)

        workers = [threading.Thread(target=increment) for _ in range(2)]
        for worker in workers:
            worker.start()
        start.wait()
        for worker in workers:
            worker.join(timeout=10)

        self.assertEqual(errors, [])
        self.assertFalse(any(worker.is_alive() for worker in workers))
        self.assertEqual(library.load_ledger()["文章"]["主题"]["次数"], 2)

    def test_cross_process_file_lock_serializes_updates(self):
        counter = self.root / "counter.txt"
        counter.write_text("0", encoding="ascii")
        ready = self.root / "ready"
        ready.mkdir()
        code = r'''
import sys, time
from pathlib import Path
from article_hub.storage import ledger_file_lock
ledger, counter, ready, worker = map(Path, sys.argv[1:])
(ready / worker.name).write_text("ready", encoding="ascii")
deadline = time.monotonic() + 10
while len(list(ready.iterdir())) < 2:
    if time.monotonic() > deadline:
        raise RuntimeError("worker rendezvous timed out")
    time.sleep(0.01)
with ledger_file_lock(ledger):
    value = int(counter.read_text(encoding="ascii"))
    time.sleep(0.15)
    counter.write_text(str(value + 1), encoding="ascii")
'''
        root = Path(__file__).resolve().parent.parent
        processes = [
            subprocess.Popen(
                [sys.executable, "-X", "utf8", "-c", code, str(library.LEDGER),
                 str(counter), str(ready), str(index)],
                cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            for index in range(2)
        ]
        failures = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=15)
            if process.returncode:
                failures.append((process.returncode, stdout, stderr))

        self.assertEqual(failures, [])
        self.assertEqual(counter.read_text(encoding="ascii"), "2")


if __name__ == "__main__":
    unittest.main()
