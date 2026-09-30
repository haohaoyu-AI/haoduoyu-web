"""文章总库的排版与调取测试。"""

import io
import argparse
import json
import re
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from article_hub import config, layout, library  # noqa: E402
from article_hub.__main__ import do_format  # noqa: E402
from article_hub.docxio import Block, DocxError, read_document, write_document  # noqa: E402


def png_bytes(width: int, height: int, colour=(200, 60, 60)) -> bytes:
    """不依赖 Pillow，手写一张纯色 PNG。"""
    import struct
    import zlib

    raw = b"".join(b"\x00" + bytes(colour) * width for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def body_kinds(path: Path) -> list[str]:
    """按文档顺序返回成稿里的段落类型：title / h2 / p / image。"""
    import xml.etree.ElementTree as ET

    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    kinds = []
    for paragraph in root.find(W + "body").iter(W + "p"):
        if paragraph.find(".//" + W + "drawing") is not None:
            kinds.append("image")
            continue
        style = paragraph.find(W + "pPr/" + W + "pStyle")
        style_id = "" if style is None else style.get(W + "val", "")
        if style_id in {"Title", "Heading1"}:
            kinds.append("title")
        elif style_id.startswith("Heading"):
            kinds.append("h2")
        elif any(node.text for node in paragraph.iter(W + "t")):
            kinds.append("p")
    return kinds


class LayoutTests(unittest.TestCase):
    def test_return_for_images_cleans_unformatted_article_and_backs_up_every_artifact(self):
        from article_hub import image_review, sourcing

        self.make_source()
        self.add_images(1)
        (self.topic / image_review.REVIEW_FILE).write_text(
            json.dumps({'states': {}, 'cover': '', 'revision': 0, 'needs_layout': True}),
            encoding='utf-8',
        )
        (self.topic / '搜索词.txt').write_text('旧搜索词', encoding='utf-8')
        before = {
            path.name: path.read_bytes() for path in self.topic.iterdir()
            if path.is_file() and path.suffix != '.docx'
        }

        returned = image_review.return_for_images(self.topic.name)

        self.assertEqual([path.name for path in self.topic.iterdir()], ['源稿.docx'])
        self.assertFalse(sourcing.has_images(self.topic))
        backup = Path(returned['backup'])
        self.assertEqual(before, {
            path.name: path.read_bytes() for path in backup.iterdir() if path.is_file()
        })
        self.assertEqual(
            library.load_ledger()['文章'][self.topic.name]['配图状态'], '待重新配图'
        )

    def test_return_for_images_is_repeatable_when_article_is_already_clean(self):
        from article_hub import image_review

        self.make_source()
        first = image_review.return_for_images(self.topic.name)
        second = image_review.return_for_images(self.topic.name)

        self.assertNotIn('backup', first)
        self.assertNotIn('backup', second)
        self.assertEqual([path.name for path in self.topic.iterdir()], ['源稿.docx'])

    def test_return_for_images_preserves_old_version_and_queues_clean_source(self):
        from article_hub import image_review, sourcing
        self.make_source()
        self.add_images(1)
        result = layout.format_topic(self.topic)
        layout.archive_source(self.topic, result)
        library.refresh_ledger()
        before = {str(p.relative_to(result.folder)): p.read_bytes() for p in result.folder.rglob('*') if p.is_file()}
        returned = image_review.return_for_images('成稿:' + self.topic.name)
        self.assertFalse(result.folder.exists())
        self.assertEqual([p.name for p in self.topic.iterdir()], ['源稿.docx'])
        self.assertFalse(sourcing.has_images(self.topic))
        backup = Path(returned['backup'])
        self.assertEqual(before, {str(p.relative_to(backup)): p.read_bytes() for p in backup.rglob('*') if p.is_file()})
        self.assertIn(self.topic, sourcing.discover_topics(hint=lambda x: None))
        self.assertNotIn('成稿', library.load_ledger()['文章'][self.topic.name])

    def test_return_for_images_ledger_commit_failure_restores_finished_package(self):
        from unittest.mock import patch
        from article_hub import image_review

        self.make_source()
        self.add_images(1)
        result = layout.format_topic(self.topic)
        layout.archive_source(self.topic, result)
        library.refresh_ledger()
        before_package = {
            str(path.relative_to(result.folder)): path.read_bytes()
            for path in result.folder.rglob('*') if path.is_file()
        }
        before_ledger = library.LEDGER.read_bytes()

        with patch.object(library, '_save_ledger_unlocked', side_effect=OSError('disk full')):
            with self.assertRaisesRegex(OSError, 'disk full'):
                image_review.return_for_images('成稿:' + self.topic.name)

        self.assertEqual(
            before_package,
            {
                str(path.relative_to(result.folder)): path.read_bytes()
                for path in result.folder.rglob('*') if path.is_file()
            },
        )
        self.assertFalse(self.topic.exists())
        recoveries = list((config.DATA / '重新配图备份').rglob('未提交退回'))
        self.assertEqual(len(recoveries), 1)
        self.assertTrue(any(recoveries[0].glob('*.docx')))
        self.assertEqual(library.LEDGER.read_bytes(), before_ledger)

    def test_return_for_images_rejects_collision_without_moving_article(self):
        from article_hub import image_review
        self.make_source()
        self.add_images(1)
        result = layout.format_topic(self.topic)
        layout.archive_source(self.topic, result)
        self.topic.mkdir()
        with self.assertRaisesRegex(ValueError, '同名'):
            image_review.return_for_images('成稿:' + self.topic.name)
        self.assertTrue(result.docx.exists())

    def test_resource_failure_then_candidate_success_keeps_old_final(self):
        from unittest.mock import patch, Mock
        from types import SimpleNamespace
        from article_hub import image_review, sourcing
        self.make_source()
        self.add_images(1)
        old = layout.format_topic(self.topic)
        layout.archive_source(self.topic, old)
        key = '成稿:' + self.topic.name
        before = {str(p.relative_to(old.folder)): p.read_bytes() for p in old.folder.rglob('*') if p.is_file()}
        provider = Mock()
        with patch.object(sourcing, 'build_sources', return_value=([provider], [])), patch.object(sourcing, 'source_topic', side_effect=ValueError('API failed')):
            with self.assertRaisesRegex(ValueError, 'API failed'):
                image_review.resource(key, ['今日头条'])
        self.assertEqual(before, {str(p.relative_to(old.folder)): p.read_bytes() for p in old.folder.rglob('*') if p.is_file()})
        provider.close.assert_called_once()
        def search(folder, **kwargs):
            self.assertTrue(kwargs['force'])
            self.assertFalse(kwargs['do_layout'])
            (folder / 'new.png').write_bytes(png_bytes(1000, 700))
            return SimpleNamespace(chosen=[object()])
        before_docx = old.docx.read_bytes()
        with patch.object(sourcing, 'build_sources', return_value=([Mock()], [])), patch.object(sourcing, 'source_topic', side_effect=search):
            image_review.resource(key, ['今日头条'])
        self.assertTrue((image_review.topic_path(key) / 'new.png').exists())
        self.assertEqual(old.docx.read_bytes(), before_docx)
        report = json.loads((config.DATA / '配图进度.json').read_text(encoding='utf-8'))
        self.assertEqual(report['文章'][0]['图片数'], 1)
        self.assertEqual(report['状态'], '已完成')

    def test_review_selection_excludes_images_and_preserves_originals(self):
        from article_hub import image_review
        self.make_source()
        for name in ['a.png','b.png','c.png']:
            (self.topic / name).write_bytes(png_bytes(1000,700))
        image_review.save_selection(self.topic.name, ['b.png','a.png'])
        result = layout.format_topic(self.topic)
        self.assertEqual(result.images, 2)
        self.assertTrue((self.topic/'c.png').exists())
        manifest = json.loads((result.folder/'配图清单.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['配图'][0]['原始文件名'], 'b.png')
        self.assertNotIn('c.png', [item['原始文件名'] for item in manifest['配图']])

    def test_reviewed_pending_topic_cannot_layout_without_explicit_selection(self):
        from article_hub import image_review
        self.make_source()
        (self.topic / 'a.png').write_bytes(png_bytes(1000, 700))
        image_review.save_review(self.topic.name, {'a.png': 'pending'})
        with self.assertRaisesRegex(layout.LayoutError, '待审核'):
            layout.format_topic(self.topic)

    def test_archived_article_can_be_reviewed_and_regenerated(self):
        from article_hub import image_review
        self.make_source([Block('title', '测试标题'),
                          *[Block('p', f'第{index}段正文。') for index in range(1, 6)]])
        for name in ['a.png','b.png','c.png','d.png','e.png','f.png']:
            (self.topic/name).write_bytes(png_bytes(1000,700))
        result = layout.format_topic(self.topic)
        archive = layout.archive_source(self.topic, result)
        key = '成稿:' + self.topic.name
        rows = image_review.list_topics()
        self.assertEqual(rows[0]['topic'], key)
        self.assertTrue(rows[0]['formatted'])
        position = rows[0]['paragraphs'][0]['position']
        selected = ['b.png','a.png','d.png','e.png','f.png']
        image_review.save_selection(key, selected, {'a.png':position})
        image_review.reformat(key)
        manifest = json.loads((result.folder/'配图清单.json').read_text(encoding='utf-8'))
        self.assertEqual(len(manifest['配图']), 5)
        self.assertEqual(manifest['配图'][0]['原始文件名'], 'b.png')
        self.assertTrue((archive/'c.png').exists())
        self.assertEqual(image_review.topic_path(key), archive)

    def test_image_position_must_reference_body_paragraph(self):
        from article_hub import image_review
        self.make_source()
        (self.topic/'a.png').write_bytes(png_bytes(1000,700))
        with self.assertRaises(ValueError):
            image_review.save_selection(self.topic.name, ['a.png'], {'a.png':99999})
        with self.assertRaises(ValueError):
            image_review.save_selection('成稿:../private', ['a.png'])

    def test_two_images_cannot_share_one_body_anchor(self):
        from article_hub import image_review
        self.make_source()
        for name in ['a.png', 'b.png']:
            (self.topic / name).write_bytes(png_bytes(1000, 700))
        position = next(index for index, block in enumerate(image_review.source_document(self.topic).blocks)
                        if block.kind == 'p')
        with self.assertRaisesRegex(ValueError, '同一段'):
            image_review.save_selection(
                self.topic.name, ['a.png', 'b.png'],
                {'a.png': position, 'b.png': position})

    def test_review_rejects_path_outside_topic(self):
        from article_hub import image_review
        with self.assertRaises(ValueError):
            image_review.save_selection(self.topic.name, ['../../outside.png'])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.unformatted = self.root / "未排版文章"
        self.formatted = self.root / "已排版文章"
        self.topic = self.unformatted / "测试主题"
        self.topic.mkdir(parents=True)
        self._saved = (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
                       library.LEDGER)
        config.UNFORMATTED = self.unformatted
        config.FORMATTED = self.formatted
        config.PREVIEW = self.root / "预览"
        config.DATA = self.root / "data"
        library.LEDGER = config.DATA / "库.json"

    def tearDown(self):
        (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
         library.LEDGER) = self._saved
        self.temp.cleanup()

    def make_source(self, blocks=None, name="源稿.docx"):
        blocks = blocks or [Block("title", "测试标题"), Block("h2", "01 第一节"),
                            Block("p", "第一段正文。"), Block("h2", "02 第二节"),
                            Block("p", "第二段正文。")]
        path = self.topic / name
        write_document(path, blocks, title="测试标题")
        return path

    def add_images(self, count=3):
        names = []
        for index in range(count):
            path = self.topic / f"图片{index + 1}_1_作者_来自小红书网页版.png"
            path.write_bytes(png_bytes(400 + index * 200, 300, (30 * index, 90, 160)))
            names.append(path.name)
        return names

    def test_format_builds_docx_with_images_and_manifest(self):
        self.make_source()
        self.add_images(3)
        result = layout.format_topic(self.topic)
        self.assertTrue(result.docx.exists())
        self.assertEqual(result.images, 3)
        self.assertIn("封面", result.cover)
        with zipfile.ZipFile(result.docx) as archive:
            media = [name for name in archive.namelist() if name.startswith("word/media/")]
        self.assertEqual(len(media), 3)
        # 成稿能被重新读回，标题和正文顺序不变
        document = read_document(result.docx)
        self.assertEqual(document.title, "测试标题")
        self.assertEqual([block.text for block in document.blocks if block.kind != "image"],
                         ["01 第一节", "第一段正文。", "02 第二节", "第二段正文。"])
        manifest = json.loads((result.folder / "配图清单.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["封面"], result.cover)
        self.assertEqual(len(manifest["配图"]), 3)
        self.assertTrue((result.folder / "预览.html").exists())
        self.assertTrue((result.folder / "原文.docx").exists())
        self.assertTrue((result.folder / "配图" / result.cover).exists())

    def test_cover_is_first_image_and_rest_spread_over_sections(self):
        self.make_source([Block("title", "测试标题"), Block("h2", "01 第一节"),
                          Block("p", "第一段正文。"), Block("p", "第二段正文。"),
                          Block("h2", "02 第二节"), Block("p", "第三段正文。"),
                          Block("p", "第四段正文。")])
        self.add_images(5)
        result = layout.format_topic(self.topic)
        kinds = body_kinds(result.docx)
        self.assertEqual(kinds[0], "title")
        self.assertEqual(kinds[1], "image")             # 封面紧跟标题
        self.assertEqual(kinds[2], "h2")                # 之后才开始正文
        image_positions = [index for index, item in enumerate(kinds) if item == "image"]
        self.assertEqual(len(image_positions), 5)
        # 不允许两张图挤在一起
        for before, after in zip(image_positions, image_positions[1:]):
            self.assertGreater(after - before, 1)

    def test_source_files_are_never_modified(self):
        source = self.make_source()
        images = self.add_images(2)
        before = {name: (self.topic / name).read_bytes() for name in [source.name] + images}
        layout.format_topic(self.topic)
        for name, data in before.items():
            self.assertEqual((self.topic / name).read_bytes(), data)

    def test_existing_target_requires_force(self):
        self.make_source()
        self.add_images(1)
        layout.format_topic(self.topic)
        with self.assertRaisesRegex(layout.LayoutError, "成稿已存在"):
            layout.format_topic(self.topic)
        result = layout.format_topic(self.topic, force=True)
        self.assertTrue(result.docx.exists())

    def test_two_word_files_stop_the_topic(self):
        self.make_source()
        self.make_source(name="另一份.docx")
        with self.assertRaisesRegex(layout.LayoutError, "2 份 Word"):
            layout.format_topic(self.topic)

    def test_order_override_and_max_images(self):
        self.make_source()
        self.add_images(4)
        names = sorted(path.name for path in self.topic.glob("*.png"))
        (self.topic / "配图顺序.txt").write_text("\n".join([names[2], names[0]]) + "\n",
                                                 encoding="utf-8")
        result = layout.format_topic(self.topic, max_images=2)
        manifest = json.loads((result.folder / "配图清单.json").read_text(encoding="utf-8"))
        used = [item for item in manifest["配图"] if item["角色"] != "未使用"]
        self.assertEqual(used[0]["原始文件名"], names[2])
        self.assertEqual(used[1]["原始文件名"], names[0])
        self.assertTrue(manifest["配图"][-1]["角色"] == "未使用")

    def test_topic_without_images_still_formats(self):
        self.make_source()
        result = layout.format_topic(self.topic)
        self.assertEqual(result.images, 0)
        self.assertTrue(any("没有图片" in warning for warning in result.warnings))
        document = read_document(result.docx)
        self.assertEqual(document.title, "测试标题")

    def test_command_archives_complete_source_after_success(self):
        source = self.make_source()
        images = self.add_images(2)
        (self.topic / "配图顺序.txt").write_text(images[0], encoding="utf-8")
        original = {path.name: path.read_bytes() for path in [source, *(self.topic / name for name in images),
                                                               self.topic / "配图顺序.txt"]}
        args = argparse.Namespace(only=None, force=False, 图注=False, 最多图片=9)
        self.assertEqual(do_format(args), 0)
        self.assertFalse(self.topic.exists())
        archive = self.formatted / self.topic.name / "原始素材"
        for name, data in original.items():
            self.assertEqual((archive / name).read_bytes(), data)
        self.assertTrue((self.formatted / self.topic.name / "测试标题.docx").exists())

    def test_command_keeps_source_if_format_fails(self):
        source = self.make_source()
        self.make_source(name="另一份.docx")
        args = argparse.Namespace(only=None, force=False, 图注=False, 最多图片=9)
        self.assertEqual(do_format(args), 1)
        self.assertTrue(source.exists())
        self.assertTrue((self.topic / "另一份.docx").exists())
        self.assertFalse((self.formatted / self.topic.name / "原始素材").exists())

    def _add_marker_style(self, path: Path) -> None:
        """往源稿样式表里塞一个自定义样式，用来证明成稿沿用了源稿的样式表。"""
        with zipfile.ZipFile(path) as archive:
            parts = {name: archive.read(name) for name in archive.namelist()}
        parts["word/styles.xml"] = parts["word/styles.xml"].decode("utf-8").replace(
            "</w:styles>",
            '<w:style w:type="paragraph" w:styleId="BrandTitle">'
            '<w:name w:val="BrandTitle"/></w:style></w:styles>',
        ).encode("utf-8")
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in parts.items():
                archive.writestr(name, data)

    def test_output_keeps_source_styles_and_paragraphs(self):
        """成稿要照源稿写：样式表、标题与小标题的段落原样保留，只多出图片。"""
        source = self.make_source()
        self._add_marker_style(source)
        self.add_images(2)
        with zipfile.ZipFile(source) as archive:
            source_document = archive.read("word/document.xml").decode("utf-8")
        source_paragraphs = [
            fragment for fragment in re.findall(r"<w:p\b.*?</w:p>", source_document, re.S)
            if re.search(r"<w:t\b", fragment)
        ]

        result = layout.format_topic(self.topic)
        with zipfile.ZipFile(result.docx) as archive:
            styles = archive.read("word/styles.xml").decode("utf-8")
            document = archive.read("word/document.xml").decode("utf-8")

        self.assertIn("BrandTitle", styles)          # 源稿样式表被整份沿用
        self.assertIn('w:styleId="Heading1"', styles)
        for fragment in source_paragraphs:           # 正文段落逐段原样保留
            self.assertIn(fragment, document)
        self.assertEqual(document.count("<w:drawing>"), 2)

    def test_template_writer_refuses_mismatched_blocks(self):
        source = self.make_source()
        with self.assertRaisesRegex(DocxError, "对不上"):
            write_document(self.topic / "另一份.docx",
                           [Block("title", "标题"), Block("p", "源稿里没有这段话")],
                           title="标题", template=source)


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self._saved = (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
                       library.LEDGER)
        config.UNFORMATTED = self.root / "未排版文章"
        config.FORMATTED = self.root / "已排版文章"
        config.PREVIEW = self.root / "预览"
        config.DATA = self.root / "data"
        library.LEDGER = config.DATA / "库.json"
        config.ensure_directories()
        self.topic = config.FORMATTED / "主题"
        self.topic.mkdir(parents=True)
        write_document(self.topic / "标题.docx",
                       [Block("title", "标题"), Block("p", "正文")], title="标题")
        (self.topic / "配图清单.json").write_text(
            json.dumps({"标题": "标题", "封面": "01-封面.jpg",
                        "配图": [{"角色": "正文配图", "文件": "01-封面.jpg"}]},
                       ensure_ascii=False),
            encoding="utf-8")

    def tearDown(self):
        (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
         library.LEDGER) = self._saved
        self.temp.cleanup()

    def test_ledger_records_article_and_status(self):
        data = library.refresh_ledger()
        self.assertIn("主题", data["文章"])
        self.assertEqual(data["文章"]["主题"]["标题"], "标题")
        rows = library.status_rows()
        self.assertEqual(rows[0]["状态"], "已排版")
        index = library.write_index(rows)
        self.assertTrue(index.exists())

    def test_title_shows_platforms_it_was_sent_to(self):
        data = library.refresh_ledger()
        record = data["文章"]["主题"]
        record["分发"]["知乎"] = {"标题": "标题"}
        library.save_ledger(data)
        rows = library.status_rows()
        row = next(item for item in rows if item["主题"] == "主题")
        self.assertEqual(row["显示标题"], "标题（知乎）")

        data = library.refresh_ledger()
        data["文章"]["主题"]["分发"]["今日头条"] = {"标题": "标题"}
        library.save_ledger(data)
        rows = library.status_rows()
        row = next(item for item in rows if item["主题"] == "主题")
        self.assertEqual(row["显示标题"], "标题（知乎头条）")
        index = library.write_index(rows)
        self.assertIn("标题（知乎头条）", index.read_text(encoding="utf-8"))

    def test_toutiao_is_a_dispatch_platform(self):
        self.assertIn("今日头条", config.PLATFORM_ORDER)
        self.assertEqual(config.platform_marks(["百家号", "今日头条", "知乎"]), "知乎头条百家号")
        self.assertEqual(config.title_with_platforms("文章A", []), "文章A")
        self.assertEqual(config.title_with_platforms("文章A", ["今日头条"]), "文章A（头条）")
        self.assertEqual(config.title_with_platforms("文章B", ["今日头条", "知乎"]), "文章B（知乎头条）")


class DispatchTests(unittest.TestCase):
    """调取：成稿复制到平台待发文章，并在标题上标出已分发平台。"""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self._saved = (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
                       config.SETTINGS, library.LEDGER)
        config.UNFORMATTED = self.root / "未排版文章"
        config.FORMATTED = self.root / "已排版文章"
        config.PREVIEW = self.root / "预览"
        config.DATA = self.root / "data"
        config.SETTINGS = config.DATA / "平台设置.json"
        library.LEDGER = config.DATA / "库.json"
        config.ensure_directories()
        config.SETTINGS.write_text(json.dumps({
            "今日头条": {"root": str(self.root / "今日头条"), "pending": "待发文章",
                         "sent": "已发文章", "receipts": "data"},
            "知乎": {"root": str(self.root / "知乎自动发文"), "pending": "待发文章",
                     "sent": "已发文章", "receipts": "data"},
        }, ensure_ascii=False), encoding="utf-8")
        self.topic = config.FORMATTED / "主题"
        self.topic.mkdir(parents=True)
        write_document(self.topic / "标题.docx",
                       [Block("title", "标题"), Block("p", "正文")], title="标题")
        (self.topic / "配图清单.json").write_text(
            json.dumps({"标题": "标题", "封面": "01-封面.jpg",
                        "配图": [{"角色": "正文配图", "文件": "01-封面.jpg"}]},
                       ensure_ascii=False),
            encoding="utf-8")

    def tearDown(self):
        (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
         config.SETTINGS, library.LEDGER) = self._saved
        self.temp.cleanup()

    def test_dispatch_to_toutiao_copies_file_and_marks_title(self):
        result = library.dispatch("今日头条")
        self.assertEqual([title for title, _ in result.copied], ["标题"])
        self.assertEqual([(topic, title) for topic, title, _ in result.copied_topics],
                         [("主题", "标题")])
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        self.assertTrue(target.exists())
        self.assertEqual(library.load_ledger()["文章"]["主题"]["分发平台"], ["今日头条"])
        self.assertEqual(library.status_rows()[0]["显示标题"], "标题（头条）")

    def test_second_dispatch_copies_again_on_purpose(self):
        """同一篇、同一版本可以安全重试。"""
        library.dispatch("今日头条")
        result = library.dispatch("今日头条")
        self.assertEqual([title for title, _ in result.copied], ["标题"])

    def test_dispatch_refuses_normalized_title_collision_before_staging(self):
        other = config.FORMATTED / "另一个主题"
        other.mkdir(parents=True)
        write_document(other / "标 题.docx",
                       [Block("title", "标 题"), Block("p", "另一篇正文")], title="标 题")
        (other / "配图清单.json").write_text(
            json.dumps({"标题": "标 题", "封面": "01-封面.jpg",
                        "配图": [{"角色": "正文配图", "文件": "01-封面.jpg"}]},
                       ensure_ascii=False),
            encoding="utf-8")

        with self.assertRaisesRegex(library.TitleCollisionError, "多个主题"):
            library.dispatch("今日头条")

        self.assertFalse((self.root / "今日头条" / "待发文章").exists())

    def test_dispatch_refuses_collision_with_existing_ledger_record(self):
        data = library.refresh_ledger()
        data["文章"]["已归档旧主题"] = {"标题": "标 题", "分发": {}, "已发": {}}
        library.save_ledger(data)

        with self.assertRaisesRegex(library.TitleCollisionError, "已归档旧主题"):
            library.dispatch("今日头条", only="主题")

        self.assertFalse((self.root / "今日头条" / "待发文章").exists())

    def test_unrelated_legacy_collision_does_not_block_selected_article(self):
        data = library.refresh_ledger()
        data["文章"]["旧主题一"] = {"标题": "另一标题", "分发": {}, "已发": {}}
        data["文章"]["旧主题二"] = {"标题": "另 一 标 题", "分发": {}, "已发": {}}
        library.save_ledger(data)

        result = library.dispatch("今日头条", only="主题")

        self.assertEqual([title for title, _ in result.copied], ["标题"])

    def test_dispatch_keeps_existing_different_version_without_overwrite(self):
        library.dispatch("今日头条")
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        original = target.read_bytes()
        write_document(self.topic / "标题.docx",
                       [Block("title", "标题"), Block("p", "已经修改的正文")], title="标题")

        result = library.dispatch("今日头条")
        self.assertEqual(result.copied, [])
        self.assertIn("同名不同版本", result.skipped[0][1])
        self.assertEqual(target.read_bytes(), original)

        result = library.dispatch("今日头条", overwrite=True)
        self.assertEqual([title for title, _ in result.copied], ["标题"])
        self.assertNotEqual(target.read_bytes(), original)

    def test_new_pending_copy_is_removed_when_ledger_commit_fails(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        with patch.object(library, "_save_ledger_unlocked",
                          side_effect=OSError("模拟台账提交失败")):
            with self.assertRaisesRegex(OSError, "台账提交失败"):
                library.dispatch("今日头条")
        self.assertFalse(target.exists())

    def test_new_pending_copy_changed_by_another_actor_is_not_deleted(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"

        def fail_after_external_change(_data):
            target.write_bytes(b"another actor's version")
            raise OSError("模拟台账提交失败")

        with patch.object(library, "_save_ledger_unlocked",
                          side_effect=fail_after_external_change):
            with self.assertRaisesRegex(OSError, "台账提交失败"):
                library.dispatch("今日头条")
        self.assertEqual(target.read_bytes(), b"another actor's version")

    def test_new_pending_copy_failure_leaves_no_partial_file_or_temporary(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"

        def fail_mid_copy(_source, output, *_args, **_kwargs):
            output.write(b"partial pending file")
            output.flush()
            raise OSError("模拟复制中断")

        with patch.object(library.shutil, "copyfileobj", side_effect=fail_mid_copy):
            with self.assertRaisesRegex(OSError, "复制中断"):
                library.dispatch("今日头条")

        self.assertFalse(target.exists())
        self.assertEqual(list(target.parent.glob(".*.分发中.tmp")), [])

    def test_new_pending_copy_failure_does_not_delete_concurrent_target(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        concurrent = b"concurrent complete version"

        def fail_after_concurrent_create(_source, output, *_args, **_kwargs):
            output.write(b"our partial pending file")
            output.flush()
            target.write_bytes(concurrent)
            raise OSError("模拟复制中断")

        with patch.object(library.shutil, "copyfileobj",
                          side_effect=fail_after_concurrent_create):
            with self.assertRaisesRegex(OSError, "复制中断"):
                library.dispatch("今日头条")

        self.assertEqual(target.read_bytes(), concurrent)
        self.assertEqual(list(target.parent.glob(".*.分发中.tmp")), [])

    def test_overwritten_pending_copy_is_restored_when_ledger_commit_fails(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"original pending version")
        before = target.read_bytes()

        with patch.object(library, "_save_ledger_unlocked",
                          side_effect=OSError("模拟台账提交失败")):
            with self.assertRaisesRegex(OSError, "台账提交失败"):
                library.dispatch("今日头条", overwrite=True)
        self.assertEqual(target.read_bytes(), before)

    def test_overwritten_pending_changed_before_rollback_is_not_restored(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"original pending version")
        concurrent = b"concurrent newer version"

        def fail_after_external_change(_data):
            target.write_bytes(concurrent)
            raise OSError("模拟台账提交失败")

        with patch.object(library, "_save_ledger_unlocked",
                          side_effect=fail_after_external_change):
            with self.assertRaisesRegex(OSError, "台账提交失败"):
                library.dispatch("今日头条", overwrite=True)

        self.assertEqual(target.read_bytes(), concurrent)
        self.assertEqual(list(target.parent.glob(".*.分发中.tmp")), [])

    def test_overwrite_copy_failure_preserves_original_and_removes_temporary(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        target.parent.mkdir(parents=True)
        original = b"original pending version"
        target.write_bytes(original)

        def fail_mid_copy(_source, output, *_args, **_kwargs):
            output.write(b"partial replacement")
            output.flush()
            raise OSError("模拟覆盖复制中断")

        with patch.object(library.shutil, "copyfileobj", side_effect=fail_mid_copy):
            with self.assertRaisesRegex(OSError, "覆盖复制中断"):
                library.dispatch("今日头条", overwrite=True)

        self.assertEqual(target.read_bytes(), original)
        self.assertEqual(list(target.parent.glob(".*.分发中.tmp")), [])

    def test_overwrite_replace_failure_preserves_original_and_removes_temporary(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        target.parent.mkdir(parents=True)
        original = b"original pending version"
        target.write_bytes(original)
        real_replace = library.os.replace

        def fail_target_replace(source, destination):
            if Path(destination) == target:
                raise OSError("模拟原子替换失败")
            return real_replace(source, destination)

        with patch.object(library.os, "replace", side_effect=fail_target_replace):
            with self.assertRaisesRegex(OSError, "原子替换失败"):
                library.dispatch("今日头条", overwrite=True)

        self.assertEqual(target.read_bytes(), original)
        self.assertEqual(list(target.parent.glob(".*.分发中.tmp")), [])

    def test_overwrite_preserves_concurrent_replacement_before_install(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"original pending version")
        concurrent = b"concurrent newer version"
        real_stage = library._write_pending_temporary

        def stage_then_replace(source, destination):
            staged = real_stage(source, destination)
            target.write_bytes(concurrent)
            return staged

        with patch.object(library, "_write_pending_temporary",
                          side_effect=stage_then_replace):
            with self.assertRaisesRegex(OSError, "覆盖前被其他进程修改"):
                library.dispatch("今日头条", overwrite=True)

        self.assertEqual(target.read_bytes(), concurrent)
        self.assertEqual(list(target.parent.glob(".*.分发中.tmp")), [])

    def test_identical_existing_pending_copy_survives_failed_ledger_commit(self):
        target = self.root / "今日头条" / "待发文章" / "标题.docx"
        target.parent.mkdir(parents=True)
        source = self.topic / "标题.docx"
        target.write_bytes(source.read_bytes())
        before = target.read_bytes()

        with patch.object(library, "_save_ledger_unlocked",
                          side_effect=OSError("模拟台账提交失败")):
            with self.assertRaisesRegex(OSError, "台账提交失败"):
                library.dispatch("今日头条")
        self.assertEqual(target.read_bytes(), before)

    def _sync_one_receipt(self, data: dict, receipt: dict) -> dict:
        folder = self.root / "今日头条" / "data"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "receipt.json").write_text(
            json.dumps(receipt, ensure_ascii=False), encoding="utf-8"
        )
        return library._sync_receipts_into_unlocked(data)

    def test_receipt_article_id_selects_one_duplicate_title(self):
        first_id = "11111111-1111-4111-8111-111111111111"
        second_id = "22222222-2222-4222-8222-222222222222"
        data = {"文章": {
            "主题一": {"标题": "相同标题", "文章ID": first_id},
            "主题二": {"标题": "相同标题", "文章ID": second_id},
        }}
        self._sync_one_receipt(data, {
            "platform": "今日头条", "title": "相同标题", "article_id": second_id,
            "status": "verified", "draft_url": "https://example.test/draft",
        })
        self.assertNotIn("已发", data["文章"]["主题一"])
        self.assertEqual(data["文章"]["主题二"]["已发"]["今日头条"]["状态"], "verified")

    def test_id_bearing_receipt_never_falls_back_to_title(self):
        valid_id = "11111111-1111-4111-8111-111111111111"
        duplicate_id = "22222222-2222-4222-8222-222222222222"
        cases = [
            ("unknown", {"唯一主题": {"标题": "唯一标题", "文章ID": valid_id}},
             "33333333-3333-4333-8333-333333333333"),
            ("invalid", {"唯一主题": {"标题": "唯一标题", "文章ID": valid_id}}, "not-a-uuid"),
            ("empty", {"唯一主题": {"标题": "唯一标题", "文章ID": valid_id}}, ""),
            ("duplicate", {
                "主题一": {"标题": "唯一标题", "文章ID": duplicate_id},
                "主题二": {"标题": "其他标题", "文章ID": duplicate_id},
            }, duplicate_id),
        ]
        for label, records, receipt_id in cases:
            with self.subTest(label=label):
                data = {"文章": records}
                self._sync_one_receipt(data, {
                    "platform": "今日头条", "title": "唯一标题",
                    "article_id": receipt_id, "status": "verified",
                })
                self.assertTrue(all("已发" not in record for record in records.values()))

    def test_receipt_without_article_id_uses_unique_title_fallback(self):
        data = {"文章": {"主题": {
            "标题": "唯一标题", "文章ID": "11111111-1111-4111-8111-111111111111",
        }}}
        self._sync_one_receipt(data, {
            "platform": "今日头条", "title": "唯一标题", "status": "verified",
        })
        self.assertEqual(data["文章"]["主题"]["已发"]["今日头条"]["状态"], "verified")


if __name__ == "__main__":
    unittest.main()
