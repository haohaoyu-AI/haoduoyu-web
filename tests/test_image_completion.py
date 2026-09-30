import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from article_hub import image_review, library, console


class CompletedImageReviewTests(unittest.TestCase):
    def test_only_confirmed_delivery_completes_images(self):
        for record, expected in [
            ({'分发': {'知乎': {'文件': 'x'}}}, False),
            ({'已发': {'知乎': {'状态': 'failed'}}}, False),
            ({'已发': {'知乎': {'草稿地址': 'url', '状态': 'pending'}}}, False),
            ({'已发': {'知乎': {'状态': 'saved_to_draft'}}}, True),
            ({'已发': {'知乎': {'已公开': True}}}, True),
            ({'发布': {'知乎': {'实际': '2026-09-16T20:00'}}}, True),
            ({'发布': {'知乎': {'计划': '2026-09-16T20:00'}}}, False),
        ]:
            with self.subTest(record=record):
                self.assertEqual(library.image_work_complete(record), expected)

    def test_completed_hidden_pending_retained_and_sources_untouched(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pending = root / 'pending'; pending.mkdir()
            formatted = root / 'formatted'; formatted.mkdir()
            for name in ['done', 'new', 'failed']:
                folder = formatted / name / '原始素材'; folder.mkdir(parents=True)
                (folder / 'image.png').write_bytes(b'fixture')
            (pending / 'done').mkdir()
            (pending / 'done' / 'image.png').write_bytes(b'fixture')
            data = {'文章': {'done': {'已发': {'知乎': {'状态': 'saved_to_draft'}}}, 'failed': {'已发': {'知乎': {'状态': 'failed'}}}}}
            with patch.object(image_review.config, 'UNFORMATTED', pending), patch.object(image_review.config, 'FORMATTED', formatted), patch.object(library, 'load_ledger', return_value=data):
                rows = image_review.list_topics()
                self.assertEqual({r['topic'] for r in rows}, {'成稿:new', '成稿:failed'})
                self.assertTrue((formatted / 'done' / '原始素材' / 'image.png').exists())
                with self.assertRaisesRegex(ValueError, '配图排版已完成'):
                    image_review.save_selection('成稿:done', ['image.png'])
                with patch('article_hub.layout.format_topic') as fmt:
                    with self.assertRaises(ValueError): image_review.reformat('成稿:done')
                    fmt.assert_not_called()
                with patch.object(console.threading, 'Thread') as thread:
                    self.assertIn('error', console.start('排版', topic='成稿:done'))
                    thread.assert_not_called()

    def test_published_status_distinct_from_draft(self):
        self.assertEqual(library.platform_completion({'发布': {'知乎': {'实际': 'today'}}, '已发': {'知乎': {'状态': 'saved_to_draft'}}}, '知乎'), '已发布')
