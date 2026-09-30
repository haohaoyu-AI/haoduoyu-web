import io
import tempfile
import unittest
from pathlib import Path
from docx import Document
from PIL import Image
from baijiahao_drafts.import_document import compatible_copy
from baijiahao_drafts.articles import load_article


class ImportDocumentTests(unittest.TestCase):
    def test_mislabeled_webp_is_converted_without_changing_pixels_or_text(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, target = root/'文章.docx', root/'副本.docx'
            image = Image.new('RGB', (80,120), 'red')
            jpg, webp = io.BytesIO(), io.BytesIO()
            image.save(jpg, format='JPEG')
            image.save(webp, format='WEBP', lossless=True)
            doc = Document()
            doc.add_heading('文章', 0)
            doc.add_paragraph('正文内容保持一致。')
            doc.add_picture(io.BytesIO(jpg.getvalue()))
            for part in doc.part.related_parts.values():
                if part.content_type == 'image/jpeg':
                    part._blob = webp.getvalue()
            doc.save(source)
            before = source.read_bytes()
            compatible_copy(source, target)
            self.assertEqual(before, source.read_bytes())
            imported = load_article(target)
            self.assertEqual(len(imported.images), 1)
            self.assertEqual(Image.open(io.BytesIO(imported.images[0].data)).format, 'PNG')
