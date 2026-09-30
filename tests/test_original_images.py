import unittest
from unittest.mock import patch, MagicMock
from article_hub import toutiao, sourcing
from article_hub.hits import Hit


class OriginalImagesTests(unittest.TestCase):
    def test_lazy_originals_keep_complete_url(self):
        hit = Hit('今日头条', '电影', '电影海报', '南都', 'https://signed/preview',
                  'https://m.mp.oeeee.com/a/article.html', 959,1079)
        response = MagicMock()
        response.__enter__.return_value = response
        response.geturl.return_value = hit.page_url
        response.read.return_value = b'<img src="data:image/gif" original="https://p1-mp.oeeee.com/202609/16/1920x1080_x.jpg">'
        with patch.object(toutiao.urllib.request, 'urlopen', return_value=response):
            result = toutiao.publisher_originals(hit)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].image_url, 'https://p1-mp.oeeee.com/202609/16/1920x1080_x.jpg')
        self.assertEqual(result[0].width, 0)
        self.assertEqual(hit.width, 959)

    def test_explicit_crop_is_not_selected(self):
        hit = Hit('今日头条', '电影', '海报', '来源', 'https://img/a~tplv-crop-center:1920:1080.jpg', 'page')
        self.assertIn('裁剪', sourcing.rejection_reason(hit, None, []))
