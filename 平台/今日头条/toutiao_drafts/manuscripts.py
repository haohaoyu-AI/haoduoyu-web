"""Discover loose manuscripts and packaged articles without selecting sidecars."""
import json
from pathlib import Path

SIDECARS = {'配图来源', '配图顺序', '搜索词', 'README', '说明'}


def manuscript_files(root):
    root = Path(root).resolve()
    def walk(folder):
        children = sorted(folder.iterdir())
        files = [p for p in children if p.is_file() and not p.is_symlink()
                 and p.resolve().is_relative_to(root) and not p.name.startswith(('~$', '.'))]
        docx = [p for p in files if p.suffix.lower() == '.docx']
        if (folder / '配图清单.json').is_file():
            # System packages contain both source and output; upload only outputs.
            docx = [p for p in docx if p.name != '原文.docx']
        yield from docx
        # Accompanying source notes are not separate drafts when a Word is present.
        if not docx:
            yield from (p for p in files if p.suffix.lower() in {'.md', '.txt'}
                        and p.stem not in SIDECARS)
        for p in children:
            if p.is_dir() and not p.is_symlink() and not p.name.startswith('.'):
                if p.name not in {'配图', 'images', '素材'}:
                    yield from walk(p)
    if root.is_dir():
        yield from walk(root)


def embedded_image_count(path):
    import zipfile
    from xml.etree import ElementTree as ET
    try:
        with zipfile.ZipFile(path) as archive:
            root = ET.fromstring(archive.read('word/document.xml'))
            return len(root.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'))
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, ET.ParseError):
        return 0
