"""人工选题：手动输入多条选题，检索同题样本后批量生成提示词。"""
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from article_hub import topics


def prompt_package(selected: str = "第一条建议标题", prompt: str = "写稿素材正文"):
    """A complete, valid model answer for one manual topic."""
    image_plan = [
        {"position_id": "image-1", "order": 0,
         "query": "第一条选题", "keyword_type": "core"},
    ]
    return json.dumps({"event": prompt + "，需要根据原始来源进一步核实具体事实",
                       "significance": "事件关系到具体当事人的现实处境和信息判断",
                       "suggested_angle": "已核实事实对具体当事人的影响",
                       "requirements": "先核查原始报道、事件时间和关键说法",
                       "suggested_title": selected,
                       "image_plan": image_plan}, ensure_ascii=False)


class ManualTopicTitleTests(unittest.TestCase):
    def test_titles_accept_newlines_numbering_and_dedupe(self):
        titles = topics.normalize_manual_titles([
            "1. 班主任体罚学生被调岗\n2、外卖骑手深夜送单后猝死",
            "班主任体罚学生被调岗；  第三条选题  ",
        ])
        self.assertEqual(titles, ["班主任体罚学生被调岗", "外卖骑手深夜送单后猝死", "第三条选题"])

    def test_titles_reject_empty_too_many_and_too_long(self):
        with self.assertRaisesRegex(ValueError, '至少输入一条'):
            topics.normalize_manual_titles(["", "   "])
        with self.assertRaisesRegex(ValueError, '最多 2 条'):
            topics.normalize_manual_titles(["甲", "乙", "丙"], limit=2)
        with self.assertRaisesRegex(ValueError, f'不超过 {topics.MANUAL_TITLE_LIMIT} 字'):
            topics.normalize_manual_titles(["长" * (topics.MANUAL_TITLE_LIMIT + 1)])


class ManualTopicEvidenceTests(unittest.TestCase):
    def board(self):
        return [{"标题": "班主任体罚学生被调岗", "来源": "今日头条", "排名": 3,
                 "热度": 9000, "链接": "https://example.test/hot"}]

    def test_board_evidence_matches_only_real_hot_items(self):
        self.assertEqual(len(topics.manual_board_evidence("班主任体罚学生被调岗，家长要说法",
                                                          self.board())), 1)
        self.assertEqual(topics.manual_board_evidence("完全不同的选题", self.board()), [])

    def test_card_marks_manual_source_when_not_on_the_board(self):
        card = topics.manual_card_text("完全不同的选题", when=datetime(2026, 9, 20, 9, 30),
                                       samples=[], evidence=[], sources_names=["今日头条"])
        self.assertIn("作者手动输入", card)
        self.assertIn("未出现这条选题", card)
        self.assertIn("同题样本", card)


class ManualTopicPrepareTests(unittest.TestCase):
    def prepare(self, titles, *, answers=None, ready=(True, '模型就绪'), samples=None, board=None):
        with tempfile.TemporaryDirectory() as temp, \
             tempfile.TemporaryDirectory() as packages, \
             patch.object(topics, 'DAILY_DIR', Path(temp)), \
             patch.object(topics.config, 'UNFORMATTED', Path(packages)), \
             patch.object(topics, 'fetch_combined_board', return_value=board or []), \
             patch.object(topics, 'article_samples', return_value=samples or []) as search, \
             patch.object(topics.ai, 'ready', return_value=ready), \
             patch.object(topics.ai, 'chat', side_effect=answers) as chat:
            prepared = topics.prepare_manual_topics(titles, model='fixture', hint=lambda _m: None)
            left_over = sorted(path.name for path in Path(temp).iterdir())
        return prepared, search, chat, left_over

    def test_one_prompt_per_title_and_nothing_is_written_before_commit(self):
        prepared, search, chat, left_over = self.prepare(
            ["第一条选题", "第二条选题"],
            answers=[prompt_package("第一条最终标题"), prompt_package("第二条最终标题")])
        self.assertEqual(search.call_count, 2)
        self.assertEqual(chat.call_count, 2)
        self.assertEqual([item['generated'] for item in prepared['items']], [True, True])
        self.assertEqual(left_over, [], 'Preparation must not touch the workspace')
        first = prepared['items'][0]
        self.assertNotIn('## 已定标题（硬约束）', first['merged_text'])
        self.assertIn('什么事：', first['merged_text'])
        self.assertIn('第一条最终标题', first['merged_text'])
        self.assertEqual(len(first['result']['文章提示词'].splitlines()), 4)
        self.assertEqual(first['result']['提示词状态'], '写文提示词与配图清单已完成')
        self.assertEqual(first['merged'].suffix, '.md')
        self.assertIn('人工', first['merged'].name)

    def test_model_failure_keeps_a_basic_prompt_for_every_topic(self):
        prepared, _search, _chat, _left = self.prepare(
            ["第一条选题", "第二条选题"], ready=(False, '模型接口还没准备好'))
        self.assertEqual([item['generated'] for item in prepared['items']], [False, False])
        for item in prepared['items']:
            self.assertEqual(item['result']['提示词状态'], '生成失败 · 配图清单不可用')
            self.assertIn('基础版（模型待补全）', item['merged_text'])
            self.assertIn('什么事：', item['merged_text'])
            self.assertEqual(len(item['result']['文章提示词'].splitlines()), 4)
            self.assertIn(item['title'], item['merged_text'])

    def test_search_results_are_written_into_the_prompt_file(self):
        samples = [{"标题": "贵州一中学老师给女学生发骚扰信息，校方回应：涉事老师已被调岗",
                    "账号": "澎湃新闻", "时间": "2026-09-19 21:00", "阅读": None, "评论": None,
                    "链接": "https://example.test/news", "对标样本": False,
                    "检索时间": "2026-09-20 00:30"}]
        prepared, _search, _chat, _left = self.prepare(
            ["第一条选题"], samples=samples, answers=[prompt_package("第一条最终标题")])
        request = _chat.call_args.args[0][1]['content']
        self.assertIn("澎湃新闻", request)
        self.assertIn("贵州一中学老师给女学生发骚扰信息", request)
        self.assertIn("未读取全文或评论正文", request)
        self.assertNotIn("要回答的三问", request)
        self.assertNotIn("对标账号：", request)

    def test_two_topics_never_share_one_output_file(self):
        long_a = "同一个开头" + "甲" * 40
        long_b = "同一个开头" + "乙" * 40
        prepared, _search, _chat, _left = self.prepare(
            [long_a, long_b], answers=[prompt_package("甲标题"), prompt_package("乙标题")])
        names = [item['merged'].name for item in prepared['items']]
        self.assertEqual(len(set(names)), 2, f'truncated names must stay unique: {names}')


class ManualTopicCommitTests(unittest.TestCase):
    def test_commit_writes_every_prompt_and_marks_the_batch(self):
        with tempfile.TemporaryDirectory() as temp, \
             tempfile.TemporaryDirectory() as packages, \
             patch.object(topics, 'DAILY_DIR', Path(temp)), \
             patch.object(topics.config, 'UNFORMATTED', Path(packages)), \
             patch.object(topics, 'fetch_combined_board', return_value=[]), \
             patch.object(topics, 'article_samples', return_value=[]), \
             patch.object(topics.ai, 'ready', return_value=(True, '模型就绪')), \
             patch.object(topics.ai, 'chat', side_effect=[prompt_package("甲标题"),
                                                          prompt_package("乙标题")]), \
             patch.object(topics, 'mark_batch') as mark:
            prepared = topics.prepare_manual_topics(['甲选题', '乙选题'], hint=lambda _m: None)
            result = topics.commit_manual_topics(prepared)
            written = sorted(path.name for path in Path(temp).iterdir())
        self.assertEqual(len(result['items']), 2)
        self.assertEqual(result['完成'], 2)
        self.assertEqual(result['基础版'], 0)
        self.assertEqual(len(written), 2)
        self.assertTrue(all(name.startswith('2') for name in written), written)
        self.assertTrue(all(item['文件'] for item in result['items']))
        mark.assert_called_once()
        self.assertEqual(len(mark.call_args.args[0]), 2)

    def test_commit_without_items_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '没有可写入的选题'):
            topics.commit_manual_topics({'items': []})


if __name__ == '__main__':
    unittest.main()
