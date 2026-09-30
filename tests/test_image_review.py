"""Explicit per-picture decisions and safe reviewed-version replacement."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from article_hub import config, image_review, layout, library
from article_hub.docxio import Block, write_document
from tests.test_layout import png_bytes


class ImageReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for attribute, suffix in [('UNFORMATTED', 'pending'), ('FORMATTED', 'finished'),
                                  ('DATA', 'data'), ('PREVIEW', 'preview')]:
            mock = patch.object(config, attribute, self.root / suffix)
            mock.start()
            self.addCleanup(mock.stop)
        mock = patch.object(library, 'LEDGER', config.DATA / 'ledger.json')
        mock.start()
        self.addCleanup(mock.stop)
        config.ensure_directories()
        self.folder = config.UNFORMATTED / '文章'
        self.folder.mkdir()
        write_document(self.folder / '源稿.docx',
                       [Block('title', '文章标题'),
                        *[Block('p', f'第{index}段正文内容。') for index in range(1, 6)]],
                       title='文章标题')

    def image(self, name):
        (self.folder / name).write_bytes(png_bytes(500, 300))

    def five_images(self):
        names = [f'{letter}.png' for letter in 'abcde']
        for name in names:
            self.image(name)
        return names

    @staticmethod
    def package_bytes(folder):
        return {str(path.relative_to(folder)): path.read_bytes()
                for path in folder.rglob('*') if path.is_file()}

    def test_legacy_selection_is_pending_and_listing_does_not_write(self):
        self.image('a.png')
        (self.folder / image_review.SELECTION_FILE).write_text(
            json.dumps({'保留图片': ['a.png']}), encoding='utf-8')
        before = {path.name: path.read_bytes() for path in self.folder.iterdir()}
        row = image_review.list_topics()[0]
        self.assertEqual(row['selected'], [])
        self.assertEqual(row['pending_count'], 1)
        self.assertEqual(row['images'][0]['review_status'], 'pending')
        self.assertEqual(before, {path.name: path.read_bytes() for path in self.folder.iterdir()})
        with self.assertRaisesRegex(ValueError, '至少保留一张'):
            image_review.reformat('文章')

    def test_all_rejected_is_saved_without_falling_back_to_every_picture(self):
        self.image('a.png')
        review = image_review.save_review('文章', {'a.png': 'rejected'})
        self.assertEqual(review['cover'], '')
        self.assertEqual(image_review.load_selection(self.folder), [])
        self.assertEqual(json.loads((self.folder / image_review.SELECTION_FILE).read_text(encoding='utf-8'))['保留图片'], [])
        self.assertTrue((self.folder / 'a.png').exists())
        with self.assertRaisesRegex(ValueError, '还没有保留任何图片'):
            image_review.reformat('文章')

    def test_incremental_decisions_keep_approval_and_new_candidates_pending(self):
        self.image('a.png')
        self.image('b.png')
        first = image_review.save_review('文章', {'a.png': 'approved'}, cover='a.png')
        second = image_review.save_review('文章', {'b.png': 'rejected'})
        self.assertEqual(second['revision'], first['revision'] + 1)
        self.image('replacement.png')
        review = image_review.load_review(self.folder)
        self.assertEqual(review['states'], {'a.png': 'approved', 'b.png': 'rejected', 'replacement.png': 'pending'})
        self.assertEqual(image_review.load_selection(self.folder), ['a.png'])
        row = image_review.list_topics()[0]
        self.assertEqual((row['approved_count'], row['pending_count'], row['rejected_count']), (1, 1, 1))
        self.assertEqual(row['missing_count'], row['target_count'] - 1)
        self.assertEqual(row['phase'], 'review')
        self.assertTrue(review['needs_layout'])

    def test_zero_image_source_is_reviewable(self):
        row = image_review.list_topics()[0]
        self.assertEqual(row['topic'], '文章')
        self.assertEqual(row['images'], [])
        self.assertGreater(row['target_count'], 0)
        self.assertEqual(row['missing_count'], row['target_count'])
        self.assertEqual(row['phase'], 'needs_images')

    def test_any_approved_count_is_ready_to_finalize(self):
        names = self.five_images()
        image_review.save_review('文章', {name: 'approved' for name in names})
        self.assertEqual(image_review.list_topics()[0]['phase'], 'ready')
        # 计划张数只是建议：少保留一张同样可以定稿。
        image_review.save_review('文章', {names[-1]: 'rejected'})
        row = image_review.list_topics()[0]
        self.assertEqual(row['approved_count'], 4)
        self.assertEqual(row['phase'], 'ready')

    def test_manifest_target_can_be_non_five(self):
        names = [f'image-{index}.png' for index in range(7)]
        for name in names:
            self.image(name)
        (self.folder / '配图清单.json').write_text(
            json.dumps({'建议配图数': 7, '配图': []}), encoding='utf-8')
        image_review.save_review('文章', {name: 'approved' for name in names})
        row = image_review.list_topics()[0]
        self.assertEqual(row['target_count'], 7)
        self.assertEqual(row['approved_count'], 7)
        self.assertEqual(row['phase'], 'ready')
        image_review.save_review('文章', {names[-1]: 'rejected'})
        # 少于计划张数也能直接定稿。
        image_review.reformat('文章')
        archive = image_review.topic_path('成稿:文章')
        self.assertEqual(len(image_review.load_selection(archive)), 6)
        self.assertFalse(image_review.load_review(archive)['needs_layout'])

    def test_finalize_records_undecided_candidates_as_not_used(self):
        names = self.five_images()
        image_review.save_review('文章', {names[0]: 'approved', names[1]: 'approved'},
                                 cover=names[0])
        image_review.reformat('文章')
        archive = image_review.topic_path('成稿:文章')
        states = image_review.load_review(archive)['states']
        self.assertEqual(sum(value == 'approved' for value in states.values()), 2)
        self.assertEqual(sum(value == 'pending' for value in states.values()), 0)
        self.assertEqual(sum(value == 'rejected' for value in states.values()), 3)

    def test_invalid_decisions_do_not_write_any_review(self):
        self.image('a.png')
        for states, cover in [({'../outside.png': 'approved'}, None),
                              ({'a.png': True}, None), ({'a.png': []}, None),
                              ({'missing.png': 'approved'}, None),
                              ({'a.png': 'rejected'}, 'a.png'),
                              ({'a.png': 'approved'}, '../outside.png')]:
            with self.subTest(states=states, cover=cover):
                with self.assertRaises(ValueError):
                    image_review.save_review('文章', states, cover)
                self.assertFalse((self.folder / image_review.REVIEW_FILE).exists())

    def test_atomic_json_replace_failure_keeps_old_file_and_cleans_temp(self):
        import os

        target = config.DATA / 'state.json'
        target.write_text('{"old": true}', encoding='utf-8')
        before = target.read_bytes()
        with patch.object(os, 'replace', side_effect=OSError('replace failed')):
            with self.assertRaisesRegex(OSError, 'replace failed'):
                image_review._write_json(target, {'new': True})
        self.assertEqual(target.read_bytes(), before)
        self.assertEqual(list(target.parent.glob(f'.{target.name}.*.tmp')), [])

    def test_atomic_json_replace_retries_transient_permission_error(self):
        target = config.DATA / 'state.json'
        target.write_text('{"old": true}', encoding='utf-8')
        real_replace = image_review.os.replace
        attempts = 0

        def flaky_replace(source, destination):
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise PermissionError(5, 'sharing violation')
            return real_replace(source, destination)

        with patch.object(image_review.os, 'replace', side_effect=flaky_replace), \
             patch.object(image_review._time, 'sleep') as sleep:
            image_review._write_json(target, {'new': True})

        self.assertEqual(json.loads(target.read_text(encoding='utf-8')), {'new': True})
        self.assertEqual(attempts, 3)
        self.assertEqual(sleep.call_count, 2)
        self.assertEqual(list(target.parent.glob(f'.{target.name}.*.tmp')), [])

    def test_status_reader_waits_for_complete_locked_write(self):
        import threading

        target = config.DATA / '配图进度.json'
        image_review._write_status(target, {'状态': '旧'})
        writer_entered = threading.Event()
        release_writer = threading.Event()
        result = []
        errors = []
        original_write = image_review._write_json

        def delayed_write(path, data):
            writer_entered.set()
            if not release_writer.wait(2):
                raise TimeoutError('test did not release status writer')
            return original_write(path, data)

        def write_status():
            try:
                image_review._write_status(target, {'状态': '新'})
            except Exception as exc:  # pragma: no cover - asserted below
                errors.append(exc)

        def read_status():
            try:
                result.append(image_review._read_status(target)[1])
            except Exception as exc:  # pragma: no cover - asserted below
                errors.append(exc)

        with patch.object(image_review, '_write_json', side_effect=delayed_write):
            writer = threading.Thread(target=write_status)
            reader = threading.Thread(target=read_status)
            writer.start()
            self.assertTrue(writer_entered.wait(2))
            reader.start()
            reader.join(0.1)
            self.assertTrue(reader.is_alive())
            release_writer.set()
            writer.join(2)
            reader.join(2)

        self.assertFalse(writer.is_alive())
        self.assertFalse(reader.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(result, [{'状态': '新'}])

    def test_concurrent_review_updates_merge_under_one_file_lock(self):
        import threading

        self.image('a.png')
        self.image('b.png')
        first_writing = threading.Event()
        release_first = threading.Event()
        errors = []
        original_write = image_review._write_json

        def delayed_write(path, data):
            if (path.name == image_review.REVIEW_FILE
                    and threading.current_thread().name == 'first-review'):
                first_writing.set()
                if not release_first.wait(2):
                    raise TimeoutError('test did not release first writer')
            return original_write(path, data)

        def update(name, state):
            try:
                image_review.save_review('文章', {name: state})
            except Exception as exc:  # pragma: no cover - asserted below
                errors.append(exc)

        with patch.object(image_review, '_write_json', side_effect=delayed_write):
            first = threading.Thread(target=update, name='first-review',
                                     args=('a.png', 'approved'))
            second = threading.Thread(target=update, name='second-review',
                                      args=('b.png', 'rejected'))
            first.start()
            self.assertTrue(first_writing.wait(2))
            second.start()
            # The second update cannot read stale state while the first writer
            # is paused inside its transaction.
            second.join(0.1)
            self.assertTrue(second.is_alive())
            release_first.set()
            first.join(2)
            second.join(2)

        self.assertFalse(first.is_alive())
        self.assertFalse(second.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(image_review.load_review(self.folder)['states'],
                         {'a.png': 'approved', 'b.png': 'rejected'})

    def test_article_transactions_serialize_same_topic_but_not_other_topics(self):
        import threading

        first_entered = threading.Event()
        release_first = threading.Event()
        same_attempted = threading.Event()
        same_entered = threading.Event()
        other_entered = threading.Event()
        errors = []

        @image_review._article_transaction
        def probe(topic, role):
            if role == 'first':
                first_entered.set()
                if not release_first.wait(3):
                    raise TimeoutError('test did not release first transaction')
            elif role == 'same':
                same_entered.set()
            else:
                other_entered.set()

        def run(topic, role):
            if role == 'same':
                same_attempted.set()
            try:
                probe(topic, role)
            except Exception as exc:  # pragma: no cover - asserted below
                errors.append(exc)

        first = threading.Thread(target=run, args=('文章', 'first'))
        same = threading.Thread(target=run, args=('成稿:文章', 'same'))
        other = threading.Thread(target=run, args=('另一篇', 'other'))
        first.start()
        self.assertTrue(first_entered.wait(2))
        same.start()
        self.assertTrue(same_attempted.wait(1))
        other.start()
        try:
            self.assertTrue(other_entered.wait(2))
            self.assertFalse(same_entered.wait(0.1))
        finally:
            release_first.set()
            first.join(3)
            same.join(3)
            other.join(3)

        self.assertTrue(same_entered.is_set())
        self.assertFalse(first.is_alive())
        self.assertFalse(same.is_alive())
        self.assertFalse(other.is_alive())
        self.assertEqual(errors, [])
        same_target = image_review._article_lock_target('文章')
        self.assertEqual(same_target,
                         image_review._article_lock_target('成稿:文章'))
        self.assertNotEqual(same_target,
                            image_review._article_lock_target('另一篇'))
        self.assertNotIn('文章', same_target.name)

    def test_reformat_only_approved_and_retains_rejected_sources(self):
        names = self.five_images()
        self.image('rejected.png')
        image_review.save_review('文章', {**{name: 'approved' for name in names},
                                               'rejected.png': 'rejected'}, cover='a.png')
        image_review.reformat('文章')
        source = image_review.topic_path('成稿:文章')
        manifest = json.loads((config.FORMATTED / '文章' / '配图清单.json').read_text(encoding='utf-8'))
        self.assertEqual([item['原始文件名'] for item in manifest['配图']], names)
        self.assertFalse(image_review.load_review(source)['needs_layout'])
        self.assertTrue((source / 'rejected.png').exists())
        self.assertFalse(self.folder.exists())
        image_review.save_review('成稿:文章', {'rejected.png': 'approved'})
        self.assertTrue(image_review.load_review(source)['needs_layout'])

    def test_failed_layout_preserves_previous_finished_article(self):
        names = self.five_images()
        result = layout.format_topic(self.folder)
        layout.archive_source(self.folder, result)
        key = '成稿:文章'
        image_review.save_review(key, {name: 'approved' for name in names})
        before = {str(path.relative_to(result.folder)): path.read_bytes()
                  for path in result.folder.rglob('*') if path.is_file()}
        with patch.object(layout, 'format_topic', side_effect=RuntimeError('模拟渲染失败')):
            with self.assertRaises(RuntimeError):
                image_review.reformat(key)
        self.assertEqual(before, {str(path.relative_to(result.folder)): path.read_bytes()
                                  for path in result.folder.rglob('*') if path.is_file()})

    def test_successful_reformat_backs_up_old_finished_version(self):
        names = self.five_images()
        result = layout.format_topic(self.folder)
        layout.archive_source(self.folder, result)
        old_docx = result.docx.read_bytes()
        image_review.save_review('成稿:文章', {name: 'approved' for name in names})
        image_review.reformat('成稿:文章')
        backups = list((config.DATA / '重新排版备份').rglob(result.docx.name))
        self.assertTrue(any(path.read_bytes() == old_docx for path in backups))
        self.assertFalse(image_review.load_review(image_review.topic_path('成稿:文章'))['needs_layout'])

    def test_new_package_commit_failure_restores_old_and_keeps_failed_candidate(self):
        names = self.five_images()
        result = layout.format_topic(self.folder)
        layout.archive_source(self.folder, result)
        image_review.save_review('成稿:文章', {name: 'approved' for name in names})
        before = self.package_bytes(result.folder)
        rename = Path.rename

        def fail_staged_commit(path, target):
            if target == result.folder and '审阅排版-' in str(path):
                raise OSError('模拟新成稿提交失败')
            return rename(path, target)

        with patch.object(Path, 'rename', fail_staged_commit):
            with self.assertRaisesRegex(OSError, '新成稿提交失败'):
                image_review.reformat('成稿:文章')

        self.assertEqual(before, self.package_bytes(result.folder))
        failed = list((config.DATA / '重新排版备份').glob('*/未提交成稿'))
        self.assertEqual(len(failed), 1)
        self.assertTrue(any(failed[0].glob('*.docx')))
        self.assertTrue((result.folder / '原始素材' / '源稿.docx').is_file())

    def test_source_archive_failure_rolls_back_new_package_and_keeps_both_copies(self):
        names = self.five_images()
        image_review.save_review('文章', {name: 'approved' for name in names})
        source_before = self.package_bytes(self.folder)
        rename = Path.rename

        def fail_source_archive(path, target):
            if path == self.folder and target.name == '未排版原始素材':
                raise PermissionError('模拟源素材移动失败')
            return rename(path, target)

        with patch.object(Path, 'rename', fail_source_archive):
            with self.assertRaisesRegex(PermissionError, '源素材移动失败'):
                image_review.reformat('文章')

        self.assertEqual(source_before, self.package_bytes(self.folder))
        self.assertFalse((config.FORMATTED / '文章').exists())
        failed = list((config.DATA / '重新排版备份').glob('*/未提交成稿'))
        self.assertEqual(len(failed), 1)
        self.assertTrue(any(failed[0].glob('*.docx')))
        self.assertTrue((failed[0] / '原始素材' / '源稿.docx').is_file())

    def test_ledger_refresh_failure_restores_old_package_and_dirty_review(self):
        names = self.five_images()
        result = layout.format_topic(self.folder)
        archive = layout.archive_source(self.folder, result)
        image_review.save_review('成稿:文章', {name: 'approved' for name in names})
        before = self.package_bytes(result.folder)
        ledger_before = (json.dumps({'marker': 'before', '文章': {}}, ensure_ascii=False)
                         + '\n').encode('utf-8')
        library.LEDGER.parent.mkdir(parents=True, exist_ok=True)
        library.LEDGER.write_bytes(ledger_before)

        with patch.object(library, 'refresh_ledger', side_effect=RuntimeError('模拟台账刷新失败')):
            with self.assertRaisesRegex(RuntimeError, '台账刷新失败'):
                image_review.reformat('成稿:文章')

        self.assertEqual(before, self.package_bytes(result.folder))
        self.assertEqual(library.LEDGER.read_bytes(), ledger_before)
        self.assertTrue(image_review.load_review(archive)['needs_layout'])
        failed = list((config.DATA / '重新排版备份').glob('*/未提交成稿'))
        self.assertEqual(len(failed), 1)
        self.assertFalse(image_review.load_review(failed[0] / '原始素材')['needs_layout'])

    def test_resource_collects_formatted_candidates_without_refreshing_ledger_or_final(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        from article_hub import sourcing

        self.image('a.png')
        old = layout.format_topic(self.folder)
        layout.archive_source(self.folder, old)
        before_docx = old.docx.read_bytes()

        def search(folder, **kwargs):
            (folder / 'new.png').write_bytes(png_bytes(1000, 700))
            (folder / image_review.SELECTION_FILE).write_text(
                json.dumps({'保留图片': ['new.png']}), encoding='utf-8')
            return SimpleNamespace(chosen=[object()])

        provider = Mock()
        with patch.object(sourcing, 'build_sources', return_value=([provider], [])), \
             patch.object(sourcing, 'source_topic', side_effect=search), \
             patch.object(library, 'refresh_ledger') as refresh:
            image_review.resource('成稿:文章', ['测试图源'])

        self.assertEqual(old.docx.read_bytes(), before_docx)
        self.assertTrue((image_review.topic_path('成稿:文章') / 'new.png').is_file())
        refresh.assert_not_called()
        provider.close.assert_called_once()

    def test_resource_collects_unformatted_candidates_without_touching_existing_output(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        from article_hub import sourcing

        old = layout.format_topic(self.folder)
        package_before = self.package_bytes(old.folder)

        def search(folder, **kwargs):
            (folder / 'new.png').write_bytes(png_bytes(1000, 700))
            (folder / image_review.SELECTION_FILE).write_text(
                json.dumps({'保留图片': ['new.png']}), encoding='utf-8')
            return SimpleNamespace(chosen=[object()])

        provider = Mock()
        with patch.object(sourcing, 'build_sources', return_value=([provider], [])), \
             patch.object(sourcing, 'source_topic', side_effect=search), \
             patch.object(library, 'refresh_ledger') as refresh:
            image_review.resource('文章', ['测试图源'])

        self.assertEqual(self.package_bytes(old.folder), package_before)
        self.assertTrue((self.folder / 'new.png').is_file())
        refresh.assert_not_called()
        provider.close.assert_called_once()

    def test_windows_open_directory_uses_file_commit_without_losing_sources(self):
        names = self.five_images()
        result = layout.format_topic(self.folder)
        archive = layout.archive_source(self.folder, result)
        original = (archive / '源稿.docx').read_bytes()
        image_review.save_review('成稿:文章', {name: 'approved' for name in names})
        rename = Path.rename
        def deny_package(path, target):
            if path == result.folder:
                raise PermissionError('directory in use')
            return rename(path, target)
        with patch.object(Path, 'rename', deny_package):
            image_review.reformat('成稿:文章')
        self.assertEqual((archive / '源稿.docx').read_bytes(), original)
        self.assertFalse(image_review.load_review(archive)['needs_layout'])

    def test_file_commit_failure_restores_previous_content(self):
        import shutil
        self.image('a.png')
        result = layout.format_topic(self.folder)
        layout.archive_source(self.folder, result)
        stage = self.root / 'staged'
        shutil.copytree(result.folder, stage)
        (stage / 'first.txt').write_text('new', encoding='utf-8')
        (stage / '预览.html').write_text('changed', encoding='utf-8')
        before = {str(p.relative_to(result.folder)): p.read_bytes() for p in result.folder.rglob('*') if p.is_file()}
        replace = Path.replace
        def fail_preview(path, target):
            if path == stage / '预览.html':
                raise PermissionError('file in use')
            return replace(path, target)
        with patch.object(Path, 'replace', fail_preview):
            with self.assertRaisesRegex(ValueError, '占用'):
                image_review._replace_package_files(stage, result.folder, self.root / 'backup')
        self.assertEqual(before, {str(p.relative_to(result.folder)): p.read_bytes() for p in result.folder.rglob('*') if p.is_file()})
        self.assertEqual(before, self.package_bytes(self.root / 'backup'))

    def test_file_commit_removes_files_absent_from_staged_package(self):
        import shutil
        self.image('a.png')
        result = layout.format_topic(self.folder)
        layout.archive_source(self.folder, result)
        stale = result.folder / '旧标题.docx'
        stale.write_bytes(b'old manuscript')
        stage = self.root / 'staged-clean'
        shutil.copytree(result.folder, stage)
        (stage / stale.name).unlink()

        image_review._replace_package_files(stage, result.folder, self.root / 'backup-clean')

        self.assertFalse(stale.exists())
        self.assertEqual((self.root / 'backup-clean' / stale.name).read_bytes(), b'old manuscript')

    def test_file_commit_obsolete_delete_failure_restores_removed_files(self):
        import shutil
        self.image('a.png')
        result = layout.format_topic(self.folder)
        layout.archive_source(self.folder, result)
        first = result.folder / 'a-old.docx'
        second = result.folder / 'b-old.docx'
        first.write_bytes(b'first')
        second.write_bytes(b'second')
        stage = self.root / 'staged-delete-failure'
        shutil.copytree(result.folder, stage)
        (stage / first.name).unlink()
        (stage / second.name).unlink()
        unlink = Path.unlink

        def fail_first(path, *args, **kwargs):
            if path == first:
                raise PermissionError('file in use')
            return unlink(path, *args, **kwargs)

        with patch.object(Path, 'unlink', fail_first):
            with self.assertRaisesRegex(ValueError, '占用'):
                image_review._replace_package_files(
                    stage, result.folder, self.root / 'backup-delete-failure'
                )

        self.assertEqual(first.read_bytes(), b'first')
        self.assertEqual(second.read_bytes(), b'second')

    def test_dispatch_gate_allows_legacy_then_requires_finished_review(self):
        names = self.five_images()
        result = layout.format_topic(self.folder)
        layout.archive_source(self.folder, result)
        image_review.assert_ready_for_dispatch(result.docx)  # No explicit review: legacy remains usable.
        image_review.save_review('成稿:文章', {name: 'approved' for name in names})
        with self.assertRaisesRegex(ValueError, '重新生成成稿'):
            image_review.assert_ready_for_dispatch(result.docx)
        image_review.reformat('成稿:文章')
        image_review.assert_ready_for_dispatch(result.docx)
        image_review.save_review('成稿:文章', {'a.png': 'pending'})
        with self.assertRaisesRegex(ValueError, '尚未全部审阅'):
            image_review.assert_ready_for_dispatch(result.docx)
        image_review.save_review('成稿:文章', {name: 'rejected' for name in names})
        with self.assertRaisesRegex(ValueError, '尚无通过'):
            image_review.assert_ready_for_dispatch(result.docx)

    def test_dispatch_gate_uses_newest_archive_and_actual_package_path(self):
        self.image('a.png')
        result = layout.format_topic(self.folder)
        archive = layout.archive_source(self.folder, result)
        image_review.save_review('成稿:文章', {'a.png': 'rejected'})
        # The newest source is independent of older unfinished review history.
        import shutil
        newest = result.folder / '原始素材-2'
        shutil.copytree(archive, newest)
        (newest / image_review.REVIEW_FILE).unlink()
        image_review.assert_ready_for_dispatch(result.docx)
        image_review.save_review('成稿:文章', {'a.png': 'approved'})
        with self.assertRaises(ValueError):
            image_review.assert_ready_for_dispatch(result.docx)
        loose = config.FORMATTED / '文章.docx'
        loose.write_bytes(result.docx.read_bytes())
        image_review.assert_ready_for_dispatch(loose)

    def test_dispatch_does_not_overwrite_pending_when_review_is_dirty(self):
        self.image('a.png')
        result = layout.format_topic(self.folder)
        layout.archive_source(self.folder, result)
        image_review.save_review('成稿:文章', {'a.png': 'approved'})
        pending = self.root / 'platform-pending'
        pending.mkdir()
        target = pending / (result.title + '.docx')
        target.write_bytes(b'previous pending remains untouched')
        receipts = self.root / 'platform-receipts'
        receipts.mkdir()
        with patch.object(config, 'load_platforms', return_value={
                '知乎': {'pending': pending, 'receipts': receipts, 'root': self.root}
             }), \
             patch.object(library, 'sync_receipts', return_value={'文章': {}}):
            dispatched = library.dispatch('知乎')
        self.assertEqual(dispatched.copied, [])
        self.assertEqual(len(dispatched.skipped), 1)
        self.assertIn('重新生成成稿', dispatched.skipped[0][1])
        self.assertEqual(target.read_bytes(), b'previous pending remains untouched')

    def test_archived_sources_are_never_scanned_as_finished_manuscripts(self):
        self.image('a.png')
        result = layout.format_topic(self.folder)
        archive = layout.archive_source(self.folder, result)
        rows = library.scan_formatted()
        self.assertEqual([row['成稿'] for row in rows], [result.docx])
        self.assertTrue((archive / '源稿.docx').exists())


if __name__ == '__main__':
    unittest.main()
