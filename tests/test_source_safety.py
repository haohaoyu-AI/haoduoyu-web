import unittest
from unittest.mock import Mock, patch
from article_hub import douban
from article_hub.xiaohongshu import XiaohongshuSource, XiaohongshuError

class SourceSafetyTests(unittest.TestCase):
    def test_unknown_douban_image_is_not_relabelled(self):
        with patch.object(douban,'_fetch',return_value='<img src="https://img1.doubanio.com/view/photo/s/public/a.jpg">'):
            self.assertEqual(douban.search('晚会幕后'),[])

    def test_unrelated_album_rejected(self):
        with patch.object(douban,'_fetch',side_effect=['https://movie.douban.com/subject/123/', '<title>其他电影 剧照</title><img src="https://img1.doubanio.com/view/photo/s/public/a.jpg">']):
            self.assertEqual(douban.search('晚会幕后'),[])

    def source(self):
        s=XiaohongshuSource(hint=lambda _:None)
        s.open=Mock();s.logged_in=Mock(return_value=True)
        s._page=Mock();s._page.title.return_value='搜索';s._page.url='https://www.xiaohongshu.com/search_result'
        s._page.eval_on_selector_all.return_value=[]
        return s

    def test_challenge_stops_without_retry(self):
        s=self.source();s._page.title.return_value='安全验证'
        for word in ('词一','词二'):
            with self.assertRaisesRegex(XiaohongshuError,'安全验证'):s.search(word)
        self.assertEqual(s._page.goto.call_count,1)

    def test_loading_retry_and_cache(self):
        s=self.source();s._page.goto.side_effect=[TimeoutError(),None]
        self.assertEqual(s.search('测试  搜索'),[])
        self.assertEqual(s.search('测试 搜索'),[])
        self.assertEqual(s._page.goto.call_count,2)
