import json
import unittest
from unittest.mock import patch
from article_hub import ai, topics


class LiveRecommendationTests(unittest.TestCase):
    def rows(self, title='新热榜话题'):
        return [{'标题': title, '来源': '今日头条', '排名': 1, '热度': 12345,
                 '链接': 'https://example.test/news'}]

    def test_each_call_refetches_and_never_writes_prompts(self):
        answers = [json.dumps({'items': [{'id': 0, 'title': title, 'detail': '线索摘要', 'potential': '共鸣'}]}) for title in ('第一次', '第二次')]
        with patch.object(topics, 'fetch_combined_board', side_effect=[self.rows('第一次'), self.rows('第二次')]) as fetch, \
             patch.object(ai, 'chat', side_effect=answers), patch.object(topics, 'mark_batch') as write:
            first = topics.live_recommendations(sources_names=['今日头条'])
            second = topics.live_recommendations(sources_names=['今日头条'])
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(first['items'][0]['title'], '第一次')
        self.assertEqual(second['items'][0]['title'], '第二次')
        self.assertIn('12345', second['items'][0]['source'])
        self.assertEqual(second['items'][0]['evidence'][0]['链接'], 'https://example.test/news')
        write.assert_not_called()

    def test_fetch_failure_does_not_return_sample_content(self):
        with patch.object(topics, 'fetch_combined_board', side_effect=topics.TopicError('offline')):
            with self.assertRaises(topics.TopicError):
                topics.live_recommendations()

    def test_invalid_model_ids_fall_back_to_real_rows(self):
        with patch.object(topics, 'fetch_combined_board', return_value=self.rows()), \
             patch.object(ai, 'chat', return_value='{"items":[{"id":99}]}'):
            result = topics.live_recommendations()
        self.assertEqual(result['items'][0]['title'], '新热榜话题')
        self.assertIn('规则', result['method'])

    def test_category_miss_stays_empty(self):
        with patch.object(topics, 'fetch_combined_board', return_value=self.rows()), \
             patch.object(topics, 'filter_categories', return_value=[]), patch.object(ai, 'chat') as chat:
            self.assertEqual(topics.live_recommendations(categories=['影视'])['items'], [])
            chat.assert_not_called()

    def test_model_title_cannot_be_attached_to_another_board_item(self):
        answer = json.dumps({'items': [{'id': 0, 'title': '其他话题',
                                       'detail': '不相关说明', 'potential': '不相关理由'}]})
        with patch.object(topics, 'fetch_combined_board', return_value=self.rows()), \
             patch.object(ai, 'chat', return_value=answer):
            result = topics.live_recommendations()
        self.assertIn('规则', result['method'])
        self.assertNotIn('不相关', result['items'][0]['potential'])

    def test_profile_is_scoped_and_restored(self):
        with patch.object(ai, 'legacy_settings', return_value={'模型':'old'}):
            with ai.using_profile({'模型':'selected'}):
                self.assertEqual(ai.settings()['模型'], 'selected')
            self.assertEqual(ai.settings()['模型'], 'old')
