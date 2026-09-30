import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from article_hub import archive_cleanup as cleanup

class ArchiveCleanupTests(unittest.TestCase):
    def test_flatten_and_recover_without_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            folder=root/'已分发归档'/'article'
            folder.mkdir(parents=True)
            (folder/'.分发归档.json').write_text('{"源目录待清理":false}',encoding='utf-8')
            (folder/'成稿.docx').write_bytes(b'final')
            (folder/'原文.docx').write_bytes(b'original')
            (folder.parent/'成稿.docx').write_bytes(b'previous')
            with patch.object(cleanup.config,'ROOT',root),patch.object(cleanup.config,'DATA',root/'data'):
                plans=cleanup.preview()
                self.assertEqual(len(plans),1)
                result=cleanup.execute(plans)
                self.assertFalse(folder.exists())
                self.assertEqual((Path(result['backup'])/'article'/'原文.docx').read_bytes(),b'original')
                self.assertEqual((folder.parent/'成稿.docx').read_bytes(),b'previous')
                self.assertEqual(len(list(folder.parent.glob('*.docx'))),2)
                self.assertEqual(cleanup.preview(),[])
