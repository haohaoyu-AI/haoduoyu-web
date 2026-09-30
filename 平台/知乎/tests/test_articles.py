import html
import hashlib
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

from zhihu_drafts import articles as article_module
from zhihu_drafts.articles import ArticleLoadError, load_article


NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def paragraph(text, style=None, bold=False):
    props = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    run_props = "<w:rPr><w:b/></w:rPr>" if bold else ""
    return f"<w:p>{props}<w:r>{run_props}<w:t>{html.escape(text)}</w:t></w:r></w:p>"


class ArticleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def docx(self, name, contents, media=False):
        path = self.root / name
        document = f'<w:document xmlns:w="{NS}"><w:body>{contents}</w:body></w:document>'
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("word/document.xml", document)
            if media:
                archive.writestr("word/media/image1.png", b"test")
        return path

    def docx_with_image(self, name, before, after, image=b"\x89PNG\r\n\x1a\n0123456789"):
        """构造一份正文里嵌了一张图的 Word 文档。"""
        path = self.root / name
        drawing = (
            '<w:p><w:r><w:drawing>'
            '<wp:inline><wp:extent cx="914400" cy="685800"/>'
            '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
            '<a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            '<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
            ' r:embed="rId5"/></pic:blipFill>'
            "</pic:pic></a:graphicData></a:graphic>"
            "</wp:inline></w:drawing></w:r></w:p>"
        )
        document = (
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
            'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<w:body>{before}{drawing}{after}</w:body></w:document>"
        )
        rels = (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId5" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
            'Target="media/image1.png"/></Relationships>'
        )
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("word/document.xml", document)
            archive.writestr("word/_rels/document.xml.rels", rels)
            archive.writestr("word/media/image1.png", image)
        return path

    def textfile(self, name, contents, encoding="utf-8"):
        path = self.root / name
        path.write_text(contents, encoding=encoding)
        return path

    def test_word_heading_title_and_bold_preserved(self):
        path = self.docx("文章（终稿）.docx", paragraph("文章", "Heading1")
                         + paragraph("第一节", "Heading2") + paragraph("正文 <重要>", bold=True))
        article = load_article(path)
        self.assertEqual(article.title, "文章")
        self.assertEqual(article.text, "第一节\n\n正文 <重要>")
        self.assertIn("<h2>第一节</h2>", article.html)
        self.assertIn("<strong>正文 &lt;重要&gt;</strong>", article.html)
        self.assertEqual(article.warnings, [])

    def test_first_section_is_never_used_as_title(self):
        for style, text in (("Heading2", "01 第一节"), (None, "1."), ("Heading1", "第一节")):
            with self.subTest(style=style):
                article = load_article(self.docx("真正标题.docx", paragraph(text, style) + paragraph("正文")))
                self.assertEqual(article.title, "真正标题")
                self.assertTrue(article.text.startswith(text + "\n\n"))

    def test_untitled_filename_uses_document_title(self):
        article = load_article(self.docx("无标题.docx", paragraph("真正标题", "Heading1") + paragraph("正文")))
        self.assertEqual(article.title, "真正标题")
        self.assertEqual(article.text, "正文")

    def test_explicit_word_title_may_differ_from_filename(self):
        article = load_article(self.docx("其他文件名.docx", paragraph("真正标题", "Title") + paragraph("正文")))
        self.assertEqual(article.title, "真正标题")

    def test_duplicate_copy_and_markdown_have_same_fingerprint(self):
        body = paragraph("文章", "Heading1") + paragraph("正文", bold=True)
        one = load_article(self.docx("文章.docx", body))
        two = load_article(self.docx("文章 (1).docx", body))
        three = load_article(self.textfile("another.md", "# 文章\n\n**正文**\n"))
        self.assertEqual(one.fingerprint, two.fingerprint)
        self.assertEqual(one.fingerprint, three.fingerprint)

    def test_tables_and_footnotes_rejected(self):
        for extra in ("<w:tbl/>", '<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>'):
            with self.subTest(extra=extra), self.assertRaises(ArticleLoadError):
                load_article(self.docx("文章.docx", paragraph("正文") + extra))

    def test_embedded_image_is_read_in_document_order(self):
        path = self.docx_with_image(
            "图片文章.docx",
            paragraph("图片文章", "Heading1") + paragraph("第一段"),
            paragraph("第二段"),
        )
        article = load_article(path)
        self.assertEqual(article.title, "图片文章")
        self.assertEqual(article.text, "第一段\n\n第二段")
        self.assertEqual(len(article.images), 1)
        self.assertEqual(article.images[0].content_type, "image/png")
        self.assertTrue(article.images[0].data.startswith(b"\x89PNG"))
        self.assertEqual([segment.kind for segment in article.segments], ["text", "image", "text"])
        self.assertIn("data:image/png;base64,", article.html)
        self.assertTrue(article.image_digest)

    def test_missing_image_relationship_is_warned_not_fatal(self):
        path = self.docx_with_image("图片文章.docx", paragraph("正文"), paragraph("结尾"))
        # 删掉关系文件后，图片读不出来，但正文仍应完整导入。
        rebuilt = self.root / "缺关系.docx"
        with zipfile.ZipFile(path) as source, zipfile.ZipFile(rebuilt, "w") as target:
            for item in source.namelist():
                if item != "word/_rels/document.xml.rels":
                    target.writestr(item, source.read(item))
        article = load_article(rebuilt)
        self.assertEqual(article.images, ())
        self.assertTrue(any("图片" in warning for warning in article.warnings))

    def test_text_keeps_first_paragraph_and_detects_explicit_title(self):
        article = load_article(self.textfile("标题.txt", "这是首段。\n\n这是第二段。", "utf-8-sig"))
        self.assertEqual(article.title, "标题")
        self.assertEqual(article.text, "这是首段。\n\n这是第二段。")
        explicit = load_article(self.textfile("other.txt", "标题：真正标题\n正文", "gb18030"))
        self.assertEqual(explicit.title, "真正标题")
        self.assertEqual(explicit.text, "正文")

    def test_markdown_escapes_raw_html_and_retains_unknown_syntax(self):
        article = load_article(self.textfile("a.md", "# 标题\n## 小节\n**粗体** 和 <script>alert(1)</script>\n- 列表"))
        self.assertIn("<h2>小节</h2>", article.html)
        self.assertIn("<strong>粗体</strong>", article.html)
        self.assertNotIn("<script>", article.html)
        self.assertIn("- 列表", article.text)
        self.assertTrue(article.warnings)
        with self.assertRaisesRegex(ArticleLoadError, "图片"):
            load_article(self.textfile("image.md", "# 标题\n![描述](image.png)"))

    def test_empty_body_and_corrupt_docx_rejected(self):
        for name, contents in (("empty.txt", "  \n"), ("only.md", "# 标题"), ("bad.docx", "not a zip")):
            with self.subTest(name=name), self.assertRaises(ArticleLoadError):
                load_article(self.textfile(name, contents))

    def test_content_fingerprint_preserves_compatibility_distinctions(self):
        one = load_article(self.textfile("squared.md", "# 标题\nx²"))
        two = load_article(self.textfile("digit.md", "# 标题\nx2"))
        self.assertNotEqual(one.fingerprint, two.fingerprint)
        title_one = load_article(self.textfile("squared_title.md", "# x²\n正文"))
        title_two = load_article(self.textfile("digit_title.md", "# x2\n正文"))
        self.assertNotEqual(title_one.fingerprint, title_two.fingerprint)

    def test_content_fingerprint_still_normalizes_nfc_and_whitespace(self):
        composed = load_article(self.textfile("composed.md", "# Caf\u00e9\n一段  正文"))
        decomposed = load_article(self.textfile("decomposed.md", "# Cafe\u0301\n一段\t正文"))
        self.assertEqual(composed.fingerprint, decomposed.fingerprint)

    def test_source_digest_covers_original_bytes_including_formatting(self):
        path = self.textfile("format.md", "# 标题\n正文")
        plain = load_article(path)
        self.assertEqual(plain.source_digest, hashlib.sha256(path.read_bytes()).hexdigest())
        path.write_text("# 标题\n**正文**", encoding="utf-8")
        bold = load_article(path)
        self.assertEqual(plain.fingerprint, bold.fingerprint)
        self.assertNotEqual(plain.source_digest, bold.source_digest)

    def test_source_modification_during_extraction_is_rejected(self):
        path = self.textfile("changing.md", "# 标题\n原正文")
        parse = article_module._text_paragraphs

        def modify_after_parsing(source, data):
            result = parse(source, data)
            source.write_text("# 标题\n另一个正文", encoding="utf-8")
            return result

        with patch.object(article_module, "_text_paragraphs", side_effect=modify_after_parsing), \
                self.assertRaisesRegex(ArticleLoadError, "读取期间源文件已修改"):
            load_article(path)


if __name__ == "__main__":
    unittest.main()
