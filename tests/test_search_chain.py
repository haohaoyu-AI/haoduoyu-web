import unittest
from unittest.mock import patch
from article_hub import sourcing as s, image_actions as a

class SearchChainTests(unittest.TestCase):
    def test_abbreviated_school_and_law_queries_are_retained(self):
        from types import SimpleNamespace
        from article_hub.docxio import Block
        document = SimpleNamespace(title='学校处理调查', blocks=[
            Block('p', '贵州毕节大方县第二中学，依据教师法处理。')])
        payload = {'anchors':['贵州毕节大方县第二中学'], 'queries':[
            {'text':'大方县第二中学 校门'}, {'text':'教师法 文件'},
            {'text':'无关明星 演唱会'}]}
        with patch.object(s,'_model_json',return_value=payload):
            analysis=s.model_analysis(document)
        self.assertEqual([q.text for q in analysis.queries],
                         ['大方县第二中学 校门','教师法 文件'])

    def test_web_source_includes_domestic_news_without_duplicates(self):
        for names in (['全网'], ['全网','今日头条']):
            sources, warnings=s.build_sources(names)
            self.assertEqual([source.name for source in sources],['全网图片','今日头条'])

    def test_deepseek_then_gpt_only_for_remaining_count(self):
        profiles=[('deepseek',{'模型':'deepseek-test'}),('gpt',{'模型':'gpt-test'})]
        data={'provider':'gpt','model':'gpt-test','count':3}
        with patch.object(s,'search_profiles',return_value=profiles), patch.object(a,'_network_round',side_effect=[[{'id':1}],[{'id':2},{'id':3}]]) as run:
            result=a._network(data,None,None,None,{},lambda _:None)
        self.assertEqual(len(result),3)
        self.assertEqual([(c.args[0]['provider'],c.args[0]['count']) for c in run.call_args_list],[('deepseek',3),('gpt',2)])

    def test_full_network_result_stops_before_gpt(self):
        with patch.object(s,'search_profiles',return_value=[('deepseek',{'模型':'ds'}),('gpt',{'模型':'gpt'})]), patch.object(a,'_network_round',return_value=[{}]) as run:
            a._network({'provider':'gpt','model':'gpt','count':1},None,None,None,{},lambda _:None)
        self.assertEqual(run.call_count,1)

    def test_failed_deepseek_still_runs_gpt(self):
        with patch.object(s,'search_profiles',return_value=[('deepseek',{'模型':'ds'}),('gpt',{'模型':'gpt'})]), patch.object(a,'_network_round',side_effect=[ValueError('bad JSON'),[{}]]) as run:
            result=a._network({'provider':'gpt','model':'gpt','count':1},None,None,None,{},lambda _:None)
        self.assertEqual(result,[{}])
        self.assertEqual(run.call_count,2)

    def test_batch_entry_runs_both_search_rounds_before_ai(self):
        import tempfile, os
        from pathlib import Path
        from types import SimpleNamespace
        from article_hub.docxio import Block
        document = SimpleNamespace(title='学校调查', blocks=[Block('p','学校调查。'*100)])
        analysis=s.Analysis([s.Query('学校 校门')],['学校'],[])
        events=[]
        def analyse(*args, **kwargs):
            events.append(s.ai.settings()['模型'])
            return analysis
        def supplement(*args, **kwargs):
            events.append('AI')
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'draft.docx').touch()
            with patch.dict(os.environ,{'ARTICLE_HUB_IMAGE_AI':'1'}), \
                 patch.object(s,'read_document',return_value=document), \
                 patch.object(s,'search_profiles',return_value=[('deepseek',{'模型':'ds'}),('gpt',{'模型':'gpt'})]), \
                 patch.object(s,'analyze',return_value=analysis), \
                 patch.object(s,'model_analysis',side_effect=analyse), \
                 patch.object(s,'collect_hits',return_value=([],[])), \
                 patch.object(s,'model_filter_hits',return_value=[]), \
                 patch.object(s,'choose_images',return_value=([],[])), \
                 patch.object(s,'supplement_with_ai',side_effect=supplement):
                with self.assertRaises(s.SourcingError):
                    s.source_topic(root,sources=[],hint=lambda _:None)
        self.assertEqual(events,['ds','gpt','AI'])

    def test_generation_500_retries_and_decodes_real_image(self):
        import io, base64, json, tempfile, urllib.error
        from pathlib import Path
        from PIL import Image
        raw=io.BytesIO(); Image.new('RGB',(800,600),'red').save(raw,format='PNG')
        response=unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value=json.dumps({'data':[{'b64_json':base64.b64encode(raw.getvalue()).decode()}]}).encode()
        with tempfile.TemporaryDirectory() as tmp, patch.object(s.urllib.request,'urlopen',side_effect=[urllib.error.HTTPError('https://example',500,'server',{},None),response]) as call, patch.object(s.time,'sleep'):
            result=s.generate_ai_image('illustration',Path(tmp),stem='image',profile=('gpt-image-test',{'base_url':'https://example','api_key':'fixture'}),hint=lambda _:None)
            self.assertEqual(result[1:3],(800,600))
            self.assertTrue(result[0].exists())
        self.assertEqual(call.call_count,2)
