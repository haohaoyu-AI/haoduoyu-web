import unittest
import json
import tempfile
from unittest.mock import patch
from datetime import datetime
from pathlib import Path
from article_hub import topics

def row(source, title, heat=100, rank=1):
    return {"来源": source, "标题": title, "热度": heat, "排名": rank, "链接": "https://example.org/"+source}


def prompt_package(title='细节里的真实反差', prompt='测试提示词', queries=None):
    image_plan = [{'position_id': f'image-{index}', 'order': index - 1, 'query': query,
                   'keyword_type': 'core'}
                  for index, query in enumerate(queries or ['事件人物'], start=1)]
    return json.dumps({
        'event': f'{prompt}，围绕“{title}”的事件线索需要进一步核实',
        'significance': '事件包含现实影响和信息疑问，值得在事实清楚后继续判断',
        'suggested_angle': '已核实事实对具体当事人的影响',
        'requirements': '先核查事件时间、原始来源和关键说法',
        'suggested_title': title,
        'image_plan': image_plan,
    }, ensure_ascii=False)


def legacy_scored_package(title='细节里的真实反差'):
    candidates = []
    for index in range(5):
        candidate = title if index == 0 else f'候选标题{index}'
        score = 10 if index == 0 else 6
        candidates.append({'title': candidate,
                           'scores': {field: score for field in topics.TITLE_SCORE_FIELDS},
                           'reason': '测试理由'})
    outline = [
        {'section_id': 's1', 'heading': '事件现场', 'points': ['核实事件发生的时间地点']},
        {'section_id': 's2', 'heading': '人物选择', 'points': ['梳理当事人的行动与代价']},
        {'section_id': 's3', 'heading': '事实判断', 'points': ['区分已证实信息与待核实说法']},
    ]
    image_plan = [
        {'position_id': 'cover', 'purpose': 'cover', 'section_id': '', 'order': 0,
         'query': '事件人物 真实现场', 'scene': '当事人身处事件现场的真实画面',
         'exclude': ['无关人物', '广告水印']},
        {'position_id': 'body-1', 'purpose': 'body', 'section_id': 's1', 'order': 1,
         'query': '事件地点 环境细节', 'scene': '能够辨认事件地点与环境的现场画面',
         'exclude': ['其他地点', '抽象插画']},
        {'position_id': 'body-2', 'purpose': 'body', 'section_id': 's2', 'order': 2,
         'query': '当事人物 行动过程', 'scene': '与人物关键行动直接相关的纪实画面',
         'exclude': ['无关明星', '摆拍画面']},
        {'position_id': 'body-3', 'purpose': 'body', 'section_id': 's3', 'order': 3,
         'query': '公开材料 核实过程', 'scene': '可见公开材料或事实核实过程的画面',
         'exclude': ['伪造截图', '密集广告']},
    ]
    return json.dumps({'selected_title': title, 'title_candidates': candidates,
                       'angle': '从普通人的具体选择与现实代价切入事件',
                       'outline': outline,
                       'prompt': '旧格式写作提示词，仅用于兼容性测试；请核查事实来源并标出未确认的信息。',
                       'image_plan': image_plan}, ensure_ascii=False)

class TopicBoardsTests(unittest.TestCase):
    def test_prompts_run_concurrently_and_preserve_all_results(self):
        import tempfile
        import threading
        from pathlib import Path
        barrier = threading.Barrier(3)
        def reply(*args, **kwargs):
            barrier.wait(timeout=5)
            return prompt_package()
        with tempfile.TemporaryDirectory() as temp, tempfile.TemporaryDirectory() as packages:
            root = Path(temp)
            cards = [root / f'2026-09-17_0{i}_主题{i}_选题卡.md' for i in range(3)]
            for i, card in enumerate(cards):
                card.write_text(f'# 候选 {i}：主题{i}\n正文', encoding='utf-8')
            with patch.object(topics, 'DAILY_DIR', root), \
                 patch.object(topics.config, 'UNFORMATTED', Path(packages)), \
                 patch.object(topics, 'mark_batch'), \
                 patch.object(topics, '_rule_digest', return_value='规则'), \
                 patch.object(topics.ai, 'ready', return_value=(True,'测试接口')), \
                 patch.object(topics.ai, 'chat', side_effect=reply):
                result = topics.generate_prompts(cards=cards, hint=lambda _: None)
            self.assertEqual(result, 0)
            for card in cards:
                merged = card.with_name(card.name.replace('_选题卡', '')).read_text(encoding='utf-8')
                self.assertIn('# 建议标题：细节里的真实反差', merged)
                self.assertNotIn('成稿标题必须逐字使用', merged)
                self.assertIn('测试提示词', merged)

    def test_legacy_structured_title_must_be_highest_scored_candidate(self):
        payload = json.loads(legacy_scored_package())
        payload['title_candidates'][0]['scores'] = {
            field: 5 for field in topics.TITLE_SCORE_FIELDS}
        payload['title_candidates'][1]['scores'] = {
            field: 10 for field in topics.TITLE_SCORE_FIELDS}
        corrected = topics.parse_prompt_package(json.dumps(payload, ensure_ascii=False))
        self.assertEqual(corrected['selected_title'], '候选标题1')
        self.assertTrue(corrected['title_corrected'])

    def test_new_generation_rejects_a_legacy_scored_package(self):
        with self.assertRaisesRegex(ValueError, '旧版写作任务'):
            topics._parse_current_brief_package(
                legacy_scored_package(), keyword_source='事件人物')

    def test_legacy_markdown_requires_one_explicit_final_title(self):
        package = topics.parse_prompt_package(
            '## 推荐标题\n\n**《小人物的三次选择》**\n\n请核实事实后直接成稿。')
        self.assertEqual(package['selected_title'], '小人物的三次选择')
        prompt = topics.finalized_brain_prompt(package)
        self.assertIn('《小人物的三次选择》', prompt)
        self.assertNotIn('不得另选、改写或生成标题', prompt)

        with self.assertRaisesRegex(ValueError, '唯一最终标题'):
            topics.parse_prompt_package('这里只是一份旧提示词，没有明确选定标题。')
        with self.assertRaisesRegex(ValueError, '唯一最终标题'):
            topics.parse_prompt_package(
                '推荐标题：第一条\n最终标题：第二条\n请直接成稿。')

    def test_rewrite_recommendation_returns_and_persists_suggested_title(self):
        with tempfile.TemporaryDirectory() as temp, tempfile.TemporaryDirectory() as packages:
            root = Path(temp)
            with patch.object(topics, 'DAILY_DIR', root), \
                 patch.object(topics.config, 'UNFORMATTED', Path(packages)), \
                 patch.object(topics, '_rule_digest', return_value='规则'), \
                 patch.object(topics, 'mark_batch'), \
                 patch.object(topics.ai, 'chat', return_value=prompt_package(
                     '真正的最终标题', queries=['热榜原题'])) as chat:
                result = topics.rewrite_recommendation(
                    title='热榜原题', detail='线索', potential='内部爆款判断')
            request = chat.call_args.args[0][1]['content']
            self.assertIn('- 热点概述：线索', request)
            self.assertNotIn('- 爆款潜力：', request)
            content = Path(result['文件']).read_text(encoding='utf-8')
            self.assertEqual(result['标题'], '真正的最终标题')
            self.assertEqual(result['最终标题'], '真正的最终标题')
            self.assertEqual(result['建议标题'], '真正的最终标题')
            self.assertEqual(result['提示词状态'], '写文提示词与配图清单已完成')
            self.assertIn('# 建议标题：真正的最终标题', content)
            self.assertIn('> 原始选题：热榜原题', content)
            self.assertNotIn('成稿标题必须逐字使用', content)
            self.assertEqual(len(result['文章提示词'].splitlines()), 4)
            self.assertFalse(list(root.glob('*_选题卡.md')))
            self.assertFalse(list(root.glob('*_提示词.md')))

    def test_rewrite_recommendation_without_explicit_title_stays_incomplete(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with patch.object(topics, 'DAILY_DIR', root), \
                 patch.object(topics, '_rule_digest', return_value='规则'), \
                 patch.object(topics, 'mark_batch'), \
                 patch.object(topics.ai, 'chat', return_value='普通旧提示词，没有最终标题'):
                result = topics.rewrite_recommendation(title='热榜原题')
            content = Path(result['文件']).read_text(encoding='utf-8')
            self.assertEqual(result['最终标题'], '')
            self.assertEqual(result['提示词状态'], '生成失败 · 配图清单不可用')
            self.assertIn('提示词状态：基础版（模型待补全）', content)
            self.assertTrue(list(root.glob('*_选题卡.md')), '失败时保留选题证据以便重试')

    def test_recommendation_commit_failure_removes_staged_and_final_files(self):
        with tempfile.TemporaryDirectory() as temp, tempfile.TemporaryDirectory() as packages:
            root = Path(temp)
            with patch.object(topics, 'DAILY_DIR', root), \
                 patch.object(topics.config, 'UNFORMATTED', Path(packages)), \
                 patch.object(topics, '_rule_digest', return_value='规则'), \
                 patch.object(topics.ai, 'chat', return_value=prompt_package('原子提交标题')):
                prepared = topics.prepare_recommendation(title='热榜原题')
                with patch.object(topics, 'mark_batch', side_effect=OSError('fixture commit failure')):
                    with self.assertRaisesRegex(OSError, 'fixture commit failure'):
                        topics.commit_recommendation(prepared)
            self.assertEqual(list(root.iterdir()), [], '失败提交不能留下最终文件或 .tmp')

    def test_only_top_five_reach_classification(self):
        board = [row('微博', f'新闻{i}', rank=i) for i in range(1, 51)]
        with patch.object(topics, 'fetch_weibo_board', return_value=board) as fetch:
            selected = topics.fetch_combined_board(sources_names=['微博'], hint=lambda _: None)
        fetch.assert_called_once_with(limit=5)
        self.assertTrue(all(r['排名'] <= 5 for r in selected))
        self.assertLessEqual(len(selected), 5)

    def test_merge_preserves_evidence_and_rewards_cross_platform(self):
        a = row("今日头条", "医院推出医疗费用新政策", 10000000)
        b = row("微博", "#医院推出医疗费用新政策#", 100)
        merged = topics.merge_boards([[a], [b]])
        self.assertEqual(len(merged), 1)
        self.assertEqual(len(merged[0]['热榜依据']), 2)
        single = topics.merge_boards([[a]])[0]
        self.assertGreater(topics.score(merged[0]), topics.score(single))
        card = topics.card_for(merged[0], 1, when=datetime.now())
        self.assertIn('今日头条第 1 位', card)
        self.assertIn('微博第 1 位', card)

    def test_heat_is_normalized_per_platform(self):
        rows = topics.merge_boards([[row('今日头条','职场政策甲',10000000)], [row('微博','医院改革乙',100)]])
        self.assertEqual(rows[0]['相对热度'], rows[1]['相对热度'])

    def test_one_platform_failure_is_visible_and_other_survives(self):
        hints=[]
        with patch.object(topics,'fetch_hot_board',side_effect=OSError('offline')), patch.object(topics,'fetch_weibo_board',return_value=[row('微博','医疗改革')]):
            rows=topics.fetch_combined_board(hint=hints.append)
        self.assertEqual(rows[0]['来源'],'微博')
        self.assertTrue(any('暂不可用' in text for text in hints))

    def test_both_fail_raises(self):
        with patch.object(topics,'fetch_hot_board',side_effect=OSError()), patch.object(topics,'fetch_weibo_board',side_effect=OSError()):
            with self.assertRaises(topics.TopicError): topics.fetch_combined_board(hint=lambda text:None)

    def test_only_selected_platform_is_fetched(self):
        with patch.object(topics, 'fetch_hot_board') as toutiao, patch.object(topics, 'fetch_weibo_board', return_value=[row('微博','医疗改革')]) as weibo:
            result = topics.fetch_combined_board(sources_names=['微博'], hint=lambda text:None)
        toutiao.assert_not_called()
        weibo.assert_called_once()
        self.assertEqual(result[0]['来源'], '微博')

    def test_empty_selection_rejected(self):
        with self.assertRaises(topics.TopicError):
            topics.fetch_combined_board(sources_names=[])
