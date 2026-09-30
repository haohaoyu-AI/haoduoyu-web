import importlib
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from article_hub import library
from article_hub.manuscripts import manuscript_files

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def write_word(path, body):
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('word/document.xml', f'<w:document xmlns:w="{W}"><w:body>{body}</w:body></w:document>')


class DiscoveryTests(unittest.TestCase):
    def test_nested_packages_and_loose_files_without_sidecar_drafts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'manual.docx').touch()
            folder = root / 'pack' / 'nested'
            folder.mkdir(parents=True)
            for name in ['article.docx', '原文.docx', '配图来源.md', '搜索词.txt']:
                (folder / name).touch()
            (folder / '配图清单.json').write_text('{}')
            self.assertEqual({p.name for p in manuscript_files(root)}, {'manual.docx', 'article.docx'})

    def test_loose_manual_docx_embedded_images_need_no_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_word(root / 'manual.docx', '<w:p><w:r><w:t>正文</w:t><w:drawing>'
                       '<a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>'
                       '</w:drawing></w:r></w:p>')
            with patch.object(library.config, 'FORMATTED', root):
                rows = library.scan_formatted()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['配图数'], 1)
            self.assertEqual(rows[0]['主题'], 'manual')

    def test_three_platforms_read_single_cell_boxes_in_order(self):
        for directory, module in [('D:/好多鱼图文/平台/今日头条', 'toutiao_drafts'),
                                  ('D:/好多鱼图文/平台/知乎', 'zhihu_drafts'),
                                  ('D:/好多鱼图文/平台/百家号', 'baijiahao_drafts')]:
            sys.path.insert(0, directory)
            loader = importlib.import_module(module + '.articles').load_article
            with self.subTest(platform=module), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.docx'
                write_word(path, '<w:p><w:r><w:t>before</w:t></w:r></w:p>'
                           '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>inside</w:t></w:r></w:p>'
                           '</w:tc></w:tr></w:tbl><w:p><w:r><w:t>after</w:t></w:r></w:p>')
                article = loader(path)
                self.assertEqual(article.text, 'before\n\ninside\n\nafter')
                self.assertTrue(article.warnings)


if __name__ == '__main__':
    unittest.main()
