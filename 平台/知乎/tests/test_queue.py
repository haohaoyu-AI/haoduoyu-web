"""Data-integrity checks at the local queue / remote-save boundary."""

from contextlib import contextmanager
from dataclasses import replace
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, patch

from zhihu_drafts.articles import load_article
from zhihu_drafts.queue import DraftQueue
from zhihu_drafts.__main__ import run


DRAFT_URL = "https://zhuanlan.zhihu.com/p/123456789/edit"


class QueueIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.queue = DraftQueue(self.root)
        self.args = SimpleNamespace(limit=0, interval=5, cdp=None)

    def tearDown(self):
        self.queue.close()
        self.temp.cleanup()

    def article(self, filename="article.txt", body="标题：同一篇文章\n第一段正文。\n第二段正文。"):
        path = self.queue.pending / filename
        path.write_text(body, encoding="utf-8")
        return load_article(path)

    def reopen_queue(self):
        self.queue.close()
        self.queue = DraftQueue(self.root)

    def legacy_records(self, entries):
        """Create the pre-digest schema inside this test's temporary directory."""
        self.queue.db.execute('DROP TABLE drafts')
        self.queue.db.execute('''CREATE TABLE drafts (
            fingerprint TEXT PRIMARY KEY, title TEXT NOT NULL,
            status TEXT NOT NULL, draft_url TEXT, source TEXT,
            error TEXT, evidence TEXT, updated_at TEXT NOT NULL)''')
        for article, status in entries:
            self.queue.db.execute('INSERT INTO drafts VALUES (?,?,?,?,?,?,?,?)', (
                article.fingerprint, article.title, status, DRAFT_URL,
                str(article.source.relative_to(self.root)), None, "历史验证", "2026-01-01T00:00:00+00:00"))
        self.queue.db.commit()
        self.reopen_queue()

    @contextmanager
    def browser(self, save=None):
        browser = MagicMock()
        browser.__enter__.return_value = browser
        factory = Mock(return_value=browser)

        def successful_save(article, resume_url, on_created, reset_editor=False):
            on_created(DRAFT_URL)
            return DRAFT_URL

        browser.save_draft.side_effect = save or successful_save
        module = SimpleNamespace(ZhihuBrowser=factory)
        with patch.dict(sys.modules, {"zhihu_drafts.browser": module}), \
                patch("zhihu_drafts.__main__.time.sleep"), patch("builtins.print"):
            yield browser, factory

    def test_upload_intent_is_durable_and_content_duplicates_share_one_record(self):
        one = self.article("one.txt")
        two = self.article("two.txt")
        self.queue.begin(one)
        self.queue.begin(two)
        self.reopen_queue()
        self.assertEqual(len(self.queue.records()), 1)
        self.assertEqual(self.queue.get(one.fingerprint)["status"], "uploading")
        self.assertEqual(self.queue.get(one.fingerprint)["source_digest"], one.source_digest)
        self.assertTrue(one.source.exists())
        self.assertTrue(two.source.exists())

    def test_unverified_and_failed_uploads_cannot_move_originals(self):
        article = self.article()
        original = article.source.read_bytes()
        with self.assertRaises(RuntimeError):
            self.queue.archive(article)
        self.queue.begin(article)
        self.queue.failed(article.fingerprint, "网页保存失败")
        with self.assertRaises(RuntimeError):
            self.queue.archive(article)
        self.assertEqual(article.source.read_bytes(), original)
        self.assertEqual(list(self.queue.sent.iterdir()), [])

    def test_verified_original_and_duplicate_archive_without_overwriting(self):
        original = self.article("one.txt")
        duplicate = self.article("two.txt")
        expected = original.source.read_bytes()
        self.queue.verified(original, DRAFT_URL)
        first = self.queue.archive(original)
        second = self.queue.archive(duplicate)
        self.assertEqual(first.parent, self.queue.sent)
        self.assertEqual(second.parent, self.queue.duplicates)
        self.assertEqual(first.read_bytes(), expected)
        self.assertEqual(second.read_bytes(), expected)
        self.assertFalse(original.source.exists())
        self.assertFalse(duplicate.source.exists())
        self.assertEqual(len(self.queue.records()), 1)
        self.assertEqual(self.queue.get(original.fingerprint)["status"], "archived")
        receipt = json.loads((self.queue.data / (original.fingerprint + ".json")).read_text(encoding="utf-8"))
        self.assertEqual(receipt["draft_url"], DRAFT_URL)
        self.assertEqual(receipt["source_digest"], original.source_digest)
        self.assertIs(receipt["publicly_published"], False)

    def test_modifying_source_after_upload_prevents_archiving_changed_content(self):
        article = self.article()
        self.queue.verified(article, DRAFT_URL)
        article.source.write_text("标题：同一篇文章\n用户新增了一段。", encoding="utf-8")
        new_bytes = article.source.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "修改"):
            self.queue.archive(article)
        self.assertEqual(article.source.read_bytes(), new_bytes)
        self.assertEqual(list(self.queue.sent.iterdir()), [])

    def test_format_only_changes_after_upload_are_kept_in_pending(self):
        for new_body in ("# 标题\n**正文**", "# 标题\n## 正文"):
            with self.subTest(new_body=new_body):
                article = self.article("format.md", "# 标题\n正文")
                self.queue.verified(article, DRAFT_URL)
                article.source.write_text(new_body, encoding="utf-8")
                changed = load_article(article.source)
                self.assertEqual(changed.fingerprint, article.fingerprint)
                with self.assertRaisesRegex(RuntimeError, "修改"):
                    self.queue.archive(article)
                self.assertEqual(article.source.read_text(encoding="utf-8"), new_body)
                self.assertEqual(list(self.queue.sent.iterdir()), [])

    def test_missing_source_digest_cannot_bypass_source_verification(self):
        article = self.article()
        self.queue.verified(article, DRAFT_URL)
        with self.assertRaisesRegex(RuntimeError, "校验摘要"):
            self.queue.archive(replace(article, source_digest=""))
        self.assertTrue(article.source.exists())

    def test_format_change_after_process_restart_blocks_verify_and_archive(self):
        script = """from pathlib import Path
import sys
from zhihu_drafts.articles import load_article
from zhihu_drafts.queue import DraftQueue
queue = DraftQueue(Path(sys.argv[1]))
try:
    article = load_article(queue.pending / sys.argv[2])
    if sys.argv[3] == 'verified':
        queue.verified(article, sys.argv[4])
    else:
        queue.archive(article)
except RuntimeError as exc:
    print(exc)
    sys.exit(23)
finally:
    queue.close()
"""
        for method in ("verified", "archive"):
            with self.subTest(method=method):
                title = f"标题 {method}"
                article = self.article(f"{method}.md", f"# {title}\n正文")
                if method == "archive":
                    self.queue.verified(article, DRAFT_URL)
                else:
                    self.queue.begin(article)
                    self.queue.created(article.fingerprint, DRAFT_URL)
                    self.queue.failed(article.fingerprint, "中途退出")
                previous = self.queue.get(article.fingerprint)
                article.source.write_text(f"# {title}\n**正文**", encoding="utf-8")
                self.assertEqual(load_article(article.source).fingerprint, article.fingerprint)
                process = subprocess.run(
                    [sys.executable, "-X", "utf8", "-c", script, str(self.root),
                     article.source.name, method, DRAFT_URL],
                    cwd=Path(__file__).resolve().parents[1], capture_output=True,
                    text=True, encoding="utf-8", timeout=20,
                )
                self.assertEqual(process.returncode, 23, process.stdout + process.stderr)
                self.assertIn("修改", process.stdout)
                self.assertEqual(self.queue.get(article.fingerprint), previous)
                self.assertTrue(article.source.exists())
        self.assertEqual(list(self.queue.sent.iterdir()), [])

    def test_other_path_content_duplicate_can_use_different_formatting(self):
        original = self.article("original.md", "# 标题\n正文")
        duplicate = self.article("copy.md", "# 标题\n**正文**")
        self.assertEqual(original.fingerprint, duplicate.fingerprint)
        self.assertNotEqual(original.source_digest, duplicate.source_digest)
        self.queue.verified(original, DRAFT_URL)
        self.reopen_queue()
        self.queue.verified(duplicate, DRAFT_URL)
        target = self.queue.archive(duplicate)
        self.assertEqual(target.parent, self.queue.duplicates)
        self.assertTrue(original.source.exists())
        self.assertEqual(self.queue.get(original.fingerprint)["source_digest"], original.source_digest)

    def test_legacy_archived_records_migrate_without_blocking_duplicates(self):
        one = self.article("one.txt", "标题：第一篇\n正文一")
        two = self.article("two.txt", "标题：第二篇\n正文二")
        self.legacy_records([(one, "archived"), (two, "archived")])
        self.assertEqual(len(self.queue.records()), 2)
        for article in (one, two):
            record = self.queue.get(article.fingerprint)
            self.assertIsNone(record["source_digest"])
            self.assertEqual(record["status"], "archived")
            self.assertEqual(record["draft_url"], DRAFT_URL)
            self.assertEqual(self.queue.archive(article).parent, self.queue.duplicates)

    def test_legacy_unarchived_record_requires_manual_review(self):
        article = self.article()
        self.legacy_records([(article, "verified")])
        for action in (lambda: self.queue.verified(article, DRAFT_URL), lambda: self.queue.archive(article)):
            with self.assertRaisesRegex(RuntimeError, "人工核对"):
                action()
        self.assertTrue(article.source.exists())
        self.assertEqual(self.queue.get(article.fingerprint)["status"], "verified")

    def test_archive_name_collision_preserves_both_files(self):
        article = self.article()
        pending_bytes = article.source.read_bytes()
        target = self.queue.sent / article.source.name
        target.write_bytes(b"existing unrelated original")
        self.queue.verified(article, DRAFT_URL)
        with self.assertRaises(FileExistsError):
            self.queue.archive(article)
        self.assertEqual(article.source.read_bytes(), pending_bytes)
        self.assertEqual(target.read_bytes(), b"existing unrelated original")

    def test_repeated_same_name_copies_use_unique_duplicate_names_without_browser(self):
        original = self.article()
        expected = original.source.read_bytes()
        self.queue.verified(original, DRAFT_URL)
        archived = self.queue.archive(original)
        unrelated = self.queue.duplicates / original.source.name
        unrelated.write_bytes(b"unrelated existing duplicate filename")
        for number in range(1, 4):
            original.source.write_bytes(expected)
            with self.browser() as (_, factory):
                run(self.queue, list(self.queue.articles()), self.args)
            factory.assert_not_called()
            target = self.queue.duplicates / f"article ({number}).txt"
            self.assertEqual(target.read_bytes(), expected)
            self.assertFalse(original.source.exists())
        self.assertEqual(archived.read_bytes(), expected)
        self.assertEqual(unrelated.read_bytes(), b"unrelated existing duplicate filename")
        self.assertEqual(len(self.queue.records()), 1)

    def test_verified_record_recovers_archiving_after_restart_without_browser(self):
        article = self.article()
        expected = article.source.read_bytes()
        self.queue.verified(article, DRAFT_URL)
        self.reopen_queue()
        with self.browser() as (_, factory):
            run(self.queue, list(self.queue.articles()), self.args)
        factory.assert_not_called()
        self.assertFalse(article.source.exists())
        self.assertEqual((self.queue.sent / article.source.name).read_bytes(), expected)
        self.assertEqual(self.queue.get(article.fingerprint)["status"], "archived")

    def test_known_draft_failure_keeps_source_and_retry_resumes_same_url(self):
        article = self.article()
        expected = article.source.read_bytes()

        def failed_save(article, resume_url, on_created, reset_editor=False):
            on_created(DRAFT_URL)
            raise RuntimeError("回读校验未通过")

        with self.browser(failed_save), self.assertRaisesRegex(RuntimeError, "回读"):
            run(self.queue, [article], self.args)
        self.assertEqual(article.source.read_bytes(), expected)
        record = self.queue.get(article.fingerprint)
        self.assertEqual(record["status"], "needs_review")
        self.assertEqual(record["draft_url"], DRAFT_URL)
        self.reopen_queue()
        with self.browser() as (browser, _):
            run(self.queue, list(self.queue.articles()), self.args)
        self.assertEqual(browser.save_draft.call_count, 1)
        self.assertEqual(browser.save_draft.call_args.kwargs["resume_url"], DRAFT_URL)
        self.assertEqual((self.queue.sent / article.source.name).read_bytes(), expected)

    def test_unknown_remote_result_blocks_new_draft_creation(self):
        article = self.article()
        self.queue.begin(article)
        self.queue.failed(article.fingerprint, "网络中断，未获得草稿地址")
        self.reopen_queue()
        with self.browser() as (browser, _), self.assertRaisesRegex(RuntimeError, "结果不明"):
            run(self.queue, list(self.queue.articles()), self.args)
        browser.save_draft.assert_not_called()
        self.assertTrue(article.source.exists())

    def test_archive_failure_retains_remote_verification_for_offline_recovery(self):
        article = self.article()
        expected = article.source.read_bytes()
        with self.browser() as (browser, _), \
                patch.object(self.queue, "move", side_effect=OSError("磁盘暂时不可写")), \
                self.assertRaisesRegex(OSError, "不可写"):
            run(self.queue, [article], self.args)
        self.assertEqual(browser.save_draft.call_count, 1)
        self.assertEqual(article.source.read_bytes(), expected)
        self.assertEqual(self.queue.get(article.fingerprint)["status"], "verified")
        self.reopen_queue()
        with self.browser() as (_, factory):
            run(self.queue, list(self.queue.articles()), self.args)
        factory.assert_not_called()
        self.assertEqual((self.queue.sent / article.source.name).read_bytes(), expected)

    def test_one_run_uploads_duplicate_content_only_once(self):
        self.article("one.txt")
        self.article("two.txt")
        with self.browser() as (browser, _):
            run(self.queue, list(self.queue.articles()), self.args)
        self.assertEqual(browser.save_draft.call_count, 1)
        self.assertEqual(len(list(self.queue.sent.iterdir())), 1)
        self.assertEqual(len(list(self.queue.duplicates.iterdir())), 1)
        self.assertEqual(list(self.queue.pending.iterdir()), [])

    def test_second_process_is_blocked_then_can_lock_after_release(self):
        script = """from pathlib import Path
import sys
from zhihu_drafts.queue import DraftQueue
queue = DraftQueue(Path(sys.argv[1]))
try:
    with queue.lock():
        pass
except (RuntimeError, OSError):
    sys.exit(23)
finally:
    queue.close()
"""

        def other_process():
            return subprocess.run(
                [sys.executable, "-X", "utf8", "-c", script, str(self.root)],
                cwd=Path(__file__).resolve().parents[1], capture_output=True,
                text=True, encoding="utf-8", timeout=20,
            )

        with self.queue.lock():
            blocked = other_process()
        self.assertEqual(blocked.returncode, 23, blocked.stderr)
        released = other_process()
        self.assertEqual(released.returncode, 0, released.stderr)


if __name__ == "__main__":
    unittest.main()
