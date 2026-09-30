import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import tempfile

from article_hub import sourcing as s, ai
from article_hub.docxio import Block
from article_hub.hits import Hit
from tests.test_sourcing import png_bytes


class ImageQualityTests(unittest.TestCase):
    def test_transient_download_retries_and_reports_failure(self):
        from unittest.mock import Mock
        source = Mock(name='source')
        source.name = '头条'
        source.download.side_effect = [TimeoutError('timeout'), b'image']
        messages = []
        downloader = s._Downloader([source], hint=messages.append)
        self.assertEqual(downloader(self.hit), b'image')
        self.assertEqual(source.download.call_count, 2)
        self.assertIn('下载重试', messages[0])

    def test_single_attempt_success_calls_source_once(self):
        from unittest.mock import Mock
        source = Mock(name='source')
        source.name = '头条'
        source.download.return_value = b'image'
        downloader = s._Downloader([source], max_attempts=1)
        self.assertEqual(downloader(self.hit), b'image')
        self.assertEqual(source.download.call_count, 1)

    def test_single_attempt_stops_after_timeout_or_retryable_status(self):
        from unittest.mock import Mock
        for failure in (TimeoutError('timeout'), OSError('HTTP 503')):
            with self.subTest(failure=type(failure).__name__):
                source = Mock(name='source')
                source.name = '头条'
                source.download.side_effect = failure
                messages = []
                downloader = s._Downloader([source], hint=messages.append, max_attempts=1)
                self.assertIsNone(downloader(self.hit))
                self.assertEqual(source.download.call_count, 1)
                self.assertFalse(any('下载重试' in message for message in messages))

    def test_default_success_calls_source_once(self):
        from unittest.mock import Mock
        source = Mock(name='source')
        source.name = '头条'
        source.download.return_value = b'image'
        downloader = s._Downloader([source])
        self.assertEqual(downloader(self.hit), b'image')
        self.assertEqual(source.download.call_count, 1)

    def test_default_continuous_transient_failure_stops_after_two_attempts(self):
        from unittest.mock import Mock
        source = Mock(name='source')
        source.name = '头条'
        source.download.side_effect = [TimeoutError('timeout'), TimeoutError('timeout'), b'image']
        downloader = s._Downloader([source])
        self.assertIsNone(downloader(self.hit))
        self.assertIsNone(downloader(self.hit))  # failed result remains cached as failure
        self.assertEqual(source.download.call_count, 2)

    def test_nonretryable_download_failure_still_stops_immediately(self):
        from unittest.mock import Mock
        source = Mock(name='source')
        source.name = '头条'
        source.download.side_effect = ValueError('invalid image url')
        messages = []
        downloader = s._Downloader([source], hint=messages.append)
        self.assertIsNone(downloader(self.hit))
        self.assertEqual(source.download.call_count, 1)
        self.assertFalse(any('下载重试' in message for message in messages))

    def test_explicit_two_attempts_are_supported(self):
        from unittest.mock import Mock
        source = Mock(name='source')
        source.name = '头条'
        source.download.side_effect = [TimeoutError('timeout'), b'image']
        downloader = s._Downloader([source], max_attempts=2)
        self.assertEqual(downloader(self.hit), b'image')
        self.assertEqual(source.download.call_count, 2)

    def test_invalid_attempt_counts_are_rejected_before_download(self):
        from unittest.mock import Mock
        source = Mock(name='source')
        source.name = '头条'
        for value in (0, 3, True, 1.5, '1', None):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, '只能是 1 或 2'):
                    s._Downloader([source], max_attempts=value)
        source.download.assert_not_called()

    def setUp(self):
        self.doc = SimpleNamespace(title='复联4重映', blocks=[Block('p', '这次告别，让观众想起当年的影院。')])
        self.hit = Hit('头条', '钢铁侠 打响指经典镜头', '复联4钢铁侠', '来源', 'https://img/a', 'https://page/a')

    def test_global_subject_can_illustrate_paragraph_without_literal_query(self):
        self.assertTrue(s.matches_position(self.hit, self.doc, [s.Query(self.hit.query)], -1, 0, ['复联4']))
        unrelated = Hit('头条', '人物剧照', '其他电影', '来源', 'u', 'p')
        self.assertFalse(s.matches_position(unrelated, self.doc, [], -1, 0, ['复联4']))

    def test_explicit_other_section_is_not_reassigned(self):
        self.assertFalse(s.matches_position(self.hit, self.doc, [s.Query(self.hit.query, 2)], 1, 0, ['复联4']))

    def test_pixels_are_sent_and_player_screenshot_rejection_is_cached(self):
        check = s.visual_quality_check(self.doc, {'wire_api': 'chat'})
        with patch.object(ai, 'chat', return_value='{"ok":false,"reason":"播放器截图"}') as chat:
            raw = png_bytes(1200, 800)
            self.assertEqual(check(raw, self.hit, '封面'), '播放器截图')
            self.assertEqual(check(raw, self.hit, '封面'), '播放器截图')
            chat.assert_called_once()
            content = chat.call_args.args[0][0]['content']
            self.assertTrue(content[1]['image_url']['url'].startswith('data:image/jpeg;base64,'))

    def test_model_failure_does_not_approve_cover(self):
        with patch.object(ai, 'chat', side_effect=ai.AiError('unsupported image')):
            with self.assertRaisesRegex(ai.AiError, '画面质量检查未完成'):
                s.visual_quality_check(self.doc, {})(png_bytes(1200,800), self.hit, '封面')

    def test_selected_picture_is_sent_for_cross_version_comparison(self):
        check = s.visual_quality_check(self.doc, {})
        check.accept(png_bytes(1200,800))
        with patch.object(ai, 'chat', return_value='{"ok":false,"reason":"同一海报英文版"}') as chat:
            self.assertEqual(check(png_bytes(800,1200), self.hit, '正文配图'), '同一海报英文版')
            self.assertEqual(len(chat.call_args.args[0][0]['content']), 3)

    def test_checks_continue_past_twenty_four_candidates(self):
        check = s.visual_quality_check(self.doc, {})
        with patch.object(ai, 'chat', return_value='{"ok":true}') as chat:
            for index in range(26):
                self.assertEqual(check(png_bytes(30,30,(index,100,200)), self.hit, '正文配图'), '')
            self.assertEqual(chat.call_count, 26)

    def test_rejected_pixels_never_saved(self):
        with tempfile.TemporaryDirectory() as tmp:
            chosen, warnings = s.choose_images(self.doc, [self.hit], max_images=1,
                target_count=1, topic_dir=Path(tmp), queries=[s.Query(self.hit.query)],
                anchors=['复联4'], fetch=lambda _: png_bytes(1200,800),
                quality_check=lambda *args: '播放器截图', hint=lambda _:None)
            self.assertEqual(chosen, [])
            self.assertFalse(list(Path(tmp).iterdir()))

    def test_distinct_images_from_same_query_can_fill_body(self):
        from dataclasses import replace
        second = replace(self.hit, image_url='https://img/b')
        raws = {self.hit.image_url: png_bytes(1200,800), second.image_url: png_bytes(1200,800,(20,150,200))}
        with tempfile.TemporaryDirectory() as tmp, patch.object(s, '_similar', return_value=False):
            chosen, _ = s.choose_images(self.doc, [self.hit, second], max_images=2,
                target_count=2, topic_dir=Path(tmp), queries=[s.Query(self.hit.query)],
                anchors=['复联4'], fetch=lambda hit: raws[hit.image_url],
                quality_check=lambda *args: '', hint=lambda _:None)
            self.assertEqual(len(chosen), 2)
            self.assertEqual({item.role for item in chosen}, {'封面', '正文配图'})
