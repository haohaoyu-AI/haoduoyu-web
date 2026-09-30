"""Read local articles without changing the source files.

Supported input: DOCX paragraphs/headings/basic emphasis and embedded pictures,
Markdown headings and bold emphasis, and plain text. Unsupported DOCX content
(tables, formulas, revision marks, ...) is rejected explicitly instead of
producing a draft with silently missing content.

正文里的图片按文档中的先后顺序保存在 ``Article.images``；
``Article.segments`` 把文字和图片交替切开，供浏览器按顺序上传。
"""

from __future__ import annotations

from dataclasses import dataclass
import base64
import hashlib
from html import escape
import io
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import zipfile


W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
WP = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}"
SUPPORTED_EXTENSIONS = frozenset({".docx", ".md", ".txt"})
EMU_PER_PIXEL = 9525
IMAGE_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".tif": "image/tiff", ".tiff": "image/tiff",
}


class ArticleLoadError(ValueError):
    """The source cannot be imported without dropping meaningful content."""


@dataclass(frozen=True)
class ArticleImage:
    """一张正文图片：原始字节 + 尺寸，供上传和回读校验使用。"""

    name: str
    data: bytes
    content_type: str
    width: int = 0
    height: int = 0
    digest: str = ""


@dataclass(frozen=True)
class Segment:
    """正文的一段：要么是文字（html），要么是一张图片。"""

    kind: str
    html: str = ""
    text: str = ""
    image: ArticleImage | None = None


@dataclass(frozen=True)
class Article:
    source: Path
    title: str
    html: str
    text: str
    fingerprint: str
    warnings: list[str]
    source_digest: str = ""
    images: tuple[ArticleImage, ...] = ()
    segments: tuple[Segment, ...] = ()
    image_digest: str = ""

    @property
    def has_images(self) -> bool:
        return bool(self.images)


@dataclass
class _Paragraph:
    text: str
    html: str
    heading: int | None = None
    is_title: bool = False


@dataclass
class _ImageBlock:
    image: ArticleImage


def _normalise(value: str) -> str:
    # NFC preserves meaningful distinctions such as x² versus x2. Compatibility
    # folding is suitable for locating filename titles, not article identity.
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip()


def _title_key(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    return "".join(c for c in _normalise(value).casefold() if c.isalnum())


def _filename_title(path: Path) -> str:
    # Remove Windows duplicate-copy suffixes and explicit editorial suffixes.
    title = path.stem.strip()
    while True:
        cleaned = re.sub(r"\s*[（(](?:\d+|终稿|定稿)[）)]\s*$", "", title).strip()
        if cleaned == title:
            return title
        title = cleaned


def _safe_url(value: str) -> bool:
    return urlsplit(value).scheme.lower() in {"http", "https", "mailto"}


def _on(element: ET.Element | None) -> bool | None:
    if element is None:
        return None
    return element.get(W + "val", "true").lower() not in {"0", "false", "off", "no"}


def _image_from_blip(archive: zipfile.ZipFile, rel_id: str,
                     extent: ET.Element | None) -> ArticleImage | None:
    """把 w:drawing 里的 r:embed 解析成图片字节。"""
    rels_path = "word/_rels/document.xml.rels"
    if rels_path not in archive.namelist():
        return None
    target = ""
    for rel in ET.fromstring(archive.read(rels_path)):
        if rel.get("Id") == rel_id and rel.get("Type", "").endswith("/image"):
            target = rel.get("Target", "")
            break
    if not target:
        return None
    name = target.lstrip("/")
    while name.startswith("../"):
        name = name[3:]
    if not name.startswith("word/"):
        name = "word/" + name
    try:
        data = archive.read(name)
    except KeyError:
        return None
    width = height = 0
    if extent is not None:
        try:
            width = int(int(extent.get("cx", 0)) / EMU_PER_PIXEL)
            height = int(int(extent.get("cy", 0)) / EMU_PER_PIXEL)
        except (TypeError, ValueError):
            width = height = 0
    suffix = Path(name).suffix.lower()
    return ArticleImage(
        name=Path(name).name,
        data=data,
        content_type=IMAGE_TYPES.get(suffix, "image/jpeg"),
        width=width,
        height=height,
        digest=hashlib.sha256(data).hexdigest(),
    )


def _docx_blocks(path: Path, data: bytes | None = None) -> tuple[list, list[str]]:
    warnings: list[str] = []
    try:
        archive = zipfile.ZipFile(io.BytesIO(data) if data is not None else path)
    except (OSError, zipfile.BadZipFile) as exc:
        raise ArticleLoadError(f"无法打开 DOCX：{exc}") from exc
    with archive:
        try:
            root = ET.fromstring(archive.read("word/document.xml"))
            style_root = (
                ET.fromstring(archive.read("word/styles.xml"))
                if "word/styles.xml" in archive.namelist() else None
            )
        except (KeyError, ET.ParseError) as exc:
            raise ArticleLoadError(f"DOCX 文档结构无效：{exc}") from exc
        body = root.find(W + "body")
        if body is None:
            raise ArticleLoadError("DOCX 中没有可识别的正文。")

        unsupported = []
        # Single-cell tables are commonly used as heading/callout decoration.
        # Their paragraphs/images are read below in document order, and the
        # original Word is uploaded through the platform's native importer.
        tables = list(body.iter(W + "tbl"))
        complex_tables = [t for t in tables if len(t.findall(W + "tr")) != 1
                          or len(list(t.iter(W + "tc"))) != 1]
        if complex_tables:
            unsupported.append(f"复杂表格 {len(complex_tables)} 处（多行或多列，暂不自动转换）")
        if tables and not complex_tables:
            warnings.append(f"已识别 {len(tables)} 处单单元格排版框；使用原 Word 导入保留版式。")
        for tag, label in (
            (W + "pict", "旧式图片"), (W + "object", "嵌入对象"),
            (W + "txbxContent", "文本框"), (M + "oMath", "公式"),
            (W + "footnoteReference", "脚注"), (W + "endnoteReference", "尾注"),
            (W + "ins", "未接受的插入修订"), (W + "del", "未接受的删除修订"),
            (W + "numPr", "自动编号或列表"), (W + "altChunk", "外部内容"),
            (W + "sym", "特殊字体符号"), (W + "fldChar", "动态域"),
        ):
            count = len(list(body.iter(tag)))
            if count:
                unsupported.append(f"{label} {count} 处")
        for run in body.iter(W + "r"):
            if _on(run.find(W + "rPr/" + W + "vanish")):
                unsupported.append("隐藏文字")
                break
        if unsupported:
            raise ArticleLoadError("暂不支持以下内容，已停止导入以免丢失：" + "；".join(unsupported))
        if any(True for _ in body.iter(W + "commentReference")):
            warnings.append("Word 批注不会导入；正文已保留。")
        for name in archive.namelist():
            if re.fullmatch(r"word/(?:header|footer)\d+\.xml", name):
                other = ET.fromstring(archive.read(name))
                if any((node.text or "").strip() for node in other.iter(W + "t")):
                    warnings.append("Word 页眉和页脚不会导入；正文已保留。")
                    break

        styles = {} if style_root is None else {
            node.get(W + "styleId"): node for node in style_root.findall(W + "style")
        }
        links: dict[str, str] = {}
        relpath = "word/_rels/document.xml.rels"
        if relpath in archive.namelist():
            for rel in ET.fromstring(archive.read(relpath)):
                if rel.get("Type", "").endswith("/hyperlink"):
                    links[rel.get("Id", "")] = rel.get("Target", "")

        def style_property(style_id: str, prop: str) -> bool | None:
            seen = set()
            while style_id in styles and style_id not in seen:
                seen.add(style_id)
                style = styles[style_id]
                value = _on(style.find(W + "rPr/" + W + prop))
                if value is not None:
                    return value
                parent = style.find(W + "basedOn")
                style_id = "" if parent is None else parent.get(W + "val", "")
            return None

        def render_pieces(node: ET.Element,
                          paragraph_style: str) -> list[tuple[str, str, str, ArticleImage | None]]:
            """按文档顺序返回 (kind, text, html, image) 片段。"""
            if node.tag == W + "r":
                pieces: list[tuple[str, str, str, ArticleImage | None]] = []
                buffer: list[str] = []

                def flush() -> None:
                    if buffer:
                        pieces.append(("text", "".join(buffer), "", None))
                        buffer.clear()

                for child in node:
                    if child.tag == W + "t":
                        buffer.append(child.text or "")
                    elif child.tag in {W + "br", W + "cr"}:
                        buffer.append("\n")
                    elif child.tag == W + "tab":
                        buffer.append("\t")
                    elif child.tag == W + "drawing":
                        flush()
                        blip = child.find(".//" + A + "blip")
                        extent = child.find(".//" + WP + "extent")
                        image = (_image_from_blip(archive, blip.get(R + "embed", ""), extent)
                                 if blip is not None else None)
                        if image is None:
                            warnings.append("有一张图片无法从 Word 中读出，已跳过。")
                        else:
                            pieces.append(("image", "", "", image))
                flush()
                text = "".join(value for kind, value, _html, _image in pieces if kind == "text")
                if text:
                    html = escape(text).replace("\n", "<br>").replace("\t", "&#9;")
                    rstyle = node.find(W + "rPr/" + W + "rStyle")
                    rstyle_id = "" if rstyle is None else rstyle.get(W + "val", "")
                    for prop, html_tag in (("b", "strong"), ("i", "em"), ("strike", "s")):
                        enabled = _on(node.find(W + "rPr/" + W + prop))
                        if enabled is None:
                            enabled = style_property(rstyle_id, prop)
                        if enabled is None:
                            enabled = style_property(paragraph_style, prop)
                        if enabled:
                            html = f"<{html_tag}>{html}</{html_tag}>"
                    pieces = [(kind, value, html if kind == "text" else content, image)
                              for kind, value, content, image in pieces]
                return pieces
            if node.tag in {W + "pPr", W + "rPr"}:
                return []
            rendered: list[tuple[str, str, str, ArticleImage | None]] = []
            for child in node:
                rendered.extend(render_pieces(child, paragraph_style))
            if node.tag == W + "hyperlink":
                target = links.get(node.get(R + "id", ""), "")
                if target and not _safe_url(target):
                    warnings.append("一个非 HTTP/HTTPS/mailto 链接已保留为文字。")
            return rendered

        blocks: list = []
        # Iteration also preserves paragraphs in content controls in document order.
        for paragraph in body.iter(W + "p"):
            style_element = paragraph.find(W + "pPr/" + W + "pStyle")
            style_id = "" if style_element is None else style_element.get(W + "val", "")
            style = styles.get(style_id)
            name_node = None if style is None else style.find(W + "name")
            style_name = style_id if name_node is None else name_node.get(W + "val", style_id)
            heading_match = re.fullmatch(r"(?:heading|标题)\s*([1-6])", style_name, re.I)
            if heading_match is None:
                heading_match = re.fullmatch(r"Heading([1-6])", style_id, re.I)
            heading = int(heading_match.group(1)) if heading_match else None
            pieces = render_pieces(paragraph, style_id)
            text = "".join(value for kind, value, _html, _image in pieces if kind == "text")
            html = "".join(content for kind, _value, content, _image in pieces if kind == "text")
            images = [image for kind, _value, _content, image in pieces if kind == "image"]
            if text.strip():
                blocks.append(_Paragraph(text, html, heading,
                                         style_name.casefold() in {"title", "标题"}))
            for image in images:
                blocks.append(_ImageBlock(image))
        if not blocks:
            raise ArticleLoadError("DOCX 中没有可识别的正文。")
        return blocks, list(dict.fromkeys(warnings))


def _read_text(path: Path, data: bytes | None = None) -> str:
    if data is None:
        data = path.read_bytes()
    encodings = ("utf-16",) if data.startswith((b"\xff\xfe", b"\xfe\xff")) else ("utf-8-sig", "gb18030")
    for encoding in encodings:
        try:
            return data.decode(encoding).replace("\r\n", "\n").replace("\r", "\n")
        except UnicodeError:
            pass
    raise ArticleLoadError("文字编码无法识别，请另存为 UTF-8。")


def _markdown_inline(value: str) -> tuple[str, str]:
    text_parts, html_parts = [], []
    position = 0
    for match in re.finditer(r"(\*\*|__)(.+?)\1", value):
        prefix = value[position:match.start()]
        text_parts.extend((prefix, match.group(2)))
        html_parts.extend((escape(prefix), f"<strong>{escape(match.group(2))}</strong>"))
        position = match.end()
    text_parts.append(value[position:])
    html_parts.append(escape(value[position:]))
    return "".join(text_parts), "".join(html_parts)


def _text_paragraphs(path: Path, data: bytes | None = None) -> tuple[list[_Paragraph], list[str]]:
    source = _read_text(path, data)
    markdown = path.suffix.lower() == ".md"
    if markdown and (re.search(r"!\[[^\]]*\]\s*[([]", source)
                     or re.search(r"<\s*img\b", source, re.I)):
        raise ArticleLoadError("Markdown 含有图片，当前版本不支持上传图片，已停止导入。")
    paragraphs = []
    # A line is a paragraph for text input. Empty separator lines are ignored.
    # Unsupported Markdown constructs remain visible as literal text.
    for line in source.splitlines():
        if not line.strip():
            continue
        heading_match = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", line) if markdown else None
        heading = len(heading_match.group(1)) if heading_match else None
        content = heading_match.group(2) if heading_match else line
        text, html = _markdown_inline(content) if markdown else (content, escape(content))
        paragraphs.append(_Paragraph(text, html, heading, bool(heading == 1)))
    warnings = []
    if markdown and re.search(r"^\s*(?:```|~~~|>|[-*+]\s|\d+[.)]\s)|\[[^\]]+\]\(", source, re.M):
        warnings.append("Markdown 仅转换标题和粗体；其他语法按原文保留。")
    return paragraphs, warnings


def _data_uri(image: ArticleImage) -> str:
    return f"data:{image.content_type};base64,{base64.b64encode(image.data).decode('ascii')}"


def _without(blocks: list, target) -> list:
    """按身份移除一个段落块（按值比较会误删内容相同的段落）。"""
    for index, block in enumerate(blocks):
        if block is target:
            return blocks[:index] + blocks[index + 1:]
    return list(blocks)


def load_article(path: str | Path) -> Article:
    """Extract an article and a path-independent content fingerprint.

    A Word Title paragraph is an explicit title. A first Heading1 is consumed
    only when it matches the filename, or the filename is an untitled placeholder.
    Other first paragraphs, including Heading2 and numbered sections, stay in the
    body. Markdown may start with ``# title``; TXT may use ``标题：title``.
    """
    source = Path(path).resolve()
    if source.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ArticleLoadError("仅支持 .docx、.md 和 .txt 文件。")
    if not source.is_file():
        raise ArticleLoadError(f"文章文件不存在：{source}")
    try:
        # Parse an immutable byte snapshot, then check that the source remained
        # unchanged while extracting it. The digest also detects format-only edits.
        source_bytes = source.read_bytes()
        source_digest = hashlib.sha256(source_bytes).hexdigest()
        if source.suffix.lower() == ".docx":
            blocks, warnings = _docx_blocks(source, source_bytes)
        else:
            blocks, warnings = _text_paragraphs(source, source_bytes)
        if hashlib.sha256(source.read_bytes()).hexdigest() != source_digest:
            raise ArticleLoadError("读取期间源文件已修改，请保存文件后重新读取。")
    except ArticleLoadError:
        raise
    except (OSError, UnicodeError, ET.ParseError, zipfile.BadZipFile) as exc:
        raise ArticleLoadError(f"读取文章失败：{exc}") from exc
    paragraphs = [block for block in blocks if isinstance(block, _Paragraph)]
    if not paragraphs:
        raise ArticleLoadError("文章没有正文。")

    title = _filename_title(source)
    first = paragraphs[0]
    filename_matches = _title_key(first.text) == _title_key(title)
    placeholder = _title_key(title) in {"无标题", "未命名", "untitled", "document"}
    explicit_text_title = re.match(r"^标题\s*[:：]\s*(.+)$", first.text)
    if first.is_title or (first.heading == 1 and (filename_matches or placeholder)) or filename_matches:
        title = first.text.strip()
        blocks = _without(blocks, first)
    elif source.suffix.lower() == ".txt" and explicit_text_title:
        title = explicit_text_title.group(1).strip()
        blocks = _without(blocks, first)
    else:
        warnings.append("未找到明确的文章标题，使用文件名；首段已完整保留。")
    if not title:
        raise ArticleLoadError("文章标题为空。")

    body_paragraphs = [block for block in blocks if isinstance(block, _Paragraph)]
    if not body_paragraphs:
        raise ArticleLoadError("文章只有标题，没有正文。")

    text = "\n\n".join(block.text for block in body_paragraphs)
    html_parts: list[str] = []
    segments: list[Segment] = []
    pending_html: list[str] = []
    pending_text: list[str] = []

    def flush() -> None:
        if pending_html or pending_text:
            segments.append(Segment("text", "\n".join(pending_html), "\n\n".join(pending_text)))
            pending_html.clear()
            pending_text.clear()

    images: list[ArticleImage] = []
    for block in blocks:
        if isinstance(block, _ImageBlock):
            tag = '<figure><img src="' + _data_uri(block.image) + '" alt="配图"></figure>'
            html_parts.append(tag)
            flush()
            segments.append(Segment("image", html=tag, image=block.image))
            images.append(block.image)
            continue
        tag = f"h{max(2, block.heading)}" if block.heading else "p"
        piece = f"<{tag}>{block.html}</{tag}>"
        html_parts.append(piece)
        pending_html.append(piece)
        pending_text.append(block.text)
    flush()

    canonical = _normalise(title) + "\n" + _normalise(text)
    fingerprint = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    image_digest = (hashlib.sha256("".join(image.digest for image in images).encode("ascii")).hexdigest()
                    if images else "")
    return Article(source, title, "\n".join(html_parts), text, fingerprint, warnings,
                   source_digest, tuple(images), tuple(segments), image_digest)
