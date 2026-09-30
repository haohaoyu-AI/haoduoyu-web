import json
import tempfile
import unittest
from pathlib import Path
from dataclasses import replace
from unittest.mock import patch, MagicMock
from article_hub import sourcing, ai
from article_hub.hits import Hit
from article_hub.docxio import Block
from playwright.sync_api import TimeoutError as BrowserTimeout

class SourcingRecoveryTests(unittest.TestCase):
    def setUp(self):
        mock = patch.object(sourcing, '_image_ai_profile', return_value=None)
        mock.start(); self.addCleanup(mock.stop)

    def doc(self):
        return type('Doc', (), {'title': '尸皮针调查', 'blocks': [Block('title','尸皮针调查'),Block('h2','产品原料'),Block('p','Elravie Re2O 尸皮针的原料调查。'*100),Block('h2','市场风险'),Block('p','尸皮针市场风险。'*100)]})()

    def hit(self, query='Elravie Re2O 包装 西林瓶'):
        return Hit('今日头条',query,'三千多一针的抗衰针，原料竟取自死人皮肤','新闻','https://image/a','https://article/a',1000,800)

    def test_semantics_not_blocked_by_missing_literal_brand(self):
        hit=self.hit()
        self.assertFalse(sourcing.is_relevant(hit,hit.query))
        with patch.object(sourcing,'_model_json',return_value={'keep':[0]}):
            kept=sourcing.model_filter_hits(self.doc(),[hit],['Elravie','Re2O'])
        self.assertEqual(len(kept),1)
        self.assertEqual(sourcing.rejection_reason(kept[0],self.doc(),['Elravie']), '')

    def test_duplicate_image_retains_independent_section_context(self):
        hit=self.hit('产品原料')
        second=replace(hit,query='市场风险')
        with patch.object(sourcing,'_model_json',return_value={'keep':[1]}) as model:
            kept=sourcing.model_filter_hits(self.doc(),[hit,second],['Elravie'],queries=[sourcing.Query('产品原料',1),sourcing.Query('市场风险',3)])
        self.assertEqual(kept[0].query,'市场风险')
        self.assertFalse(sourcing.matches_position(kept[0],self.doc(),[sourcing.Query('市场风险',3)],1,2,['Elravie']))

    def test_timeout_keeps_other_source_candidates(self):
        broken=MagicMock(); broken.name='小红书'; broken.search.side_effect=BrowserTimeout('timeout')
        good=MagicMock(); good.name='今日头条'; good.search.return_value=[self.hit()]
        hits,warnings=sourcing.collect_hits([broken,good],[sourcing.Query('词')],pause=0,hint=lambda _:None)
        self.assertEqual(len(hits),1)
        self.assertTrue(warnings)

    def test_browser_navigation_timeout_is_wrapped(self):
        from article_hub.xiaohongshu import XiaohongshuSource, XiaohongshuError
        source=XiaohongshuSource(); source._page=MagicMock();source._page.goto.side_effect=BrowserTimeout('timeout')
        source._page.title.return_value='小红书';source._page.url='https://www.xiaohongshu.com/'
        with patch.object(source,'open'),patch.object(source,'logged_in',return_value=True):
            with self.assertRaises(XiaohongshuError):source.search('查询')

    def test_unexpected_article_failure_does_not_stop_batch(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); topics=[root/'one',root/'two']
            for p in topics:p.mkdir()
            result=sourcing.SourcingResult('two','two',topics[1])
            source=MagicMock()
            with patch.object(sourcing.config,'ROOT',root),patch.object(sourcing.config,'DATA',root/'data'),patch.object(sourcing,'discover_topics',return_value=topics),patch.object(sourcing,'build_sources',return_value=([source],[])),patch.object(sourcing,'source_topic',side_effect=[BrowserTimeout('oops'),result]) as worker:
                code=sourcing.run(queries_only=True,hint=lambda _:None)
            self.assertEqual(code,1);self.assertEqual(worker.call_count,2)
            self.assertTrue(list((root/'logs').glob('配图-*.log')))

    def test_progress_write_failure_does_not_abort_image_work(self):
        from article_hub import image_review

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            topic = root / 'article'
            topic.mkdir()
            result = sourcing.SourcingResult(topic.name, topic.name, topic)
            lines = []
            with patch.object(sourcing.config, 'ROOT', root), \
                 patch.object(sourcing.config, 'DATA', root / 'data'), \
                 patch.object(sourcing, 'discover_topics', return_value=[topic]), \
                 patch.object(sourcing, 'build_sources', return_value=([], [])), \
                 patch.object(sourcing, 'source_topic', return_value=result) as worker, \
                 patch.object(image_review, '_write_status',
                              side_effect=PermissionError(5, 'in use')):
                code = sourcing.run(queries_only=True, hint=lines.append)

            self.assertEqual(code, 0)
            worker.assert_called_once()
            warnings = [line for line in lines if '配图进度面板暂时无法更新' in line]
            self.assertEqual(len(warnings), 1)
            self.assertTrue(list((root / 'logs').glob('配图-*.log')))

    def test_partial_images_are_saved_but_not_finalized(self):
        import json
        from PIL import Image
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'draft.docx').touch()
            image=root/'image.jpg';Image.new('RGB',(1000,800),'red').save(image)
            analysis=sourcing.Analysis([sourcing.Query('尸皮针')],['尸皮针'],[])
            with patch.dict(sourcing.os.environ,{'ARTICLE_HUB_IMAGE_AI':'0'}), \
                 patch.object(sourcing,'read_document',return_value=self.doc()), \
                 patch.object(sourcing,'analyze',return_value=analysis), \
                 patch.object(sourcing,'collect_hits',return_value=([],[])), \
                 patch.object(sourcing,'choose_images',return_value=([],[])), \
                 patch.object(sourcing.layout,'format_topic') as layout:
                with self.assertRaisesRegex(sourcing.SourcingError, '当前 1 张'):
                    sourcing.source_topic(root,sources=[],do_layout=True,hint=lambda _:None)
            layout.assert_not_called()
            self.assertTrue(sourcing.needs_more_images(root))
            manifest=json.loads((root/sourcing.MANIFEST_FILE).read_text(encoding='utf-8'))
            self.assertEqual(len(manifest['配图']),1)

    def test_generated_queries_refresh_but_manual_edits_survive(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'draft.docx').touch()
            analysis=sourcing.Analysis([sourcing.Query('新词')],['主体'],[])
            sourcing.write_query_file(root,[sourcing.Query('旧词')])
            with patch.dict(sourcing.os.environ,{'ARTICLE_HUB_IMAGE_AI':'1'}),patch.object(sourcing,'read_document',return_value=self.doc()),patch.object(sourcing,'analyze',return_value=analysis),patch.object(sourcing,'model_analysis',return_value=analysis),patch.object(sourcing.ai,'settings',return_value={'模型':'test'}):
                result=sourcing.source_topic(root,sources=[],queries_only=True,hint=lambda _:None)
                self.assertEqual(result.queries[0].text,'新词')
                (root/sourcing.QUERY_FILE).write_text('人工指定词',encoding='utf-8')
                result=sourcing.source_topic(root,sources=[],queries_only=True,hint=lambda _:None)
                self.assertEqual(result.queries[0].text,'人工指定词')

    def test_long_article_expands_generated_query_budget_to_target(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'draft.docx').touch()
            old=[sourcing.Query(f'旧词{index}') for index in range(12)]
            expanded=sourcing.Analysis(
                [sourcing.Query(f'长文搜索词{index}') for index in range(20)], ['主体'], [])
            sourcing.write_query_file(root,old)
            with patch.dict(sourcing.os.environ,{'ARTICLE_HUB_IMAGE_AI':'0'}), \
                 patch.object(sourcing,'read_document',return_value=self.doc()), \
                 patch.object(sourcing,'resolved_target_count',return_value=20), \
                 patch.object(sourcing,'analyze',return_value=expanded) as analyze:
                result=sourcing.source_topic(root,sources=[],queries_only=True,hint=lambda _:None)
            self.assertEqual(analyze.call_args.kwargs['limit'],sourcing.candidate_target(20))
            self.assertEqual(sourcing.candidate_target(20),25)
            self.assertEqual(len(result.queries),20)
            self.assertEqual(result.queries[-1].text,'长文搜索词19')

    def test_model_filter_error_or_empty_keeps_raw_hits_for_rule_selection(self):
        for outcome in (ValueError('fixture filter failure'), []):
            with self.subTest(outcome=type(outcome).__name__):
                with tempfile.TemporaryDirectory() as temp:
                    root=Path(temp);(root/'draft.docx').touch()
                    analysis=sourcing.Analysis([sourcing.Query('尸皮针')],['尸皮针'],[])
                    raw=[self.hit('尸皮针')]
                    def choose(document,hits,**kwargs):
                        self.assertEqual(hits,raw)
                        self.assertFalse(hits[0].semantic_approved)
                        raise RuntimeError('rule selection reached')
                    model_filter = patch.object(
                        sourcing,'model_filter_hits',side_effect=outcome
                        if isinstance(outcome,Exception) else None,
                        return_value=outcome if not isinstance(outcome,Exception) else None)
                    with patch.dict(sourcing.os.environ,{'ARTICLE_HUB_IMAGE_AI':'1'}), \
                         patch.object(sourcing,'read_document',return_value=self.doc()), \
                         patch.object(sourcing,'analyze',return_value=analysis), \
                         patch.object(sourcing,'model_analysis',return_value=analysis), \
                         patch.object(sourcing.ai,'settings',return_value={'模型':'test'}), \
                         patch.object(sourcing,'collect_hits',return_value=(raw,[])), \
                         model_filter, patch.object(sourcing,'choose_images',side_effect=choose):
                        with self.assertRaisesRegex(RuntimeError,'rule selection reached'):
                            sourcing.source_topic(root,sources=[],hint=lambda _:None)

    def test_existing_five_images_wait_for_review_without_search_or_generator(self):
        from PIL import Image
        from article_hub import image_review
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); (root/'draft.docx').touch()
            for index in range(sourcing.candidate_target(5)):
                Image.new('RGB',(1000,800),(index*30,20,20)).save(root/f'image{index}.jpg')
            (root/sourcing.MANIFEST_FILE).write_text(
                json.dumps({'建议配图数': 5,
                            '配图计划版本': sourcing.IMAGE_PLAN_VERSION,
                            '配图': []}), encoding='utf-8')
            formatted=MagicMock();formatted.images=5
            with patch.object(sourcing,'read_document',return_value=self.doc()), \
                 patch.object(sourcing,'collect_hits') as search, \
                 patch.object(sourcing,'supplement_with_ai') as supplement, \
                 patch.object(sourcing.layout,'format_topic',return_value=formatted) as fmt, \
                 patch.object(sourcing.layout,'archive_source',return_value=root):
                result=sourcing.source_topic(root,sources=[],hint=lambda _:None)
            search.assert_not_called();supplement.assert_not_called();fmt.assert_not_called()
            self.assertFalse(sourcing.needs_more_images(root))
            review = image_review.load_review(root)
            self.assertTrue(review['needs_layout'])
            self.assertEqual(set(review['states'].values()), {'pending'})
