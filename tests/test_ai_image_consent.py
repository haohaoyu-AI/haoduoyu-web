import os
import unittest
from pathlib import Path
from unittest.mock import patch
from article_hub import sourcing
from article_hub.docxio import Block


class ConsentTests(unittest.TestCase):
    def test_default_never_generates(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sourcing, 'generate_ai_image') as generate:
            self.assertEqual(sourcing.supplement_with_ai(None, [], max_images=7,
                             topic_dir=Path('.'), queries=[]), [])
            generate.assert_not_called()

    def test_opt_in_reaches_generator_with_valid_filename(self):
        doc = type('Doc', (), {'title': '测试文章', 'blocks': [Block('p', '正文内容')]})()
        with patch.dict(os.environ, {'ARTICLE_HUB_ALLOW_AI_IMAGES': '1'}), \
             patch.object(sourcing, '_image_ai_profile', return_value=('image-model', {})), \
             patch.object(sourcing, 'generate_ai_image', return_value=None) as generate:
            sourcing.supplement_with_ai(doc, [], max_images=1, topic_dir=Path('.'), queries=[])
            generate.assert_called_once()
            self.assertIn('AI配图_', generate.call_args.kwargs['stem'])
