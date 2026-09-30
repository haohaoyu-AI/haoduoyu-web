"""全网图片适配器测试：全部使用内存 fixture，不访问网络。"""

import socket
import sys
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from article_hub import web_images  # noqa: E402


PUBLIC_DNS = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]


class FakeResponse:
    def __init__(self, body=b"image", *, url="https://cdn.example.com/a.jpg",
                 content_type="image/jpeg", content_length=None):
        self.body = body
        self.url = url
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        if content_length is not None:
            self.headers["Content-Length"] = str(content_length)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self, size=-1):
        return self.body if size < 0 else self.body[:size]

    def geturl(self):
        return self.url


class FakeOpener:
    def __init__(self, response):
        self.response = response
        self.request = None

    def open(self, request, timeout=None):
        self.request = request
        return self.response


class ParsingTests(unittest.TestCase):
    def test_parse_bing_fixture_and_deduplicate_signed_urls(self):
        html = """
        <a class="iusc" m='{&quot;murl&quot;:&quot;https://cdn.example/a.jpg?x=1&quot;,
          &quot;purl&quot;:&quot;https://news.example/story&quot;,
          &quot;t&quot;:&quot;白蛇 缘起 海报&quot;,&quot;ow&quot;:1600,&quot;oh&quot;:900}'></a>
        <a m='{&quot;murl&quot;:&quot;https://cdn.example/a.jpg?x=2&quot;,
          &quot;t&quot;:&quot;重复图&quot;}' class="iusc"></a>
        <a class="iusc" m='not json'></a>
        <a class="iusc" m='{"murl":"javascript:bad","t":"坏地址"}'></a>
        """
        hits = web_images.parse_hits(html, query="白蛇缘起")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].platform, "全网图片")
        self.assertEqual(hits[0].query, "白蛇缘起")
        self.assertEqual(hits[0].title, "白蛇 缘起 海报")
        self.assertEqual(hits[0].source, "news.example")
        self.assertEqual((hits[0].width, hits[0].height), (1600, 900))

    def test_search_uses_local_mock_response(self):
        fixture = b'<a class="iusc" m="{&quot;murl&quot;:&quot;https://img.example/x.jpg&quot;,&quot;t&quot;:&quot;fixture&quot;}"></a>'
        response = FakeResponse(fixture, url=web_images.SEARCH_URL, content_type="text/html; charset=utf-8")
        with patch("article_hub.web_images.urllib.request.urlopen", return_value=response) as mocked:
            hits = web_images.search("本地测试")
        self.assertEqual([(hit.query, hit.title) for hit in hits], [("本地测试", "fixture")])
        self.assertIn("q=%E6%9C%AC%E5%9C%B0%E6%B5%8B%E8%AF%95", mocked.call_args.args[0].full_url)

    def test_search_reads_async_cards_when_main_page_is_only_a_shell(self):
        fixture = b'<a class="iusc" m="{&quot;murl&quot;:&quot;https://img.example/x.jpg&quot;,&quot;t&quot;:&quot;fixture&quot;}"></a>'
        shell = FakeResponse(b'<html><title>Images</title></html>', content_type="text/html; charset=utf-8")
        async_cards = FakeResponse(fixture, content_type="text/html; charset=utf-8")
        with patch("article_hub.web_images.urllib.request.urlopen",
                   side_effect=[shell, async_cards]) as mocked:
            hits = web_images.search("本地测试")
        self.assertEqual([(hit.query, hit.title) for hit in hits], [("本地测试", "fixture")])
        self.assertEqual(mocked.call_count, 2)
        self.assertTrue(mocked.call_args.args[0].full_url.startswith(web_images.ASYNC_URL))

    def test_later_search_page_uses_same_provider_and_advances_offset(self):
        fixture=b'<a class="iusc" m="{&quot;murl&quot;:&quot;https://img.example/page2.jpg&quot;,&quot;t&quot;:&quot;page 2&quot;}"></a>'
        response=FakeResponse(fixture,content_type='text/html; charset=utf-8')
        with patch('article_hub.web_images.urllib.request.urlopen',return_value=response) as mocked:
            hits=web_images.search('国乒男团',page=2)
        self.assertEqual([hit.title for hit in hits],['page 2'])
        request_url=mocked.call_args.args[0].full_url
        self.assertTrue(request_url.startswith(web_images.ASYNC_URL))
        self.assertIn('first=71',request_url)
        with self.assertRaisesRegex(web_images.WebImageError,'页码不合法'):
            web_images.search('国乒男团',page=21)


class DownloadSafetyTests(unittest.TestCase):
    def test_rejects_non_http_and_private_dns_answers(self):
        with self.assertRaises(web_images.WebImageError):
            web_images.download("file:///etc/passwd")
        private = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.9", 80))]
        with patch("article_hub.web_images.socket.getaddrinfo", return_value=private):
            with self.assertRaisesRegex(web_images.WebImageError, "私有网络"):
                web_images.download("http://images.example/a.jpg")

    def test_redirect_handler_revalidates_target(self):
        req = urllib.request.Request("https://public.example/a.jpg")
        handler = web_images._SafeRedirectHandler()
        private = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]
        with patch("article_hub.web_images.socket.getaddrinfo", return_value=private):
            with self.assertRaises(web_images.WebImageError):
                handler.redirect_request(req, None, 302, "Found", {}, "http://evil.example/x")

    def test_download_accepts_image_and_passes_limit_to_read(self):
        response = FakeResponse(b"abc", content_type="image/png")
        opener = FakeOpener(response)
        with patch("article_hub.web_images.socket.getaddrinfo", return_value=PUBLIC_DNS), \
                patch("article_hub.web_images._build_opener", return_value=opener):
            self.assertEqual(web_images.download("https://cdn.example.com/a.png", max_bytes=5), b"abc")
        self.assertEqual(opener.request.full_url, "https://cdn.example.com/a.png")

    def test_rejects_wrong_content_type_and_oversized_stream(self):
        with patch("article_hub.web_images.socket.getaddrinfo", return_value=PUBLIC_DNS):
            opener = FakeOpener(FakeResponse(b"<html>", content_type="text/html"))
            with patch("article_hub.web_images._build_opener", return_value=opener):
                with self.assertRaisesRegex(web_images.WebImageError, "不是图片"):
                    web_images.download("https://cdn.example.com/a", max_bytes=8)

            opener = FakeOpener(FakeResponse(b"123456", content_type="image/jpeg"))
            with patch("article_hub.web_images._build_opener", return_value=opener):
                with self.assertRaisesRegex(web_images.WebImageError, "过大"):
                    web_images.download("https://cdn.example.com/a.jpg", max_bytes=5)

    def test_rejects_private_final_url_even_with_mocked_opener(self):
        response = FakeResponse(url="http://127.0.0.1/secret", content_type="image/png")
        opener = FakeOpener(response)

        def resolve(host, port, **_kwargs):
            address = "127.0.0.1" if host == "127.0.0.1" else "93.184.216.34"
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

        with patch("article_hub.web_images.socket.getaddrinfo", side_effect=resolve), \
                patch("article_hub.web_images._build_opener", return_value=opener):
            with self.assertRaises(web_images.WebImageError):
                web_images.download("https://cdn.example.com/a.png")


class AdapterTests(unittest.TestCase):
    def test_source_has_sourcing_compatible_interface(self):
        source = web_images.WebImageSource()
        with patch("article_hub.web_images.search", return_value=[]) as search_mock, \
                patch("article_hub.web_images.download", return_value=b"x") as download_mock:
            self.assertEqual(source.search("电影"), [])
            self.assertEqual(source.download("https://example.com/a.jpg"), b"x")
        search_mock.assert_called_once_with("电影", page=0)
        download_mock.assert_called_once()
        self.assertIsNone(source.close())

    def test_adapter_exposes_bounded_followup_pages(self):
        source = web_images.WebImageSource()
        with patch('article_hub.web_images.search', return_value=[]) as search_mock:
            self.assertEqual(source.search_page('国乒男团', 1), [])
        search_mock.assert_called_once_with('国乒男团', page=1)


if __name__ == "__main__":
    unittest.main()
