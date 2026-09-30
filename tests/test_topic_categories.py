import json
import unittest
from unittest.mock import patch
from article_hub import topics, console
from article_hub.__main__ import parser


class CategoryTests(unittest.TestCase):
    def test_batch_progress_and_bounded_non_thinking_classification(self):
        board = [{'标题': '电影新闻'}] * 41
        hints = []
        answers = [json.dumps({str(i): ['影视'] for i in range(n)}) for n in (40, 1)]
        with patch.object(topics.ai, 'chat', side_effect=answers) as chat:
            result = topics.filter_categories(board, ['影视'], hint=hints.append)
        self.assertEqual(len(result), 41)
        self.assertTrue(any('已分类 40/41' in line for line in hints))
        self.assertTrue(any('已分类 41/41' in line for line in hints))
        for call in chat.call_args_list:
            self.assertEqual(call.kwargs['timeout'], 90)
            self.assertFalse(call.kwargs['thinking'])

    def test_semantic_selection_union_and_annotations(self):
        board = [{'标题': t} for t in ['歌手开演唱会', '电影票房破纪录', '足球决赛', '医院收费调查']]
        answer = {'0': ['文娱'], '1': ['影视', '文娱'], '2': ['体育'], '3': ['社会热点']}
        with patch.object(topics.ai, 'chat', return_value=json.dumps(answer)):
            rows = topics.filter_categories(board, ['影视', '体育'], model='test')
        self.assertEqual([r['标题'] for r in rows], ['电影票房破纪录', '足球决赛'])
        self.assertEqual(rows[0]['话题分类'], ['影视'])

    def test_unrestricted_skips_model(self):
        board = [{'标题': '任意新闻'}]
        with patch.object(topics.ai, 'chat') as chat:
            self.assertIs(topics.filter_categories(board, []), board)
        chat.assert_not_called()

    def test_invalid_model_output_fails_closed(self):
        for answer in ['not json', '{}', '{"0": ["错误类别"]}', '{"0": "影视"}']:
            with self.subTest(answer=answer), patch.object(topics.ai, 'chat', return_value=answer):
                with self.assertRaises(topics.ai.AiError):
                    topics.filter_categories([{'标题': '新闻'}], ['影视'])

    def test_no_match_preserves_previous_files_and_skips_generation(self):
        hints = []
        with patch.object(topics, 'fetch_combined_board', return_value=[{'标题': '足球决赛'}]), patch.object(topics.ai, 'chat', return_value='{"0":["体育"]}'), patch.object(topics, 'generate_prompts') as gen, patch.object(topics, '_remember') as remember:
            code = topics.find_topics(categories=['影视'], hint=hints.append)
        self.assertEqual(code, 1)
        gen.assert_not_called()
        remember.assert_not_called()
        self.assertTrue(any('没有匹配' in hint for hint in hints))

    def test_api_to_worker_and_cli(self):
        with patch.object(console, 'CURRENT', None), patch.object(console.threading, 'Thread') as thread, patch.object(console.model_settings, 'resolve', return_value={}):
            result = console.start('选题', provider='deepseek', model='test', categories='影视,体育')
        self.assertIn('job', result)
        argv = thread.call_args.kwargs['args'][1]['argv']
        self.assertEqual(parser().parse_args(argv[2:]).话题, '影视,体育')

    def test_invalid_selection_does_not_launch(self):
        with patch.object(console.threading, 'Thread') as thread:
            self.assertIn('error', console.start('选题', categories='不存在'))
        thread.assert_not_called()
