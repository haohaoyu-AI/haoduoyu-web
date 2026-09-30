"""Draft orchestration tests: temp files and mocked platform senders only."""
import contextlib
import hashlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from article_hub import __main__ as hub_main
from article_hub import console, draft_flow


class QueueFixture:
    def __init__(self, root):
        self.root = root
        self.pending = root / "待发文章"
        self.pending.mkdir(exist_ok=True)
        self.records = {}
        self.archived = []

    def safe(self, path):
        path = path.resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError("outside queue")
        return path

    def get(self, fingerprint):
        return self.records.get(fingerprint)

    def archive(self, article):
        self.archived.append(article.title)
        article.source.rename(self.root / (article.source.stem + ".archived"))


def load_fixture(path):
    value = path.read_bytes()
    digest = hashlib.sha256(value).hexdigest()
    return SimpleNamespace(title=path.stem, source=path, source_digest=digest, fingerprint=digest)


def _digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


class DraftFlowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.queue = QueueFixture(self.root)
        self.source = self.root / "成稿.docx"
        self.source.write_bytes(b"article one")
        self.item = {"主题": "topic", "标题": "title", "成稿": self.source, "配图数": 3}
        self.data = {"文章": {"topic": {"标题": "title"}}}
        for obj, name, value in [
            (draft_flow.library, "sync_receipts", MagicMock(return_value=self.data)),
            (draft_flow.library, "ledger_transaction", lambda **_kwargs: contextlib.nullcontext(self.data)),
            (draft_flow.library, "scan_formatted", MagicMock(return_value=[self.item])),
            (draft_flow.library, "save_ledger", MagicMock()),
            (draft_flow, "_emit", MagicMock()),
        ]:
            mock = patch.object(obj, name, value)
            mock.start()
            self.addCleanup(mock.stop)

    def prepare(self, *, only=None):
        return draft_flow.prepare("今日头条", self.queue, load_fixture, only=only)

    def test_platform_choices_are_required_valid_and_deduplicated(self):
        self.assertEqual(draft_flow.selected_platforms("头条,知乎,今日头条"), ["今日头条", "知乎"])
        for value in ["", "微博", "知乎,unknown"]:
            with self.assertRaises(ValueError):
                draft_flow.selected_platforms(value)

    def test_new_article_is_staged_once_and_ledger_records_selected_platform(self):
        articles, issues = self.prepare()
        self.assertEqual(len(articles), 1)
        self.assertEqual(issues, [])
        self.assertEqual(set(self.data["文章"]["topic"]["分发"]), {"今日头条"})
        articles, issues = self.prepare()
        self.assertEqual(len(list(self.queue.pending.iterdir())), 1)
        self.assertEqual(len(articles), 1)
        self.assertEqual(issues, [])

    def test_distinct_topics_with_same_title_are_rejected_before_staging(self):
        other = self.root / "另一篇.docx"
        other.write_bytes(b"different article")
        self.data["文章"] = {
            "topic": {"标题": "重复 标题"},
            "other": {"标题": "重复标题"},
        }
        draft_flow.library.scan_formatted.return_value = [
            {**self.item, "标题": "重复 标题"},
            {"主题": "other", "标题": "重复标题", "成稿": other, "配图数": 3},
        ]

        with self.assertRaises(draft_flow.library.TitleCollisionError):
            self.prepare()

        self.assertEqual(list(self.queue.pending.iterdir()), [])
        draft_flow.library.save_ledger.assert_not_called()

    def test_already_saved_article_is_not_copied_again(self):
        article = load_fixture(self.source)
        self.queue.records[article.fingerprint] = {"status": "archived"}
        articles, issues = self.prepare()
        self.assertEqual((articles, issues), ([], []))
        self.assertEqual(list(self.queue.pending.iterdir()), [])

    def test_saved_pending_copy_is_archived_without_sending(self):
        pending = self.queue.pending / "title.docx"
        pending.write_bytes(self.source.read_bytes())
        self.queue.records[load_fixture(pending).fingerprint] = {"status": "verified"}
        articles, issues = self.prepare()
        self.assertEqual((articles, issues), ([], []))
        self.assertEqual(self.queue.archived, ["title"])

    def test_ambiguous_prior_attempt_is_not_resent(self):
        article = load_fixture(self.source)
        self.queue.records[article.fingerprint] = {"status": "needs_review", "draft_url": None}
        articles, issues = self.prepare()
        self.assertEqual(articles, [])
        self.assertIn("上次保存结果未确认", issues[0])
        self.assertFalse((self.queue.pending / "title.docx").exists())

    def test_platform_confirmed_preupload_failure_is_safe_to_retry(self):
        article = load_fixture(self.source)
        self.queue.records[article.fingerprint] = {
            "status": "needs_review", "draft_url": None,
            "error": "“插入”菜单里没有找到“导入文档”。",
            "source_digest": article.source_digest,
        }
        predicate = lambda record: "菜单里没有找到“导入文档”" in record["error"]

        articles, issues = draft_flow.prepare(
            "百家号", self.queue, load_fixture, retry_without_url=predicate
        )

        self.assertEqual(issues, [])
        self.assertEqual([item.title for item in articles], ["title"])
        self.assertEqual((self.queue.pending / "title.docx").read_bytes(), self.source.read_bytes())
        self.assertNotIn("unconfirmed", "\n".join(c.args[0] for c in draft_flow._emit.call_args_list))

    def test_retry_predicate_cannot_release_unknown_status(self):
        article = load_fixture(self.source)
        self.queue.records[article.fingerprint] = {
            "status": "uploading", "draft_url": None,
            "error": "“插入”菜单里没有找到“导入文档”。",
            "source_digest": article.source_digest,
        }

        articles, issues = draft_flow.prepare(
            "百家号", self.queue, load_fixture, retry_without_url=lambda _record: True
        )

        self.assertEqual(articles, [])
        self.assertIn("上次保存结果未确认", issues[0])
        self.assertFalse((self.queue.pending / "title.docx").exists())

    def test_preupload_retry_still_requires_the_original_source_digest(self):
        article = load_fixture(self.source)
        self.queue.records[article.fingerprint] = {
            "status": "needs_review", "draft_url": None,
            "error": "“插入”菜单里没有找到“导入文档”。",
            "source_digest": "different-version",
        }

        articles, issues = draft_flow.prepare(
            "百家号", self.queue, load_fixture, retry_without_url=lambda _record: True
        )

        self.assertEqual(articles, [])
        self.assertIn("上次上传后有改动", issues[0])

    def test_different_pending_version_is_not_replaced_or_sent(self):
        pending = self.queue.pending / "title.docx"
        pending.write_bytes(b"older manual edit")
        articles, issues = self.prepare()
        self.assertEqual(articles, [])
        self.assertIn("不同版本", issues[0])
        self.assertEqual(pending.read_bytes(), b"older manual edit")

    def test_unillustrated_articles_are_not_staged(self):
        self.item["配图数"] = 0
        self.assertEqual(self.prepare(), ([], []))

    def test_unfinished_review_blocks_new_staging_and_renamed_pending_copy(self):
        from article_hub import image_review
        folder = self.queue.pending / '人工调整目录'
        folder.mkdir()
        moved = folder / '重新命名.docx'
        moved.write_bytes(self.source.read_bytes())
        with patch.object(image_review, 'assert_ready_for_dispatch', side_effect=ValueError('请先重新生成成稿')):
            articles, issues = self.prepare()
        self.assertEqual(articles, [])
        self.assertFalse((self.queue.pending / 'title.docx').exists())
        self.assertEqual(moved.read_bytes(), self.source.read_bytes())
        self.assertTrue(all('重新生成成稿' in issue for issue in issues))

    def test_previously_dispatched_pending_copy_checks_exact_source_from_ledger(self):
        from article_hub import image_review
        pending = self.queue.pending / 'old-manual-name.docx'
        pending.write_bytes(b'previous pending copy')
        self.data['文章']['topic']['分发'] = {'今日头条': {
            '文件': str(pending), '成稿': str(self.source)}}
        draft_flow.library.scan_formatted.return_value = []
        with patch.object(image_review, 'assert_ready_for_dispatch', side_effect=ValueError('先完成配图审阅')) as guard:
            articles, issues = self.prepare()
        self.assertEqual(articles, [])
        guard.assert_called_once_with(self.source)
        self.assertIn('配图审阅', issues[0])
        self.assertTrue(pending.exists())

    def test_duplicate_pending_content_is_sent_only_once(self):
        (self.queue.pending / "copy.docx").write_bytes(self.source.read_bytes())
        articles, issues = self.prepare()
        self.assertEqual(len(articles), 1)
        self.assertEqual(issues, [])

    def test_nested_manual_article_is_included_and_sidecars_ignored(self):
        folder = self.queue.pending / '手工稿件'
        folder.mkdir()
        (folder / 'manual.docx').write_bytes(b'manual article')
        (folder / '配图来源.md').write_text('not an article')
        articles, issues = self.prepare()
        self.assertEqual(len(articles), 2)
        self.assertEqual(issues, [])

    def test_only_stages_selected_topic_and_excludes_other_pending_files(self):
        other_source = self.root / "另一篇.docx"
        other_source.write_bytes(b"article two")
        self.data["文章"]["other"] = {"标题": "other title"}
        draft_flow.library.scan_formatted.return_value = [
            self.item,
            {"主题": "other", "标题": "other title", "成稿": other_source, "配图数": 2},
        ]
        manual = self.queue.pending / "manual.docx"
        manual.write_bytes(b"unrelated manual draft")

        articles, issues = self.prepare(only="topic")

        self.assertEqual(issues, [])
        self.assertEqual([article.source_digest for article in articles], [_digest_bytes(b"article one")])
        self.assertTrue((self.queue.pending / "title.docx").exists())
        self.assertFalse((self.queue.pending / "other title.docx").exists())
        self.assertEqual(manual.read_bytes(), b"unrelated manual draft")

    def test_only_does_not_send_historical_version_of_selected_topic(self):
        historical = self.queue.pending / "old-title.docx"
        historical.write_bytes(b"old version of selected topic")

        articles, issues = self.prepare(only="topic")

        self.assertEqual(issues, [])
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0].source_digest, _digest_bytes(b"article one"))

    def test_ledger_commit_failure_removes_only_unchanged_file_created_by_prepare(self):
        @contextlib.contextmanager
        def failed_commit(**_kwargs):
            yield self.data
            raise RuntimeError("ledger commit failed")

        with patch.object(draft_flow.library, "ledger_transaction", failed_commit):
            with self.assertRaisesRegex(RuntimeError, "ledger commit failed"):
                self.prepare(only="topic")

        self.assertFalse((self.queue.pending / "title.docx").exists())

    def test_ledger_commit_failure_preserves_new_file_changed_by_another_actor(self):
        target = self.queue.pending / "title.docx"

        @contextlib.contextmanager
        def failed_commit(**_kwargs):
            yield self.data
            target.write_bytes(b"manual replacement")
            raise RuntimeError("ledger commit failed")

        with patch.object(draft_flow.library, "ledger_transaction", failed_commit):
            with self.assertRaisesRegex(RuntimeError, "ledger commit failed"):
                self.prepare(only="topic")

        self.assertEqual(target.read_bytes(), b"manual replacement")

    def test_ledger_commit_failure_never_removes_preexisting_pending_file(self):
        target = self.queue.pending / "title.docx"
        target.write_bytes(self.source.read_bytes())

        @contextlib.contextmanager
        def failed_commit(**_kwargs):
            yield self.data
            raise RuntimeError("ledger commit failed")

        with patch.object(draft_flow.library, "ledger_transaction", failed_commit):
            with self.assertRaisesRegex(RuntimeError, "ledger commit failed"):
                self.prepare(only="topic")

        self.assertEqual(target.read_bytes(), self.source.read_bytes())

    def test_copy_failure_removes_partial_file_created_by_prepare(self):
        target = self.queue.pending / "title.docx"

        def fail_after_partial_copy(_source, output):
            output.write(b"partial copy")
            raise OSError("copy interrupted")

        with patch.object(draft_flow.shutil, "copyfileobj", side_effect=fail_after_partial_copy):
            articles, issues = self.prepare(only="topic")

        self.assertEqual(articles, [])
        self.assertIn("copy interrupted", issues[0])
        self.assertFalse(target.exists())

    def test_digest_mismatch_removes_corrupt_file_created_by_prepare(self):
        target = self.queue.pending / "title.docx"

        def corrupt_copy(_source, output):
            output.write(b"not the source bytes")

        with patch.object(draft_flow.shutil, "copyfileobj", side_effect=corrupt_copy):
            articles, issues = self.prepare(only="topic")

        self.assertEqual(articles, [])
        self.assertIn("成稿在准备时发生变化", issues[0])
        self.assertFalse(target.exists())

    def test_copy_failure_preserves_file_concurrently_rewritten_before_cleanup(self):
        target = self.queue.pending / "title.docx"
        original_cleanup = draft_flow._remove_unchanged_new_file

        def fail_after_partial_copy(_source, output):
            output.write(b"partial copy")
            raise OSError("copy interrupted")

        def rewrite_then_cleanup(queue, path, version):
            path.write_bytes(b"manual replacement")
            return original_cleanup(queue, path, version)

        with patch.object(
            draft_flow.shutil, "copyfileobj", side_effect=fail_after_partial_copy
        ), patch.object(
            draft_flow, "_remove_unchanged_new_file", side_effect=rewrite_then_cleanup
        ):
            articles, issues = self.prepare(only="topic")

        self.assertEqual(articles, [])
        self.assertIn("copy interrupted", issues[0])
        self.assertEqual(target.read_bytes(), b"manual replacement")

    def test_blocked_article_emits_per_article_reason(self):
        article = load_fixture(self.source)
        self.queue.records[article.fingerprint] = {'status': 'needs_review', 'draft_url': None}
        self.prepare()
        messages = '\n'.join(c.args[0] for c in draft_flow._emit.call_args_list)
        self.assertIn('[发送结果]', messages)
        self.assertIn('上次保存结果未确认', messages)

    def test_known_draft_resumes_only_with_original_file(self):
        article = load_fixture(self.source)
        self.queue.records[article.fingerprint] = {
            "status": "needs_review", "draft_url": "https://example.test/draft/1", "source_digest": "changed",
        }
        articles, issues = self.prepare()
        self.assertEqual(articles, [])
        self.assertIn("上次上传后有改动", issues[0])

    def test_platform_failure_continues_next_platform(self):
        processes = [MagicMock(), MagicMock()]
        processes[0].wait.return_value = 1
        processes[1].wait.return_value = 0
        for process in processes:
            process.poll.return_value = 0
        with patch.object(draft_flow.subprocess, "Popen", side_effect=processes) as popen:
            code = draft_flow.run_all(["知乎", "今日头条"])
        self.assertEqual(code, 1)
        self.assertEqual(popen.call_count, 2)
        self.assertEqual(popen.call_args_list[1].args[0][-1], "今日头条")

    def test_only_is_forwarded_to_isolated_platform_process(self):
        process = MagicMock()
        process.wait.return_value = 0
        process.poll.return_value = 0
        with patch.object(draft_flow.subprocess, "Popen", return_value=process) as popen:
            self.assertEqual(draft_flow.run_all(["今日头条"], only="topic"), 0)
        self.assertEqual(popen.call_args.args[0][-2:], ["--only", "topic"])

    def test_draft_flow_cli_forwards_only_to_platform_runner(self):
        with patch.object(draft_flow.sys, "argv", [
            "draft_flow", "--platform", "今日头条", "--only", "topic"
        ]), patch.object(draft_flow, "run_platform", return_value=0) as run_platform:
            self.assertEqual(draft_flow.main(), 0)
        run_platform.assert_called_once_with("今日头条", only="topic")

    def test_legacy_send_cli_delegates_to_draft_flow_without_direct_dispatch(self):
        with patch.object(hub_main.config, "ensure_directories"), patch.object(
            hub_main, "do_dispatch"
        ) as dispatch, patch.object(draft_flow, "run_all", return_value=0) as run_all:
            self.assertEqual(hub_main.main(["送草稿", "--平台", "头条", "--only", "topic"]), 0)
        dispatch.assert_not_called()
        run_all.assert_called_once_with(["今日头条"], only="topic")

    def test_timeout_kills_platform_tree_and_continues(self):
        first, second = MagicMock(), MagicMock()
        first.wait.side_effect = [subprocess.TimeoutExpired("fixture", 1), 1]
        second.wait.return_value = 0
        first.poll.return_value = second.poll.return_value = 0
        with patch.object(draft_flow.subprocess, "Popen", side_effect=[first, second]), patch.object(
            draft_flow, "_kill_tree"
        ) as kill:
            code = draft_flow.run_all(["知乎", "百家号"])
        self.assertEqual(code, 1)
        kill.assert_called_once_with(first)
        second.wait.assert_called_once()

    def test_console_requires_choices_and_does_not_start_invalid_job(self):
        with patch.object(console, "CURRENT", None), patch.object(console.threading, "Thread") as thread:
            self.assertIn("error", console.start("一键送草稿"))
            self.assertIn("error", console.start("一键送草稿", platforms="微博"))
            thread.assert_not_called()
            result = console.start("一键送草稿", platforms="今日头条,知乎")
            self.assertIn("job", result)
            spec = thread.call_args.kwargs["args"][1]
            self.assertEqual(spec["argv"][-2:], ["--platforms", "今日头条,知乎"])

    def test_console_subprocess_is_hidden_on_windows(self):
        process = MagicMock()
        process.stdout = io.StringIO("done\n")
        process.wait.return_value = 0
        job = console.Job(1, "预览", "预览")
        with patch.object(console.sys, "platform", "win32"), patch.object(console.subprocess, "Popen", return_value=process) as popen, patch.object(console.threading, "Thread"):
            console._execute(job, {"argv": ["-m", "test"], "cwd": self.root})
        self.assertEqual(popen.call_args.kwargs["creationflags"], subprocess.CREATE_NO_WINDOW)
        self.assertEqual(job.status, "ok")

    def test_partial_failure_summary_preserves_all_platform_result(self):
        message = "草稿处理结束：知乎有待处理项；已完成的平台保留进度，详情见运行记录。"
        self.assertEqual(console._summary_for("一键送草稿", ["[待处理] first", message], 1), message)

    def platform_mocks(self, articles, issues=()):
        queue = MagicMock()
        queue.lock.return_value = contextlib.nullcontext()
        run = MagicMock()
        modules = {
            "toutiao_drafts.queue": SimpleNamespace(DraftQueue=lambda root: queue),
            "toutiao_drafts.articles": SimpleNamespace(load_article=load_fixture),
            "toutiao_drafts.__main__": SimpleNamespace(run=run),
        }
        for obj, name, value in [
            (draft_flow.config, "load_platforms", MagicMock(return_value={"今日头条": {
                "root": self.root, "pending": self.root / "待发文章"}})),
            (draft_flow.importlib, "import_module", MagicMock(side_effect=modules.__getitem__)),
            (draft_flow, "prepare", MagicMock(return_value=(articles, list(issues)))),
        ]:
            mock = patch.object(obj, name, value)
            mock.start()
            self.addCleanup(mock.stop)
        return queue, run

    def test_empty_platform_never_opens_sender(self):
        queue, run = self.platform_mocks([])
        self.assertEqual(draft_flow.run_platform("今日头条"), 0)
        run.assert_not_called()
        queue.close.assert_called_once()

    def test_platform_runner_forwards_only_to_prepare(self):
        queue, run = self.platform_mocks([])
        self.assertEqual(draft_flow.run_platform("今日头条", only="topic"), 0)
        draft_flow.prepare.assert_called_once()
        self.assertEqual(
            draft_flow.prepare.call_args.kwargs,
            {"only": "topic", "retry_without_url": None},
        )
        run.assert_not_called()
        queue.close.assert_called_once()

    def test_baijiahao_uses_safe_retry_policy_and_runs_automatic_sender(self):
        queue = MagicMock()
        queue.lock.return_value = contextlib.nullcontext()
        queue.get.return_value = {"status": "archived"}
        run = MagicMock()
        retry_without_url = lambda record: bool(record.get("error"))
        article = SimpleNamespace(
            fingerprint="a", title="A", source=self.queue.pending / "A.docx"
        )
        modules = {
            "baijiahao_drafts.queue": SimpleNamespace(DraftQueue=lambda root: queue),
            "baijiahao_drafts.articles": SimpleNamespace(load_article=load_fixture),
            "baijiahao_drafts.__main__": SimpleNamespace(
                run=run, _safe_to_retry_without_url=retry_without_url,
            ),
        }
        importer = MagicMock(side_effect=modules.__getitem__)
        with patch.object(draft_flow.config, "load_platforms", return_value={"百家号": {
            "root": self.root, "pending": self.root / "待发文章",
        }}), patch.object(
            draft_flow.importlib, "import_module", importer
        ), patch.object(
            draft_flow, "prepare", return_value=([article], [])
        ) as prepare:
            self.assertEqual(draft_flow.run_platform("百家号"), 0)

        prepare.assert_called_once_with(
            "百家号", queue, load_fixture, only=None,
            retry_without_url=retry_without_url,
        )
        self.assertIn("baijiahao_drafts.__main__", [call.args[0] for call in importer.call_args_list])
        run.assert_called_once()
        self.assertTrue(run.call_args.args[2].reset_editor)
        output = "\n".join(call.args[0] for call in draft_flow._emit.call_args_list)
        self.assertIn('"status": "saved"', output)
        queue.close.assert_called_once()

    def test_platform_partial_failures_detected_even_when_sender_returns_normally(self):
        articles = [SimpleNamespace(fingerprint="a", title="A"), SimpleNamespace(fingerprint="b", title="B")]
        queue, run = self.platform_mocks(articles)
        queue.get.side_effect = [{"status": "archived"}, {"status": "needs_review", "error": "fixture failure"}]
        self.assertEqual(draft_flow.run_platform("今日头条"), 1)
        self.assertEqual(run.call_args.args[2].limit, 2)
        self.assertIn("fixture failure", "\n".join(call.args[0] for call in draft_flow._emit.call_args_list))


if __name__ == "__main__":
    unittest.main()
