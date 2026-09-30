import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from article_hub.file_clipboard import copy_topic_files


class FileClipboardTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'win32', '剪贴板投递使用 Windows PowerShell 和文件拖放格式')
    def test_multiple_unicode_files_are_data_not_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = [root / name for name in ('选题1.md', "选题 $x '2.md", '选题3.md')]
            for path in paths:
                path.write_text(
                    '# 建议标题：测试\n\n文章提示词：\n\n'
                    '什么事：这里是一条已经确认进入写作流程的事件线索\n'
                    '值得写：事件存在现实影响；可从具体当事人的实际处境角度切入。\n'
                    '特殊要求：无，由写作团判断\n'
                    '建议标题：测试标题（仅供参考，可调整）\n\n'
                    '图片提示词：\n\n- 不应复制的图片词\n', encoding='utf-8')
            with patch('article_hub.file_clipboard.subprocess.run', return_value=Mock(returncode=0)) as run:
                self.assertEqual(copy_topic_files(list(map(str, paths)), root, paths), 3)
                copied = [str(root / '.得到大脑交接' / path.name) for path in paths]
                self.assertEqual(json.loads(run.call_args.kwargs['input']), copied)
                self.assertIn('Set-Clipboard -LiteralPath', run.call_args.args[0][-1])
                self.assertTrue(all('图片提示词' not in Path(path).read_text(encoding='utf-8')
                                    for path in copied))

    def test_missing_or_outside_batch_does_not_touch_clipboard(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'unselected.md'
            path.touch()
            with patch('article_hub.file_clipboard.subprocess.run') as run:
                with self.assertRaises(ValueError):
                    copy_topic_files([str(path)], root, [])
                run.assert_not_called()
