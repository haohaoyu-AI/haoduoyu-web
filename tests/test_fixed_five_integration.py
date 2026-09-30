import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from article_hub import ai, config, library, image_actions, image_review, sourcing
from article_hub.docxio import Block, write_document
from article_hub.manuscripts import embedded_image_count


class ReviewedImageWorkflowIntegrationTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        for name in ['UNFORMATTED', 'FORMATTED', 'DATA']:
            folder = self.root / name
            folder.mkdir()
            mock = patch.object(config, name, folder)
            mock.start(); self.addCleanup(mock.stop)
        mock = patch.object(library, 'LEDGER', config.DATA / '库.json')
        mock.start(); self.addCleanup(mock.stop)
        self.folder = config.UNFORMATTED / '测试'
        self.folder.mkdir()
        write_document(self.folder / '稿.docx', [Block('title', '百家讲坛')]
            + [Block('p', f'第{i}段。百家讲坛解读历史知识。' * 10) for i in range(10)], title='百家讲坛')
        Image.new('RGB', (900, 600), 'white').save(self.folder / 'reject.jpg')
        image_review.save_review('测试', {'reject.jpg': 'rejected'})
        self.profile = ('gpt-image-test', {'base_url': 'https://fixture.invalid', 'api_key': 'fixture'})
        for obj, name, value in [(sourcing, '_image_ai_profile', self.profile),
                                  (image_actions.model_settings, 'resolve', self.profile[1])]:
            mock = patch.object(obj, name, return_value=value)
            mock.start(); self.addCleanup(mock.stop)
        self.data = dict(topic='测试', mode='auto', count=5, provider='deepseek', model='deepseek-test')
        self.generations = 0

    def generate(self, prompt, folder, *, stem, **kwargs):
        self.generations += 1
        path = folder / (stem + '.jpg')
        Image.new('RGB', (900, 600), (50 * self.generations, 50, 100)).save(path)
        return path, 900, 600, self.profile[0]

    def network(self, data, document, folder, stage, context, hint):
        rows = []
        for i in range(min(2, data['count'])):
            path = stage / f'network-{i}.jpg'
            Image.new('RGB', (900, 600), (20, 100 + i * 30, 40)).save(path)
            rows.append({'原始文件名': path.name, '原始标题': f'网络图{i}', '平台': '今日头条',
                         '宽': 900, '高': 600})
        return rows

    def test_network_two_gpt_three_waits_for_review_then_explicitly_finalizes(self):
        with patch.object(image_actions, '_network', side_effect=self.network), \
             patch.object(sourcing, 'generate_ai_image', side_effect=self.generate):
            candidates = image_actions.run(self.data, hint=lambda _: None)
        self.assertEqual(self.generations, 3)
        self.assertEqual(len(candidates), 5)
        self.assertEqual(library.scan_formatted(), [])
        state = image_review.load_review(self.folder)
        self.assertEqual(list(state['states'].values()).count('pending'), 5)
        self.assertEqual(state['states']['reject.jpg'], 'rejected')
        image_review.save_review('测试', {
            item['原始文件名']: 'approved' for item in candidates
        }, cover=candidates[0]['原始文件名'])
        image_actions._finalize_five('测试', hint=lambda _: None)
        rows = library.scan_formatted()
        self.assertEqual(len(rows), 1)
        self.assertEqual(embedded_image_count(rows[0]['成稿']), 5)
        archive = image_review.topic_path('成稿:测试')
        state = image_review.load_review(archive)
        self.assertEqual(list(state['states'].values()).count('approved'), 5)
        self.assertEqual(state['states']['reject.jpg'], 'rejected')
        self.assertFalse(state['needs_layout'])
        positions = image_review.load_positions(archive)
        self.assertEqual(len(positions), 4)
        self.assertEqual(len(set(positions.values())), 4)
        self.assertGreater(max(positions.values()) - min(positions.values()), 5)
        image_review.assert_ready_for_dispatch(rows[0]['成稿'])

    def test_complete_pending_batch_neither_searches_nor_auto_finalizes(self):
        for i in range(5):
            Image.new('RGB', (900, 600), (20, 30 * i, 40)).save(self.folder / f'ok-{i}.jpg')
        normalized = image_actions.validate(self.data)
        self.assertEqual(normalized['count'], 0)
        with patch.object(image_actions, '_network') as network, \
             patch.object(sourcing, 'generate_ai_image') as generate:
            image_actions.run(normalized, hint=lambda _: None)
        network.assert_not_called(); generate.assert_not_called()
        self.assertEqual(library.scan_formatted(), [])
        image_review.save_review('测试', {
            f'ok-{i}.jpg': 'approved' for i in range(5)
        }, cover='ok-0.jpg')
        image_actions._finalize_five('测试', hint=lambda _: None)
        self.assertEqual(embedded_image_count(library.scan_formatted()[0]['成稿']), 5)

    def test_fresh_article_generates_pending_candidates_and_waits_for_finalize(self):
        with patch.object(sourcing, 'collect_hits', return_value=([], [])), \
             patch.object(sourcing, 'generate_ai_image', side_effect=self.generate):
            result = sourcing.source_topic(self.folder, sources=[], captions=False, hint=lambda _: None)
        self.assertEqual(self.generations, 5)
        self.assertIsNone(result.layout)
        self.assertIsNone(result.archive)
        self.assertEqual(library.scan_formatted(), [])
        state = image_review.load_review(self.folder)
        self.assertEqual(state['states']['reject.jpg'], 'rejected')
        self.assertEqual(list(state['states'].values()).count('pending'), 5)
        names = [item.file.name for item in result.chosen]
        image_review.save_review('测试', {name: 'approved' for name in names}, cover=names[0])
        image_actions._finalize_five('测试', hint=lambda _: None)
        rows = library.scan_formatted()
        self.assertEqual(embedded_image_count(rows[0]['成稿']), 5)
        archive = image_review.topic_path('成稿:测试')
        self.assertTrue((archive / 'reject.jpg').exists())
        self.assertFalse(image_review.load_review(archive)['needs_layout'])


if __name__ == '__main__':
    unittest.main()
