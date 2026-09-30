import importlib
import sys
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import Mock, patch


@dataclass
class Article:
    source: Path
    title: str = ''
    text: str = '完整正文'
    images: tuple = ()
    warnings: tuple = ()
    fingerprint: str = 'unchanged'


class TitleTests(unittest.TestCase):
    def module(self, base, name):
        platform_root = Path(__file__).resolve().parents[1] / "平台" / base
        sys.path.insert(0, str(platform_root.resolve()))
        return importlib.import_module(name)

    def test_zhihu_numbered_references_read_back_without_losing_content(self):
        m = self.module('知乎', 'zhihu_drafts.browser')
        locator = Mock()
        locator.inner_text.return_value = '完整正文\n\u200b\n参考甲\n\u200b\n参考乙'
        locator.evaluate.return_value = [{'start': 1, 'items': [
            {'text': '\u200b\n参考甲', 'value': None},
            {'text': '\u200b\n参考乙', 'value': None},
        ]}]
        body = m.ZhihuBrowser._body_text(locator)
        article = Article(Path('fake'), text='完整正文\n1. 参考甲\n2. 参考乙')
        self.assertTrue(m.ZhihuBrowser._body_matches(body, article))
        self.assertFalse(m.ZhihuBrowser._body_matches(body.replace('参考乙', ''), article))
        self.assertFalse(m.ZhihuBrowser._body_matches(body.replace('2.', '3.'), article))

    def test_zhihu_list_start_and_explicit_values(self):
        m = self.module('知乎', 'zhihu_drafts.browser')
        locator = Mock()
        locator.inner_text.return_value = '甲\n乙\n丙'
        locator.evaluate.return_value = [{'start': 3, 'items': [
            {'text': '甲', 'value': None}, {'text': '乙', 'value': '8'},
            {'text': '丙', 'value': None},
        ]}]
        self.assertEqual(m.ZhihuBrowser._body_text(locator), '3. 甲\n8. 乙\n9. 丙')

    def test_zhihu_existing_literal_number_is_not_duplicated(self):
        m = self.module('知乎', 'zhihu_drafts.browser')
        locator = Mock()
        locator.inner_text.return_value = '1. 参考甲'
        locator.evaluate.return_value = [{'start': 1, 'items': [
            {'text': '1. 参考甲', 'value': None}]}]
        self.assertEqual(m.ZhihuBrowser._body_text(locator), '1. 参考甲')

    def test_all_platform_temporary_titles_stable_and_keep_identity(self):
        for base, name in [('今日头条','toutiao_drafts'), ('知乎','zhihu_drafts'),
                           ('百家号','baijiahao_drafts')]:
            module = self.module(base, name + '.draft_titles')
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'manual.docx'
                path.touch()
                article = Article(path, title='manual', warnings=('未找到明确的文章标题，使用文件名；首段已完整保留。',))
                first, second = module.draft_article(article), module.draft_article(article)
                self.assertRegex(first.title, r'^\d{14}$')
                self.assertEqual(first.title, second.title)
                self.assertEqual(first.fingerprint, article.fingerprint)
                self.assertEqual(article.title, 'manual')
                original = Article(path, title='原文标题')
                self.assertIs(module.draft_article(original), original)

    def test_zhihu_fills_even_when_body_does_not_match(self):
        m = self.module('知乎', 'zhihu_drafts.browser')
        browser = m.ZhihuBrowser.__new__(m.ZhihuBrowser)
        browser._observe_url = Mock()
        browser._check_callback = Mock()
        browser._read_content = Mock(return_value=('', '部分正文'))
        browser._image_count = Mock(return_value=0)
        page = Mock()
        with patch.object(m.time, 'monotonic', side_effect=[0, 0, 2]):
            self.assertFalse(browser._wait_for_import(page, Article(Path('fake'), title='20260918120000'), None, 1))
        page.locator.return_value.fill.assert_called_once_with('20260918120000')

    def test_toutiao_fills_before_title_stability_wait(self):
        m = self.module('今日头条', 'toutiao_drafts.browser')
        browser = m.ToutiaoBrowser.__new__(m.ToutiaoBrowser)
        browser._editor_state = Mock(return_value={'title':'', 'body':'正文', 'images':0})
        browser._find_title = Mock()
        with patch.object(m.time, 'monotonic', side_effect=[0, 0, 2]):
            browser._wait_for_import(Mock(), Article(Path('fake'), title='系统标题'), timeout=1)
        browser._find_title.return_value.fill.assert_called_once_with('系统标题')

    def test_baijiahao_fills_even_before_body_arrives(self):
        m = self.module('百家号', 'baijiahao_drafts.browser')
        browser = m.BaijiahaoBrowser.__new__(m.BaijiahaoBrowser)
        browser._observe_url = Mock()
        browser._check_callback = Mock()
        browser._read_content = Mock(return_value=('', ''))
        browser._image_count = Mock(return_value=0)
        browser._fill_title = Mock()
        page, title, body = Mock(), Mock(), Mock()
        page.get_by_text.return_value.count.return_value = 0
        page.locator.return_value.count.return_value = 0
        with patch.object(m.time, 'monotonic', side_effect=[0, 0, 2]):
            self.assertFalse(browser._wait_for_import(page, title, body, Article(Path('fake'), title='系统标题'), None, 1))
        browser._fill_title.assert_called_once_with(page, title, '系统标题')
