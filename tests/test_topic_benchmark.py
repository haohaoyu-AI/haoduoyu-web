import io
import json
import unittest
import urllib.parse
from unittest.mock import patch

from article_hub import topics


def page(*articles):
    return io.BytesIO("".join(
        '<script data-druid-card-data-id="sample">'
        + json.dumps({"data": article}, ensure_ascii=False) + "</script>"
        for article in articles
    ).encode("utf-8"))


class TopicBenchmarkTests(unittest.TestCase):
    def test_related_benchmark_prioritized_duplicates_and_unrelated_removed(self):
        seen_queries = []
        generic = {"title": "韩红被实名举报，事件有哪些争议", "source": "其他账号",
                   "article_url": "https://www.toutiao.com/article/1/", "read_count": 0}
        benchmark = {"title": "<em>韩红被实名举报</em>后，6 年等来道歉没？", "source": "皮皮电影",
                     "article_url": "https://www.toutiao.com/article/2/?source=search", "comment_count": 3}
        duplicate = dict(benchmark, article_url="https://www.toutiao.com/article/2/?source=other")
        unrelated = {"title": "皮皮电影：爸爸去哪儿的孩子们长大了", "source": "皮皮电影"}

        def search(request, timeout):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query)["keyword"][0]
            seen_queries.append(query)
            if query.startswith("皮皮电影 "):
                return page(unrelated, benchmark, duplicate)
            return page(generic, duplicate)

        with patch.object(topics.urllib.request, "urlopen", side_effect=search):
            result = topics.article_samples("韩红被实名举报", limit=2)
        self.assertEqual(len(seen_queries), 2)
        self.assertEqual([r["账号"] for r in result], ["皮皮电影", "其他账号"])
        self.assertTrue(result[0]["对标样本"])
        self.assertNotIn("<em>", result[0]["标题"])
        rendered = topics.samples_text(result)
        self.assertIn(topics.BENCHMARK_URL, rendered)
        self.assertIn("公开搜索署名匹配", rendered)
        self.assertIn("未读取全文", rendered)
        self.assertIn("阅读：0", rendered)
        self.assertIn("阅读：未展示", rendered)

    def test_benchmark_search_failure_does_not_discard_other_samples(self):
        def search(request, timeout):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query)["keyword"][0]
            if "皮皮电影" in query:
                raise OSError("temporarily unavailable")
            return page({"title": "电影导演谈最新电影作品", "source": "电影报道",
                         "article_url": "javascript:alert(1)"})

        with patch.object(topics.urllib.request, "urlopen", side_effect=search):
            rows = topics.article_samples("电影导演谈最新作品")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["链接"], "")
        self.assertFalse(rows[0]["对标样本"])
        self.assertIn("本次未检索到对标账号的同题文章", topics.samples_text(rows))

    def test_shorter_query_fallback_and_malformed_cards(self):
        def search(request, timeout):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query)["keyword"][0]
            if len(query) > 6:
                return page(None, ["invalid"], {"template_key": "other"})
            return page({"title": "医院推出医疗改革新政策", "source": "新闻", "article_url": "/article/3/"})

        with patch.object(topics.urllib.request, "urlopen", side_effect=search):
            rows = topics.article_samples("医院推出医疗费用新政策")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["链接"], "https://www.toutiao.com/article/3/")

    def test_empty_keyword_and_zero_limit_do_not_search(self):
        with patch.object(topics.urllib.request, "urlopen") as fetch:
            self.assertEqual(topics.article_samples(""), [])
            self.assertEqual(topics.article_samples("医院改革", limit=0), [])
        fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
