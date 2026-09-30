"""Provider contract regressions: search through scoring and image persistence."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from article_hub import douban, sourcing
from article_hub.docxio import Block
from article_hub.hits import Hit
from tests.test_sourcing import png_bytes


class DoubanTests(unittest.TestCase):
    def test_search_follows_movie_to_still_album(self):
        search = '<a href="https://movie.douban.com/subject/123/">电影</a>'
        album = '<title>复联4 剧照</title><img src="https://img1.doubanio.com/view/photo/m/public/still.jpg">'
        with patch.object(douban, '_fetch', side_effect=[search, album]) as fetch:
            hits = douban.search('复联4')
        self.assertEqual(len(hits), 1)
        self.assertIn('/l/public/', hits[0].image_url)
        self.assertEqual(hits[0].title, '复联4 剧照')
        self.assertIn('photos?type=S', fetch.call_args.args[0])

    def test_search_candidates_can_be_scored_downloaded_and_saved(self):
        html = '<title>复联4 剧照</title><img src="https://img1.doubanio.com/view/photo/s/public/test.jpg">'
        with patch.object(douban, '_fetch', side_effect=['<a href="https://movie.douban.com/subject/123/">电影</a>', html]):
            hits = douban.search('复联4')
        self.assertEqual(len(hits), 1)
        self.assertIsInstance(hits[0], Hit)
        self.assertEqual(hits[0].platform, '豆瓣')
        self.assertFalse(hits[0].landscape)  # Unknown dimensions aren't landscape evidence.
        sourcing.score_hit(hits[0], '复联4')
        document = SimpleNamespace(title='复联4', blocks=[Block('p', '复联4重映。')])
        with tempfile.TemporaryDirectory() as temporary:
            chosen, _ = sourcing.choose_images(
                document, hits, max_images=1, topic_dir=Path(temporary),
                queries=[sourcing.Query('复联4')], anchors=['复联4'],
                fetch=lambda hit: png_bytes(1200, 800), hint=lambda _: None,
            )
            self.assertEqual(len(chosen), 1)
            self.assertTrue(any(Path(temporary).glob('*.jpg')))

    def test_bad_candidate_does_not_discard_valid_candidates(self):
        hit = Hit('豆瓣', '复联4', '复联4', '豆瓣', 'https://img/a', 'https://page/a')
        source = SimpleNamespace(name='豆瓣', search=lambda _: [object(), hit])
        hits, warnings = sourcing.collect_hits(
            [source], [sourcing.Query('复联4')], pause=0, hint=lambda _: None,
        )
        self.assertEqual(hits, [hit])
        self.assertTrue(any('1 条格式异常' in warning for warning in warnings))
