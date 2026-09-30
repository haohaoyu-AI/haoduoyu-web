import unittest
from unittest.mock import patch
from article_hub import topics,sourcing
from article_hub.hits import Hit
from article_hub.docxio import Block
import json

class EditorialTests(unittest.TestCase):
    def test_rerank_keeps_grounded_original_rows_and_reason(self):
        board=[{'标题':['医院收费','学校食堂','员工合同','电影导演'][i],'排名':i+1,'热度':100} for i in range(4)]
        ranking=[{'id':i,'reason':'需核实原始公告','angle':'费用变化'} for i in [3,1,0,2]]
        with patch.object(topics,'pick',return_value=board), patch.object(topics.ai,'chat',return_value=json.dumps({'ranking':ranking})):
            result=topics.editorial_pick(board,count=2,hint=lambda _:None)
        self.assertEqual(result[0]['标题'],'电影导演');self.assertIn('推荐理由',result[0])

    def test_editorial_failure_keeps_candidates(self):
        board=[{'标题':['医院收费','学校食堂','员工合同','电影导演'][i],'排名':i+1} for i in range(4)]
        with patch.object(topics.ai,'chat',side_effect=topics.ai.AiError('timeout')):
            result=topics.editorial_pick(board,count=2,hint=lambda _:None)
        self.assertEqual(len(result),2)

    def test_excluded_titles_do_not_reappear_as_fallback(self):
        self.assertEqual(topics.pick([{'标题':'医院政策'}],exclude={'医院政策'}),[])

    def test_body_comparison_not_automatically_cover(self):
        doc=type('Doc',(),{'title':'东莞学校夜宵事件','blocks':[Block('p','对比海口学校收费')]})()
        hits=[Hit('今日头条','东莞学校','东莞学校夜宵','媒体','https://a','https://x'),Hit('今日头条','海口学校','海口学校收费','媒体','https://b','https://y')]
        with patch.object(sourcing,'_model_json',return_value={'keep':[0,1],'cover':[0]}):
            selected=sourcing.model_filter_hits(doc,hits,[])
        self.assertTrue(selected[0].cover_approved);self.assertFalse(selected[1].cover_approved)
