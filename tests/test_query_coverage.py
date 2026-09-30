import unittest
from types import SimpleNamespace
from unittest.mock import patch
from article_hub import sourcing
from article_hub.docxio import Block

class QueryCoverageTests(unittest.TestCase):
    def test_narrow_person_queries_gain_scenes(self):
        doc=SimpleNamespace(title='车间机器人与工人转岗',blocks=[Block('p','张俊在制造业生产线工作，自动化带来转岗和培训。')])
        response={'anchors':['张俊'],'queries':[{'text':'张俊 生产线','heading':''}]}
        with patch.object(sourcing,'_model_json',return_value=response):
            result=sourcing.model_analysis(doc,limit=12)
        self.assertTrue(any('生产线' in q.text and '张俊' not in q.text for q in result.queries))
        self.assertTrue(any('培训' in q.text for q in result.queries))
        self.assertLessEqual(len(result.queries),12)

    def test_unrelated_article_does_not_gain_factory_scenes(self):
        doc=SimpleNamespace(title='电影影评',blocks=[Block('p','演员和导演讨论电影。')])
        self.assertEqual(sourcing.scene_queries(doc),[])
