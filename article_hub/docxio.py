"""读写 .docx：读源稿的段落/小标题，写出带图成稿。

不依赖 python-docx，只按 OOXML 规范直接读写 zip，方便在用户机器上直接运行。
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import escape, unescape
from pathlib import Path
import xml.etree.ElementTree as ET

from .imageops import ImageInfo

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

EMU_PER_CM = 360000
CONTENT_WIDTH_CM = 16.0
MAX_HEIGHT_CM = 20.0


class DocxError(ValueError):
    """源稿件无法读取或成稿无法写出。"""


@dataclass
class Block:
    """成稿里的一个段落。kind: title / h2 / p / caption / image"""

    kind: str
    text: str = ""
    html: str = ""
    heading: int | None = None
    image: ImageInfo | None = None
    caption: str = ""


@dataclass
class SourceDocument:
    path: Path
    title: str
    blocks: list[Block] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _paragraph_text(paragraph: ET.Element) -> tuple[str, str]:
    """返回 (纯文本, 含粗体/斜体的基础 HTML)。"""
    text_parts: list[str] = []
    html_parts: list[str] = []
    for run in paragraph.iter(W + "r"):
        pieces = []
        for child in run:
            if child.tag == W + "t":
                pieces.append(child.text or "")
            elif child.tag in {W + "br", W + "cr"}:
                pieces.append("\n")
            elif child.tag == W + "tab":
                pieces.append("\t")
        value = "".join(pieces)
        if not value:
            continue
        text_parts.append(value)
        html = escape(value).replace("\n", "<br>").replace("\t", "&#9;")
        bold = (run.find(W + "rPr/" + W + "b") is not None)
        italic = (run.find(W + "rPr/" + W + "i") is not None)
        if bold:
            html = f"<strong>{html}</strong>"
        if italic:
            html = f"<em>{html}</em>"
        html_parts.append(html)
    return "".join(text_parts), "".join(html_parts)


def _heading_level(style_name: str, style_id: str) -> int | None:
    for value in (style_name, style_id):
        if not value:
            continue
        match = re.fullmatch(r"(?:heading|标题)\s*([1-6])", value, re.I)
        if match:
            return int(match.group(1))
        match = re.fullmatch(r"Heading([1-6])", value, re.I)
        if match:
            return int(match.group(1))
    return None


def read_document(path: str | Path) -> SourceDocument:
    """读取源稿：返回标题候选和正文段落（含小标题级别）。"""
    source = Path(path)
    if source.suffix.lower() != ".docx":
        raise DocxError(f"只支持 .docx 源稿：{source.name}")
    if not source.is_file():
        raise DocxError(f"找不到源稿：{source}")
    try:
        archive = zipfile.ZipFile(source)
    except (OSError, zipfile.BadZipFile) as exc:
        raise DocxError(f"无法打开 Word 文件：{exc}") from exc
    warnings: list[str] = []
    with archive:
        try:
            root = ET.fromstring(archive.read("word/document.xml"))
        except (KeyError, ET.ParseError) as exc:
            raise DocxError(f"Word 文档结构无效：{exc}") from exc
        styles: dict[str, str] = {}
        if "word/styles.xml" in archive.namelist():
            style_root = ET.fromstring(archive.read("word/styles.xml"))
            for style in style_root.findall(W + "style"):
                name_node = style.find(W + "name")
                styles[style.get(W + "styleId", "")] = (
                    name_node.get(W + "val", "") if name_node is not None else ""
                )
        body = root.find(W + "body")
        if body is None:
            raise DocxError("Word 文档没有正文。")
        media = [name for name in archive.namelist()
                 if name.startswith("word/media/") and not name.endswith("/")]
        if media:
            warnings.append(f"源稿内含 {len(media)} 个图片对象，排版时以文件夹里的图片为准。")
        if list(body.iter(W + "tbl")):
            raise DocxError("源稿里有表格，暂不支持自动排版，请先把表格转成文字段落。")

        blocks: list[Block] = []
        for paragraph in body.iter(W + "p"):
            style_node = paragraph.find(W + "pPr/" + W + "pStyle")
            style_id = "" if style_node is None else style_node.get(W + "val", "")
            style_name = styles.get(style_id, style_id)
            text, html = _paragraph_text(paragraph)
            if not text.strip():
                continue
            heading = _heading_level(style_name, style_id)
            is_title = style_name.casefold() in {"title", "标题"} or style_id.casefold() == "title"
            if is_title or heading == 1:
                kind = "title"
            elif heading:
                kind = "h2" if heading <= 2 else "h3"
            else:
                kind = "p"
            blocks.append(Block(kind, text.strip(), html, heading))
    if not blocks:
        raise DocxError("源稿没有正文。")

    title = ""
    if blocks[0].kind == "title":
        title = blocks[0].text
        blocks = blocks[1:]
    elif _title_key(blocks[0].text) == _title_key(source.stem):
        title = blocks[0].text
        blocks = blocks[1:]
    if not title:
        title = _clean_filename(source.stem)
        warnings.append("源稿没有标题段落，已用文件名作标题。")
    if not blocks:
        raise DocxError("源稿只有标题，没有正文。")
    return SourceDocument(source, title, blocks, warnings)


def _title_key(value: str) -> str:
    return "".join(ch for ch in value if ch.isalnum())


def _clean_filename(stem: str) -> str:
    value = stem.strip()
    while True:
        cleaned = re.sub(r"\s*[（(](?:\d+|终稿|定稿)[）)]\s*$", "", value).strip()
        if cleaned == value:
            return value
        value = cleaned


# --------------------------------------------------------------------- 写出

_CONTENT_TYPES_HEAD = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Default Extension="jpg" ContentType="image/jpeg"/>'
    '<Default Extension="jpeg" ContentType="image/jpeg"/>'
    '<Default Extension="png" ContentType="image/png"/>'
    '<Default Extension="gif" ContentType="image/gif"/>'
    '<Override PartName="/word/document.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    '<Override PartName="/docProps/core.xml" '
    'ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    '<Override PartName="/docProps/app.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
)

_ROOT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    'Target="word/document.xml"/>'
    '<Relationship Id="rId2" '
    'Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" '
    'Target="docProps/core.xml"/>'
    '<Relationship Id="rId3" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" '
    'Target="docProps/app.xml"/>'
    "</Relationships>"
)

def _heading_style_xml(level: int, size: int, before: int, after: int) -> str:
    """标题样式：带 outlineLvl 和 qFormat，导入平台时才能被认成小标题。"""
    return (
        f'<w:style w:type="paragraph" w:styleId="Heading{level}">'
        f'<w:name w:val="heading {level}"/><w:basedOn w:val="Normal"/>'
        f'<w:next w:val="Normal"/><w:qFormat/>'
        f'<w:pPr><w:keepNext/><w:outlineLvl w:val="{level - 1}"/>'
        f'<w:spacing w:before="{before}" w:after="{after}"/></w:pPr>'
        f'<w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:bCs/>'
        f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr></w:style>'
    )


_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    '<w:docDefaults><w:rPrDefault><w:rPr>'
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体" w:cs="Calibri"/>'
    '<w:sz w:val="24"/><w:szCs w:val="24"/>'
    "</w:rPr></w:rPrDefault>"
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
    "</w:docDefaults>"
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/>'
    "<w:basedOn w:val=\"Normal\"/><w:pPr><w:jc w:val=\"center\"/>"
    '<w:spacing w:before="240" w:after="360"/></w:pPr>'
    '<w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:bCs/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr>'
    "</w:style>"
    + "".join(_heading_style_xml(level, size, before, after)
              for level, size, before, after in (
                  (1, 40, 360, 200), (2, 30, 320, 160), (3, 26, 240, 120),
                  (4, 24, 200, 100), (5, 22, 200, 100), (6, 22, 200, 100),
              ))
    +
    '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/>'
    "<w:basedOn w:val=\"Normal\"/><w:pPr><w:jc w:val=\"center\"/><w:spacing w:after=\"240\"/></w:pPr>"
    '<w:rPr><w:color w:val="595959"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>'
    "</w:styles>"
)


def _run(text: str, *, bold: bool = False, italic: bool = False) -> str:
    """一个文本片段；加粗写成直接格式，导入平台时不会被样式表吃掉。"""
    properties = ""
    if bold or italic:
        properties = "<w:rPr>" + ("<w:b/><w:bCs/>" if bold else "") + \
                     ("<w:i/>" if italic else "") + "</w:rPr>"
    return f'<w:r>{properties}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def _runs_from_html(html: str, *, bold: bool = False) -> str:
    """把读稿时留下的 <strong>/<em>/<br> 还原成 Word 的 run。"""
    runs: list[str] = []
    strong = 0
    emphasis = 0
    position = 0
    for match in re.finditer(r"</?(strong|em|br)\s*/?>", html or ""):
        chunk = html[position:match.start()]
        position = match.end()
        if chunk:
            runs.append(_run(unescape(chunk), bold=bold or strong > 0, italic=emphasis > 0))
        tag = match.group(1)
        closing = match.group(0).startswith("</")
        if tag == "strong":
            strong = max(0, strong + (-1 if closing else 1))
        elif tag == "em":
            emphasis = max(0, emphasis + (-1 if closing else 1))
        else:
            runs.append("<w:r><w:br/></w:r>")
    tail = (html or "")[position:]
    if tail:
        runs.append(_run(unescape(tail), bold=bold or strong > 0, italic=emphasis > 0))
    return "".join(runs)


def _paragraph(text: str, style: str | None = None, align: str | None = None, *,
               bold: bool = False, html: str = "") -> str:
    properties = ""
    if style or align:
        properties = "<w:pPr>" + (
            f'<w:pStyle w:val="{style}"/>' if style else ""
        ) + (f'<w:jc w:val="{align}"/>' if align else "") + "</w:pPr>"
    return f"<w:p>{properties}{_runs_from_html(html, bold=bold) if html else _run(text, bold=bold)}</w:p>"


def _fit_emu(info: ImageInfo) -> tuple[int, int]:
    width_cm = CONTENT_WIDTH_CM
    height_cm = width_cm * info.height / info.width
    if height_cm > MAX_HEIGHT_CM:
        height_cm = MAX_HEIGHT_CM
        width_cm = height_cm * info.width / info.height
    return int(width_cm * EMU_PER_CM), int(height_cm * EMU_PER_CM)


def _image_paragraph(image: ImageInfo, rel_id: str, index: int, caption: str) -> str:
    width, height = _fit_emu(image)
    description = escape(caption or image.path.name)
    drawing = (
        "<w:r><w:drawing>"
        '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{width}" cy="{height}"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        f'<wp:docPr id="{index}" name="图片 {index}" descr="{description}"/>'
        "<wp:cNvGraphicFramePr>"
        '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f'<pic:nvPicPr><pic:cNvPr id="{index}" name="{escape(image.path.name)}" descr="{description}"/>'
        "<pic:cNvPicPr/></pic:nvPicPr>"
        f'<pic:blipFill><a:blip r:embed="{rel_id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{width}" cy="{height}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
    )
    return f'<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="200" w:after="80"/></w:pPr>{drawing}</w:p>'


_PARA_RE = re.compile(r"<w:p\b[^>]*?(?:/>|>.*?</w:p>)", re.S)


def _xml_text(fragment: str) -> str:
    """从一段 XML 里取出可见文字，用来和解析结果对齐。"""
    fragment = re.sub(r"<w:tab\b[^>]*/>", "\t", fragment)
    fragment = re.sub(r"<w:br\b[^>]*/>", "\n", fragment)
    return "".join(unescape(part) for part in re.findall(r"<w:t\b[^>]*>(.*?)</w:t>", fragment, re.S))


def _same_text(left: str, right: str) -> bool:
    return re.sub(r"\s+", "", left) == re.sub(r"\s+", "", right)


def _next_image_id(used: set[str]) -> str:
    index = 1
    while f"rIdImage{index}" in used:
        index += 1
    used.add(f"rIdImage{index}")
    return f"rIdImage{index}"


def _ensure_style(styles: str, style_id: str, snippet: str) -> str:
    """源稿样式表里缺哪个样式就补哪个（只补，不改原文已有的）。"""
    if f'w:styleId="{style_id}"' in styles or "</w:styles>" not in styles:
        return styles
    return styles.replace("</w:styles>", snippet + "</w:styles>")


_CAPTION_STYLE_XML = (
    '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/>'
    '<w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/>'
    '<w:spacing w:after="240"/></w:pPr>'
    '<w:rPr><w:color w:val="595959"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>'
)


def write_like_source(path: str | Path, blocks: list[Block], *, template: str | Path,
                      title: str = "") -> Path:
    """照着源稿写：整份复制源文件，只在对应位置插入图片段落。

    这样标题、小标题的样式、字体、行距、编号全都保持原样，导入平台时和源稿表现一致。
    """
    source = Path(template)
    target = Path(path)
    if not source.is_file():
        raise DocxError(f"找不到源稿：{source}")
    with zipfile.ZipFile(source) as archive:
        parts = {name: archive.read(name) for name in archive.namelist() if not name.endswith("/")}
    document = parts.get("word/document.xml")
    if document is None:
        raise DocxError("源稿里没有 word/document.xml。")
    document_text = document.decode("utf-8")
    root = ET.fromstring(document)
    body_node = root.find(W + "body")
    if body_node is None:
        raise DocxError("源稿没有正文。")
    top_paragraphs = [child for child in body_node if child.tag == W + "p"]

    start = document_text.find("<w:body>")
    end = document_text.rfind("</w:body>")
    if start < 0 or end < 0:
        raise DocxError("源稿正文结构不认识。")
    head = document_text[:start + len("<w:body>")]
    body = document_text[start + len("<w:body>"):end]
    tail = document_text[end:]
    spans = [(match.start(), match.end(), _xml_text(match.group(0)))
             for match in _PARA_RE.finditer(body)]
    if len(spans) != len(top_paragraphs):
        raise DocxError("源稿正文里有表格或文本框里的段落，没法原样沿用格式。")

    rels_name = "word/_rels/document.xml.rels"
    rels = parts.get(rels_name, b"").decode("utf-8")
    if "</Relationships>" not in rels:
        rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                "</Relationships>")
    used_ids = set(re.findall(r'Id="([^"]+)"', rels))
    used_media = {name for name in parts if name.startswith("word/media/")}
    content_types = parts.get("[Content_Types].xml", b"").decode("utf-8")
    new_rels: list[str] = []
    new_overrides: list[str] = []
    used_suffixes: set[str] = set()
    image_number = 0

    def emit(block: Block) -> str:
        nonlocal image_number
        if block.kind == "caption":
            return _paragraph(block.text, "Caption")
        if block.image is None:
            return ""
        image_number += 1
        rel_id = _next_image_id(used_ids)
        suffix = block.image.suffix.lstrip(".").lower() or "jpg"
        if suffix == "jpeg":
            suffix = "jpg"
        name = f"image{image_number}.{suffix}"
        while f"word/media/{name}" in used_media:
            image_number += 1
            name = f"image{image_number}.{suffix}"
        used_media.add(f"word/media/{name}")
        used_suffixes.add(suffix)
        parts[f"word/media/{name}"] = block.image.data
        new_rels.append(
            f'<Relationship Id="{rel_id}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
            f'Target="media/{name}"/>'
        )
        if suffix not in {"jpg", "jpeg", "png", "gif"}:
            new_overrides.append(
                f'<Override PartName="/word/media/{name}" ContentType="{block.image.content_type}"/>'
            )
        pieces = [_image_paragraph(block.image, rel_id, image_number, block.caption)]
        if block.caption:
            pieces.append(_paragraph(block.caption, "Caption"))
        return "".join(pieces)

    pieces: list[str] = []
    cursor = 0
    index = 0
    first_text = next((text for _s, _e, text in spans if text.strip()), "")
    if blocks and blocks[0].kind == "title" and not _same_text(blocks[0].text, first_text):
        # 源稿没有标题段（标题取自文件名），补一段标题
        pieces.append(_paragraph(blocks[0].text, "Heading1", bold=True))
        index = 1
    for span_start, span_end, span_text in spans:
        pieces.append(body[cursor:span_start])
        cursor = span_end
        if not span_text.strip():
            continue
        while index < len(blocks) and blocks[index].kind in {"image", "caption"}:
            pieces.append(emit(blocks[index]))
            index += 1
        if index >= len(blocks):
            raise DocxError("排版内容和源稿段落对不上，没法原样沿用格式。")
        block = blocks[index]
        if not _same_text(block.text, span_text):
            raise DocxError(
                f"排版内容和源稿段落对不上（源稿「{span_text[:14]}」／成稿「{block.text[:14]}」）。"
            )
        pieces.append(body[span_start:span_end])
        index += 1
    pieces.append(body[cursor:])
    while index < len(blocks):
        block = blocks[index]
        if block.kind in {"image", "caption"}:
            pieces.append(emit(block))
        elif block.kind == "title":
            pieces.append(_paragraph(block.text, "Heading1", bold=True))
        else:
            level = block.heading or (2 if block.kind == "h2" else 3)
            pieces.append(_paragraph(block.text, f"Heading{min(max(level, 1), 6)}", bold=True,
                                     html=block.html))
        index += 1

    parts["word/document.xml"] = (head + "".join(pieces) + tail).encode("utf-8")
    if new_rels:
        parts[rels_name] = rels.replace("</Relationships>",
                                        "".join(new_rels) + "</Relationships>").encode("utf-8")
        for suffix in used_suffixes:
            if f'Extension="{suffix}"' not in content_types and suffix in {"jpg", "jpeg", "png", "gif"}:
                content_type = "image/jpeg" if suffix in {"jpg", "jpeg"} else f"image/{suffix}"
                content_types = content_types.replace(
                    "</Types>", f'<Default Extension="{suffix}" ContentType="{content_type}"/></Types>')
        parts["[Content_Types].xml"] = content_types.replace(
            "</Types>", "".join(new_overrides) + "</Types>").encode("utf-8")
        styles = parts.get("word/styles.xml", b"").decode("utf-8")
        if styles:
            parts["word/styles.xml"] = _ensure_style(
                styles, "Caption", _CAPTION_STYLE_XML).encode("utf-8")
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)
    return target


def write_document(path: str | Path, blocks: list[Block], *, title: str = "",
                   template: str | Path | None = None) -> Path:
    """把段落和图片写成一份标准 .docx。

    给了 template（源稿）就照源稿写，尽量保留原样式；写不了再退回从零重建。
    """
    if template is not None:
        return write_like_source(path, blocks, template=template, title=title)
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    body: list[str] = []
    relationships: list[str] = []
    content_overrides: list[str] = []
    media: list[tuple[str, bytes]] = []
    image_index = 0

    for block in blocks:
        if block.kind == "title":
            body.append(_paragraph(block.text, "Heading1", bold=True))
        elif block.kind == "h2":
            level = min(max(block.heading or 2, 1), 6)
            body.append(_paragraph(block.text, f"Heading{level}", bold=True, html=block.html))
        elif block.kind == "h3":
            level = min(max(block.heading or 3, 1), 6)
            body.append(_paragraph(block.text, f"Heading{level}", bold=True, html=block.html))
        elif block.kind == "caption":
            body.append(_paragraph(block.text, "Caption"))
        elif block.kind == "p":
            body.append(_paragraph(block.text, html=block.html))
        elif block.kind == "image":
            if block.image is None:
                continue
            image_index += 1
            rel_id = f"rIdImage{image_index}"
            suffix = block.image.suffix.lstrip(".").lower() or "jpg"
            if suffix == "jpeg":
                suffix = "jpg"
            name = f"image{image_index}.{suffix}"
            media.append((f"word/media/{name}", block.image.data))
            relationships.append(
                f'<Relationship Id="{rel_id}" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
                f'Target="media/{name}"/>'
            )
            if suffix not in {"jpg", "jpeg", "png", "gif"}:
                content_overrides.append(
                    f'<Override PartName="/word/media/{name}" ContentType="{block.image.content_type}"/>'
                )
            body.append(_image_paragraph(block.image, rel_id, image_index, block.caption))
            if block.caption:
                body.append(_paragraph(block.caption, "Caption"))
        else:
            raise DocxError(f"未知的段落类型：{block.kind}")

    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document '
        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
        'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">'
        "<w:body>" + "".join(body) +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
        'w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>'
        "</w:body></w:document>"
    )
    document_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(relationships)
        + "</Relationships>"
    )
    core = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties '
        'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        f"<dc:title>{escape(title)}</dc:title>"
        "<dc:creator>文章总库</dc:creator>"
        "<cp:lastModifiedBy>文章总库</cp:lastModifiedBy>"
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}'
        "</dcterms:created>"
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}'
        "</dcterms:modified>"
        "</cp:coreProperties>"
    )
    app = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        "<Application>文章总库</Application></Properties>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _CONTENT_TYPES_HEAD + "".join(content_overrides) + "</Types>")
        archive.writestr("_rels/.rels", _ROOT_RELS)
        archive.writestr("word/document.xml", document)
        archive.writestr("word/_rels/document.xml.rels", document_rels)
        archive.writestr("word/styles.xml", _STYLES)
        archive.writestr("docProps/core.xml", core)
        archive.writestr("docProps/app.xml", app)
        for name, data in media:
            archive.writestr(name, data)
    target.write_bytes(buffer.getvalue())
    return target
