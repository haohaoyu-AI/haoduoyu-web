import unittest
from unittest.mock import patch, MagicMock
from article_hub import sourcing

class SourceLoginTests(unittest.TestCase):
    def test_saved_login_does_not_prompt(self):
        source = MagicMock()
        source.logged_in.return_value = True
        with patch.object(sourcing, 'XiaohongshuSource', return_value=source):
            sources, warnings = sourcing.build_sources(['小红书'])
        self.assertEqual(sources, [source])
        self.assertEqual(warnings, [])
        source.login.assert_not_called()

    def test_missing_login_never_prompts_or_waits(self):
        source = MagicMock()
        source.logged_in.return_value = False
        source.login.return_value = True
        with patch.object(sourcing, 'XiaohongshuSource', return_value=source):
            sources, warnings = sourcing.build_sources(['小红书'])
        self.assertEqual(sources, [])
        self.assertTrue(warnings)
        source.login.assert_not_called()
        source.close.assert_called_once()

    def test_cancelled_login_closes_browser_and_keeps_other_source(self):
        source = MagicMock()
        source.logged_in.return_value = False
        source.login.return_value = False
        with patch.object(sourcing, 'XiaohongshuSource', return_value=source):
            sources, warnings = sourcing.build_sources(['今日头条', '小红书'])
        self.assertEqual(len(sources), 1)
        self.assertTrue(warnings)
        source.close.assert_called_once()
        source.login.assert_not_called()

    def test_browser_busy_keeps_other_source_without_login(self):
        source = MagicMock()
        source.open.side_effect = RuntimeError('浏览器配置占用')
        with patch.object(sourcing, 'XiaohongshuSource', return_value=source):
            sources, warnings = sourcing.build_sources(['今日头条', '小红书'])
        self.assertEqual(len(sources), 1)
        self.assertIn('占用', warnings[0])
        source.login.assert_not_called()
        source.close.assert_called_once()
