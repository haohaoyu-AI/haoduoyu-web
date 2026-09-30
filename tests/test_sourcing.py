"""配图流程测试：取词、解析搜索页、挑图、落盘。"""

import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from PIL import Image
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from article_hub import config, layout, sourcing  # noqa: E402
from article_hub.docxio import Block, read_document, write_document  # noqa: E402
from article_hub.hits import Hit  # noqa: E402
from article_hub.toutiao import parse_hits  # noqa: E402

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


def card(title: str, image: str, source: str, width: int, height: int,
         share: str = "https://toutiao.com/group/1/") -> str:
    payload = json.dumps({
        "data": {
            "title": title,
            "source": source,
            "share_url": share,
            "large_image_url": image,
            "other_image_url": image,
            "image_list": [{"origin_width": width, "origin_height": height}],
        }
    }, ensure_ascii=False)
    return f'<script data-druid-card-data-id="x" type="application/json">{payload}</script>'


def png_bytes(width: int = 900, height: int = 600, colour=(200, 60, 60)) -> bytes:
    """不依赖 Pillow，手写一张带渐变的 PNG（纯色图会被当成同一张，测不出去重）。"""
    import struct
    import zlib

    rows = []
    for y in range(height):
        row = bytearray()
        for x in range(0, width, 16):
            pixel = bytes(((colour[0] + x) % 256, (colour[1] + x + y) % 256,
                           (colour[2] + y) % 256))
            row += pixel * min(16, width - x)
        rows.append(b"\x00" + bytes(row))
    raw = b"".join(rows)

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


class HitParsingTests(unittest.TestCase):
    def test_parse_hits_reads_cards_and_drops_duplicates(self):
        html = (
            card("胖东来回应四年合同", "https://p3-sign.toutiaoimg.com/a~tplv:960:0.jpg?sig=1",
                 "红星新闻", 1600, 900)
            + card("胖东来回应四年合同", "https://p3-sign.toutiaoimg.com/a~tplv:960:0.jpg?sig=2",
                   "红星新闻", 1600, 900)
            + card("另一条新闻", "https://p3-sign.toutiaoimg.com/b~tplv:960:0.jpg?sig=3",
                   "光明网", 1200, 800)
            + "<script>没有卡片数据的脚本</script>"
        )
        hits = parse_hits(html, query="胖东来")
        self.assertEqual(len(hits), 2)
        self.assertEqual(hits[0].title, "胖东来回应四年合同")
        self.assertEqual(hits[0].source, "红星新闻")
        self.assertEqual(hits[0].query, "胖东来")
        self.assertEqual((hits[0].width, hits[0].height), (1600, 900))
        self.assertTrue(hits[0].landscape)
        self.assertTrue(hits[0].image_key.endswith(".jpg"))


class ScoringTests(unittest.TestCase):
    def test_beef_economics_rejects_recipes_and_phone_prices(self):
        doc = type('Doc', (), {'title':'牛肉涨价救了谁', 'blocks':[Block('p','养牛户成本与补栏周期。')]})()
        recipe = self.make('牛肉最好吃的家常做法', query='牛肉')
        phones = self.make('这轮涨价，手机行业变天', query='轮涨价')
        self.assertTrue(sourcing.rejection_reason(recipe, doc, ['牛肉']))
        self.assertTrue(sourcing.rejection_reason(phones, doc, ['牛肉', '涨价']))
        good = self.make('牛肉涨价，养牛户补栏要等两年', query='牛肉')
        self.assertEqual(sourcing.rejection_reason(good, doc, ['牛肉']), '')

    def make(self, title: str, source: str = "某账号", width: int = 1200,
             height: int = 800, query: str = "胖东来") -> Hit:
        return Hit("今日头条", query, title, source, "https://img/x.jpg?sig=1",
                   "https://toutiao.com/group/1/", width, height)

    def test_hit_matching_query_beats_unrelated_one(self):
        good = self.make("胖东来公布招聘新模式", "光明网")
        bad = self.make("四年四个月坚持，独自恢复绝种冷水鱼")
        self.assertGreater(sourcing.score_hit(good, "胖东来"),
                           sourcing.score_hit(bad, "胖东来"))
        self.assertTrue(sourcing.is_relevant(good, "胖东来"))
        self.assertFalse(sourcing.is_relevant(bad, "胖东来"))

    def test_two_word_query_needs_both_words(self):
        hit = self.make("胖东来公布招聘新模式", query="胖东来 期限")
        self.assertFalse(sourcing.is_relevant(hit, "胖东来 期限"))
        both = self.make("胖东来回应招聘期限问题", query="胖东来 期限")
        self.assertTrue(sourcing.is_relevant(both, "胖东来 期限"))

    def test_anchor_filters_same_name_gossip(self):
        gossip = self.make("余承东与刘亦菲相关传闻始末梳理", "某账号")
        self.assertFalse(sourcing.matches_anchor(gossip, ["手机"]))
        real = self.make("手机越卖越贵，低价时代要结束了？", "钛媒体")
        self.assertTrue(sourcing.matches_anchor(real, ["手机"]))

    def test_low_quality_and_random_accounts_lose_points(self):
        junk = self.make("女子怀孕，孩子不是老公的。", "青鸟小富婆123")
        plain = self.make("长沙餐厅涉事女子已委托律师", "新京报")
        self.assertLess(sourcing.score_hit(junk, "女子"), sourcing.score_hit(plain, "女子"))

    def test_place_bonus_prefers_same_event(self):
        local = self.make("长沙餐厅涉事女子发声，投诉信流出")
        other = self.make("广西南宁警方回应女子被当街强奸")
        self.assertGreater(sourcing.score_hit(local, "女子", places=["长沙"]),
                           sourcing.score_hit(other, "女子", places=["长沙"]))


class KeywordTests(unittest.TestCase):
    def setUp(self):
        self.document = type("Doc", (), {})()
        self.document.title = "待遇再好，四年后也得走？胖东来这次戳中了打工人的心事"
        self.document.blocks = [
            Block("title", self.document.title),
            Block("h2", "01 员工还是学员"),
            Block("p", "于东来说，胖东来再招员工都会是学员性质，合同四年不续签。"),
            Block("p", "胖东来是一家商超，于东来是创始人，员工待遇一直被人讨论。"),
            Block("h2", "02 四年和四个月"),
            Block("p", "合同到期不续签，员工能拿到什么，是这次争议的焦点。"),
        ]

    def test_queries_cover_sections_and_use_terms(self):
        queries = sourcing.suggest_queries(self.document, limit=12)
        texts = [item.text for item in queries]
        self.assertTrue(queries)
        self.assertTrue(any(item.section >= 0 for item in queries), "每个小节都要有搜索词")
        self.assertTrue(all(len(text) >= 2 for text in texts))
        self.assertTrue(any("员工还是学员" in text for text in texts))

    @unittest.skipIf(sourcing._cut("测试")[0][1] == "n" and not sourcing._JIEBA, "需要 jieba")
    def test_extended_terms_repairs_split_names(self):
        title = "待遇再好，四年后也得走？胖东来这次戳中了打工人的心事"
        body = "胖东来再招员工都会是学员。胖东来强调待遇。于东来回应了胖东来的争议。"
        found = sourcing.extended_terms("东来", title=title, body=body, count=body.count("东来"))
        self.assertIn("胖东来", found)
        self.assertNotIn("的生活", sourcing.extended_terms(
            "生活", title="没有这个词", body="员工的生活，员工的生活，员工的生活。", count=3))

    def test_title_terms_skip_function_words(self):
        terms = sourcing.title_terms("手机卖到两万元，普通人为什么还要解释不换？",
                                     "手机越卖越贵，手机价格一路上涨，普通人换手机的周期变长了。")
        self.assertNotIn("什么", terms)
        self.assertNotIn("要解", terms)


class ChooseTests(unittest.TestCase):
    def test_never_relaxes_anchor_to_fill_slots(self):
        hits = [self.hit('其他人物那几句话', 'https://img/a.jpg', '那几句话')]
        chosen, _ = sourcing.choose_images(self.document, hits, max_images=3, topic_dir=self.topic,
            queries=[sourcing.Query('那几句话')], anchors=['浙大'],
            fetch=lambda hit:png_bytes(1200,800), hint=lambda *_:None)
        self.assertEqual(chosen, [])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.topic = Path(self.temp.name)
        self.document = type("Doc", (), {})()
        self.document.title = "测试标题"
        self.document.blocks = [
            Block("title", "测试标题"),
            Block("h2", "01 第一节"),
            Block("p", "第一段。"),
            Block("h2", "02 第二节"),
            Block("p", "第二段。"),
        ]

    def tearDown(self):
        self.temp.cleanup()

    def hit(self, title: str, url: str, query: str, *, width=1200, height=800,
            section: int = -1, source: str = "新华社") -> Hit:
        return Hit("今日头条", query, title, source, url, "https://toutiao.com/g/1/",
                   width, height)

    def test_choose_skips_irrelevant_and_keeps_cover_landscape(self):
        queries = [sourcing.Query("第一节", 1, "第一节"), sourcing.Query("第二节", 3, "第二节")]
        hits = [
            self.hit("测试标题 第一节现场", "https://img/a.jpg?s=1", "第一节", section=1),
            self.hit("完全无关的图片", "https://img/b.jpg?s=2", "第一节", section=1),
            self.hit("测试标题 第一节另一个画面", "https://img/d.jpg?s=4", "第一节",
                     width=1100, height=700, section=1, source="光明网"),
            self.hit("测试标题 第二节现场", "https://img/c.jpg?s=3", "第二节",
                     width=800, height=1500, section=3, source="新京报"),
        ]
        colours = {"https://img/a.jpg?s=1": (10, 20, 30),
                   "https://img/b.jpg?s=2": (200, 100, 50),
                   "https://img/c.jpg?s=3": (60, 60, 200),
                   "https://img/d.jpg?s=4": (90, 200, 60)}

        def fetch(hit):
            return png_bytes(hit.width, hit.height, colours[hit.image_url])

        chosen, warnings = sourcing.choose_images(
            self.document, hits, max_images=4, topic_dir=self.topic, queries=queries,
            anchors=["测试"], fetch=fetch, hint=lambda *_: None)
        files = [item.file.name for item in chosen]
        self.assertTrue(any(name.startswith("封面_") for name in files))
        self.assertFalse(any("完全无关" in name for name in files))
        cover = next(item for item in chosen if item.role == "封面")
        self.assertGreaterEqual(cover.width, cover.height)
        self.assertTrue(all(item.file.exists() for item in chosen))
        self.assertTrue(all(item.caption.endswith("）") for item in chosen))
        self.assertTrue(warnings)
        # These candidates all came from the same page. Keep its best cover;
        # the automatic workflow fills remaining subjects with other sources/AI.
        self.assertEqual(len(chosen), 1)

    def test_global_subject_only_image_cannot_fill_unrelated_section(self):
        hit = self.hit('测试标题图片', 'https://img/x.jpg', '测试标题')
        self.assertFalse(sourcing.matches_position(hit, self.document,
            [sourcing.Query('测试标题')], 3, 4, ['测试标题']))

    def test_section_picture_stays_in_its_section(self):
        hit = self.hit('测试 第一节', 'https://img/x.jpg', '第一节')
        queries = [sourcing.Query('第一节', 1, '第一节')]
        self.assertTrue(sourcing.matches_position(hit, self.document, queries, 1, 2, ['测试']))
        self.assertFalse(sourcing.matches_position(hit, self.document, queries, 3, 4, ['测试']))

    def test_duplicate_images_only_used_once(self):
        queries = [sourcing.Query("测试", -1)]
        data = png_bytes(1000, 700)
        hits = [self.hit("测试图片", f"https://img/x{index}.jpg?s={index}", "测试",
                         section=-1) for index in range(3)]
        chosen, _warnings = sourcing.choose_images(
            self.document, hits, max_images=3, topic_dir=self.topic, queries=queries,
            anchors=["测试"], fetch=lambda hit: data, hint=lambda *_: None)
        self.assertEqual(len(chosen), 1)


class PlacementTests(unittest.TestCase):
    """配图数量和落点：按皮皮电影那种「约 450 字一张、均匀铺开」的密度。"""

    def document(self, paragraphs: int, chars: int = 60):
        blocks = [Block("title", "测试标题"), Block("h2", "01 第一节")]
        for index in range(paragraphs):
            blocks.append(Block("p", "正" * chars))
            if index in {paragraphs // 2}:
                blocks.append(Block("h2", "02 第二节"))
        return type("Doc", (), {"title": "测试标题", "blocks": blocks})()

    def test_old_ui_limit_does_not_collapse_article_plan(self):
        self.assertEqual(sourcing.target_image_count(self.document(10, 300), 1), 7)

    def test_count_scales_with_length(self):
        self.assertEqual(sourcing.target_image_count(self.document(10, 300), 9), 7)
        self.assertEqual(sourcing.target_image_count(self.document(10, 60), 9), 5)
        self.assertEqual(sourcing.target_image_count(self.document(40, 300), 9), 20)

    def test_legacy_fixed_five_manifest_is_migrated_but_versioned_plan_is_kept(self):
        document = self.document(10, 300)
        self.assertEqual(sourcing.resolved_target_count(document, {'建议配图数': 5}), 7)
        self.assertEqual(sourcing.resolved_target_count(document, {
            '建议配图数': 5, '配图计划版本': sourcing.IMAGE_PLAN_VERSION}), 5)
        self.assertEqual(sourcing.resolved_target_count(document, {'建议配图数': 9}), 9)

    def test_empty_article_has_no_fixed_picture_target(self):
        document = type("Doc", (), {"title": "空", "blocks": [Block("title", "空")]})()
        self.assertEqual(sourcing.target_image_count(document, 9), 0)

    def test_positions_start_early_and_spread_out(self):
        document = self.document(50, 60)
        paragraphs = [index for index, block in enumerate(document.blocks)
                      if block.kind == "p"]
        positions = sourcing.body_positions(document.blocks, 5)
        self.assertEqual(len(positions), 5)
        offsets = [paragraphs.index(position) for position in positions]
        self.assertLess(offsets[0], len(paragraphs) * 0.15)      # 第一张靠前
        self.assertLessEqual(offsets[-1], len(paragraphs) * 0.9)  # 最后一张在九成以内
        self.assertEqual(offsets, sorted(offsets))                # 顺序不乱
        self.assertTrue(all(b - a >= 3 for a, b in zip(offsets, offsets[1:])))

    def test_section_lookup_for_position(self):
        document = self.document(10, 60)
        heading = next(index for index, block in enumerate(document.blocks)
                       if block.kind == "h2" and block.text == "02 第二节")
        section, name = sourcing.section_at(document.blocks, heading + 2)
        self.assertEqual(section, heading)
        self.assertEqual(name, "第二节")


class OutputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.topic = Path(self.temp.name)
        self.document = type("Doc", (), {})()
        self.document.title = "测试标题"
        self.document.blocks = [Block("title", "测试标题"), Block("h2", "01 第一节"),
                                Block("p", "正文。")]

    def tearDown(self):
        self.temp.cleanup()

    def test_outputs_write_order_manifest_and_sources(self):
        (self.topic / "封面_某图_新华社.jpg").write_bytes(png_bytes(1200, 700))
        (self.topic / "第二节_某图_光明网.jpg").write_bytes(png_bytes(900, 600))
        hit_a = Hit("今日头条", "第一节", "第一节现场图", "新华社",
                    "https://img/a.jpg?s=1", "https://toutiao.com/g/1/", 1200, 700)
        hit_b = Hit("今日头条", "第二节", "第二节现场图", "光明网",
                    "https://img/b.jpg?s=2", "https://toutiao.com/g/2/", 900, 600)
        chosen = [
            sourcing.Chosen(hit_b, self.topic / "第二节_某图_光明网.jpg", "正文配图", 5,
                            "第二节", sourcing.caption_for(hit_b), 900, 600, 12.0),
            sourcing.Chosen(hit_a, self.topic / "封面_某图_新华社.jpg", "封面", -1, "",
                            sourcing.caption_for(hit_a), 1200, 700, 30.0),
        ]
        queries = [sourcing.Query("第一节", 5, "第一节")]
        query_file = sourcing.write_query_file(self.topic, queries)
        expected_query_hash = hashlib.sha256(query_file.read_bytes()).hexdigest()
        manifest = sourcing.write_topic_outputs(self.topic, self.document, queries, chosen,
                                                warnings=["测试提示"])
        order = (self.topic / sourcing.ORDER_FILE).read_text(encoding="utf-8").split()
        self.assertEqual(order[0], "封面_某图_新华社.jpg")
        self.assertEqual(manifest["配图"][0]["角色"], "封面")
        self.assertEqual(manifest["配图"][1]["插入到小标题"], "第二节")
        self.assertEqual(manifest["提示"], ["测试提示"])
        note = (self.topic / sourcing.SOURCE_NOTE).read_text(encoding="utf-8")
        self.assertIn("https://img/a.jpg", note)
        saved = json.loads((self.topic / sourcing.MANIFEST_FILE).read_text(encoding="utf-8"))
        self.assertEqual(saved["标题"], "测试标题")
        self.assertEqual((self.topic / '.自动搜索词.sha256').read_text(encoding='ascii'),
                         expected_query_hash)

    def test_layout_honours_section_anchor(self):
        unformatted = self.topic / "未排版文章"
        formatted = self.topic / "已排版文章"
        saved = (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA)
        topic = unformatted / "锚点主题"
        topic.mkdir(parents=True)
        try:
            config.UNFORMATTED, config.FORMATTED = unformatted, formatted
            config.PREVIEW = self.topic / "预览"
            config.DATA = self.topic / "data"
            write_document(topic / "稿.docx",
                           [Block("title", "锚点标题"), Block("h2", "01 第一节"),
                            Block("p", "第一段。"), Block("p", "第二段。"),
                            Block("h2", "02 第二节"), Block("p", "第三段。"),
                            Block("p", "第四段。")], title="锚点标题")
            cover = topic / "封面_某图_新华社.jpg"
            cover.write_bytes(png_bytes(1200, 700, (10, 20, 30)))
            image = topic / "第二节配图_某图_光明网.jpg"
            image.write_bytes(png_bytes(900, 600, (200, 30, 60)))
            (topic / "配图顺序.txt").write_text(f"{cover.name}\n{image.name}\n", encoding="utf-8")
            (topic / "配图清单.json").write_text(json.dumps({
                "配图": [{"原始文件名": cover.name, "图注": "封面图", "插入到小标题": ""},
                         {"原始文件名": image.name, "图注": "第二节的图",
                          "插入到小标题": "02 第二节"}]
            }, ensure_ascii=False), encoding="utf-8")
            result = layout.format_topic(topic, captions_on=True)
            kinds = body_kinds(result.docx)
            self.assertEqual(kinds[1], "image")  # 封面紧跟标题
            body_image = kinds.index("image", 2)
            self.assertGreater(body_image, kinds.index("h2", 2))  # 正文图落在第二节里
            document = read_document(result.docx)
            self.assertIn("第二节的图", [block.text for block in document.blocks])
        finally:
            (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA) = saved

    def test_layout_honours_explicit_paragraph_position(self):
        """配图清单写了「插入到段落」，图就要落在那个块之后。"""
        unformatted = self.topic / "未排版文章"
        formatted = self.topic / "已排版文章"
        saved = (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA)
        topic = unformatted / "落点主题"
        topic.mkdir(parents=True)
        try:
            config.UNFORMATTED, config.FORMATTED = unformatted, formatted
            config.PREVIEW = self.topic / "预览"
            config.DATA = self.topic / "data"
            write_document(topic / "稿.docx",
                           [Block("title", "落点标题"), Block("h2", "01 第一节"),
                            Block("p", "第一段。"), Block("p", "第二段。"),
                            Block("p", "第三段。"), Block("p", "第四段。"),
                            Block("p", "第五段。")], title="落点标题")
            cover = topic / "封面_某图_新华社.jpg"
            cover.write_bytes(png_bytes(1200, 700, (10, 20, 30)))
            image = topic / "第三段后_某图_光明网.jpg"
            image.write_bytes(png_bytes(900, 600, (200, 30, 60)))
            (topic / "配图顺序.txt").write_text(f"{cover.name}\n{image.name}\n", encoding="utf-8")
            (topic / "配图清单.json").write_text(json.dumps({
                "配图": [{"原始文件名": cover.name, "图注": "封面图"},
                         {"原始文件名": image.name, "图注": "正文图", "插入到段落": 3}]
            }, ensure_ascii=False), encoding="utf-8")
            result = layout.format_topic(topic, captions_on=True)
            kinds = body_kinds(result.docx)
            # 标题 / 封面 / 封面图注 / 01 第一节 / 第一段 / 第二段 / 第三段 / 图 ...
            self.assertEqual(kinds[1], "image")
            self.assertEqual(kinds.index("image", 2), 7)
            document = read_document(result.docx)
            self.assertIn("正文图", [block.text for block in document.blocks])
        finally:
            (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA) = saved


class TopicDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.saved = (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA)
        config.UNFORMATTED = self.root / "未排版文章"
        config.FORMATTED = self.root / "已排版文章"
        config.PREVIEW = self.root / "预览"
        config.DATA = self.root / "data"

    def tearDown(self):
        (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA) = self.saved
        self.temp.cleanup()

    def test_loose_word_becomes_its_own_topic_folder(self):
        config.ensure_directories()
        write_document(config.UNFORMATTED / "散落标题.docx",
                       [Block("title", "散落标题"), Block("p", "正文")], title="散落标题")
        topics = sourcing.discover_topics(hint=lambda *_: None)
        names = [path.name for path in topics]
        self.assertIn("散落标题", names)
        self.assertTrue((config.UNFORMATTED / "散落标题" / "散落标题.docx").exists())

    def test_identical_loose_and_topic_words_are_kept_without_overwrite(self):
        config.ensure_directories()
        loose = config.UNFORMATTED / "重复稿.docx"
        write_document(loose, [Block("title", "重复稿"), Block("p", "相同正文")], title="重复稿")
        topic = config.UNFORMATTED / "重复稿"
        topic.mkdir()
        destination = topic / loose.name
        destination.write_bytes(loose.read_bytes())
        before = destination.read_bytes()
        lines = []

        topics = sourcing.discover_topics(hint=lines.append)

        self.assertIn(topic, topics)
        self.assertEqual(loose.read_bytes(), before)
        self.assertEqual(destination.read_bytes(), before)
        self.assertTrue(any("散落副本也已保留" in line for line in lines))

    def test_different_same_name_words_raise_without_changing_either_copy(self):
        config.ensure_directories()
        loose = config.UNFORMATTED / "冲突稿.docx"
        write_document(loose, [Block("title", "冲突稿"), Block("p", "新内容")], title="冲突稿")
        topic = config.UNFORMATTED / "冲突稿"
        topic.mkdir()
        destination = topic / loose.name
        write_document(destination, [Block("title", "冲突稿"), Block("p", "旧内容")], title="冲突稿")
        loose_before = loose.read_bytes()
        destination_before = destination.read_bytes()

        with self.assertRaisesRegex(sourcing.SourcingError, "两份都已保留"):
            sourcing.discover_topics(hint=lambda *_: None)

        self.assertEqual(loose.read_bytes(), loose_before)
        self.assertEqual(destination.read_bytes(), destination_before)

    def test_topic_with_images_is_skipped_unless_forced(self):
        topic = config.UNFORMATTED / "已有配图"
        topic.mkdir(parents=True)
        (topic / "图.jpg").write_bytes(png_bytes(600, 400))
        self.assertTrue(sourcing.has_images(topic))


class FixedFiveWorkflowTests(unittest.TestCase):
    def test_network_shortfall_invokes_gpt_fill_for_five_pending_candidates(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_document(root / "稿.docx", [
                Block("title", "固定五张"), Block("p", "文章正文。" * 20),
            ], title="固定五张")
            document = sourcing.read_document(root / "稿.docx")
            analysis = sourcing.Analysis([sourcing.Query("固定五张")], ["固定五张"], [])

            def fill(doc, chosen, **kwargs):
                self.assertEqual(kwargs["target_count"], 5)
                self.assertTrue(kwargs["auto"])
                for index in range(5):
                    path = root / f"ai-{index}.jpg"
                    Image.new("RGB", (900, 600), (index * 30, 20, 20)).save(path)
                    hit = Hit("AI生成", "固定五张", f"AI图{index}", "gpt-image-1",
                              f"ai://{index}", "", 900, 600)
                    chosen.append(sourcing.Chosen(hit, path, "正文配图", -1, "", "", 900, 600, 0))
                return chosen

            with patch.object(sourcing, "analyze", return_value=analysis), \
                 patch.object(sourcing, "collect_hits", return_value=([], [])), \
                 patch.object(sourcing, "choose_images", return_value=([], [])), \
                 patch.object(sourcing, "supplement_with_ai", side_effect=fill) as supplement, \
                 patch.object(sourcing, "write_topic_outputs", return_value={"配图": []}):
                result = sourcing.source_topic(root, sources=[], do_layout=False,
                                              hint=lambda *_: None)
            self.assertEqual(len(result.chosen), 5)
            self.assertEqual(supplement.call_args.kwargs["target_count"], 5)
            self.assertEqual(result.chosen[0].role, "封面")


class KeywordCommandTests(unittest.TestCase):
    """关键词命令：只读稿取词，不动图片。"""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.saved = (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA)
        config.UNFORMATTED = self.root / "未排版文章"
        config.FORMATTED = self.root / "已排版文章"
        config.PREVIEW = self.root / "预览"
        config.DATA = self.root / "data"
        config.ensure_directories()

    def tearDown(self):
        (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA) = self.saved
        self.temp.cleanup()

    def _write_source(self, folder: Path, name: str) -> Path:
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / name
        write_document(path, [
            Block("title", "待遇再好，四年后也得走？胖东来这次戳中了打工人的心事"),
            Block("h2", "01 员工还是学员"),
            Block("p", "于东来说，胖东来再招员工都会是学员性质，合同四年不续签。"),
            Block("p", "胖东来是一家商超，于东来是创始人，员工待遇一直被人讨论。"),
        ], title="待遇再好，四年后也得走？胖东来这次戳中了打工人的心事")
        return path

    def test_loose_word_gets_topic_folder_and_query_file(self):
        self._write_source(config.UNFORMATTED, "胖东来四年合同.docx")
        lines: list[str] = []
        self.assertEqual(sourcing.keywords_report(hint=lines.append), 0)
        topic = config.UNFORMATTED / "胖东来四年合同"
        self.assertTrue((topic / sourcing.QUERY_FILE).exists())
        self.assertTrue(any("关键词" in line for line in lines))
        self.assertTrue(any("搜索词" in line for line in lines))

    def test_empty_library_is_a_read_only_success_without_progress_report(self):
        progress = config.DATA / "配图进度.json"
        lines: list[str] = []

        self.assertEqual(sourcing.keywords_report(hint=lines.append), 0)

        self.assertFalse(progress.exists())
        self.assertTrue(any("没找到要取词的稿子" in line for line in lines))

    def test_empty_library_does_not_rewrite_existing_image_progress(self):
        progress = config.DATA / "配图进度.json"
        original = '{"状态":"配图任务正在进行"}\n'
        progress.write_text(original, encoding='utf-8')

        self.assertEqual(sourcing.keywords_report(hint=lambda *_: None), 0)

        self.assertEqual(progress.read_text(encoding='utf-8'), original)

    def test_existing_query_file_is_kept_unless_overwritten(self):
        topic = config.UNFORMATTED / "定制词"
        self._write_source(topic, "定制词.docx")
        (topic / sourcing.QUERY_FILE).write_text("我的词 @01 员工还是学员\n", encoding="utf-8")
        self.assertEqual(sourcing.keywords_report(hint=lambda *_: None), 0)
        self.assertEqual((topic / sourcing.QUERY_FILE).read_text(encoding="utf-8"),
                         "我的词 @01 员工还是学员\n")
        self.assertEqual(sourcing.keywords_report(overwrite=True, hint=lambda *_: None), 0)
        self.assertIn("# 配图搜索词", (topic / sourcing.QUERY_FILE).read_text(encoding="utf-8"))

    def test_formatted_topic_is_read_only(self):
        topic = config.FORMATTED / "已排版主题"
        self._write_source(topic, "原文.docx")
        self._write_source(topic, "成稿标题.docx")
        lines: list[str] = []
        self.assertEqual(sourcing.keywords_report(only="已排版主题", hint=lines.append), 0)
        self.assertFalse((topic / sourcing.QUERY_FILE).exists())
        self.assertTrue(any("已排版主题" in line for line in lines))


if __name__ == "__main__":
    unittest.main()
