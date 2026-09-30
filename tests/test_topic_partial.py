import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch
from article_hub import topics, ai, console


def prompt_package(title='已定标题'):
    return json.dumps({
        'event': f'围绕“{title}”的事件线索，具体发生时间和事实仍需核实',
        'significance': '事件可能影响具体当事人的现实处境，存在值得澄清的信息疑问',
        'suggested_angle': '已核实事实对具体当事人的影响',
        'requirements': '先核查原始来源、事件时间和关键说法',
        'suggested_title': title,
        'image_plan': [
            {'position_id': 'image-1', 'order': 0,
             'query': title, 'keyword_type': 'core'},
        ],
    }, ensure_ascii=False)

class TopicPartialTests(unittest.TestCase):
    def test_timeout_preserves_all_candidates_and_reports_partial_failure(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as packages:
            root=Path(tmp); cards=[]
            for i in range(3):
                card=root/f'2026-09-17_{i+1:02d}_题{i}_选题卡.md'
                card.write_text(f'# 候选 {i+1}：题{i}\n\n证据{i}',encoding='utf-8');cards.append(card)
                card.with_name(card.name.replace('_选题卡.md', '_提示词.md')).write_text(
                    '旧的整批中间提示词', encoding='utf-8')
            success = prompt_package()
            patches=[patch.object(topics,'DAILY_DIR',root),patch.object(topics,'RECENT_FILE',root/'recent.json'),patch.object(topics,'MANIFEST_FILE',root/'manifest.json'),patch.object(topics,'EXPIRED_DIR',root/'old'),patch.object(topics.config,'UNFORMATTED',Path(packages))]
            from contextlib import ExitStack
            with ExitStack() as stack:
                for p in patches:stack.enter_context(p)
                stack.enter_context(patch.object(ai,'ready',return_value=(True,'test')))
                stack.enter_context(patch.object(topics,'_rule_digest',return_value='rules'))
                stack.enter_context(patch.object(ai,'chat',side_effect=[success,ai.AiError('read timed out'),ai.AiError('read timed out')]))
                lines=[]; code=topics.generate_prompts(cards=cards,hint=lines.append)
                names=json.loads(topics.RECENT_FILE.read_text(encoding='utf-8'))['文件']
                self.assertEqual(code,1);self.assertEqual(len(names),3)
                self.assertIn('基础版', (root/names[1]).read_text(encoding='utf-8'))
                self.assertTrue(cards[1].exists())
                self.assertIn('完成 1 条',console._summary_for('选题',lines,code))
                self.assertFalse(list(root.glob('*_提示词.md')))

    def test_unconfigured_model_also_keeps_cards(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);card=root/'x_选题卡.md';card.write_text('# 候选 1：标题\n\n材料',encoding='utf-8')
            with patch.object(ai,'ready',return_value=(False,'未配置')),patch.object(topics,'mark_batch'):
                self.assertEqual(topics.generate_prompts(cards=[card],hint=lambda _:None),1)
            self.assertIn('未配置',(root/'x.md').read_text(encoding='utf-8'))

    def test_latest_topics_fallback_excludes_intermediates_and_reads_final_title(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'a_选题卡.md').write_text('# 候选 1：原题\n', encoding='utf-8')
            (root / 'a_提示词.md').write_text('# 旧整批提示词\n', encoding='utf-8')
            (root / 'a.md').write_text('# 标题：提前定好的标题\n\n正文', encoding='utf-8')
            (root / '.最近一批.json').write_text(json.dumps({
                '时间': '2026-09-19 12:00',
                '文件': ['a_选题卡.md', 'a_提示词.md', 'a.md'],
            }, ensure_ascii=False), encoding='utf-8')
            with patch.object(console, 'DAILY_DIR', root):
                rows = console.latest_topics()
            self.assertEqual([row['标题'] for row in rows], ['提前定好的标题'])
            self.assertEqual(rows[0]['提示词状态'], '标题已定 · 旧版写文提示词')

    def test_latest_topics_exposes_invalid_generated_plan_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'bad.md').write_text(
                '# 选题：坏清单\n\n> 提示词状态：基础版（标题待确认）\n'
                '> 原因：配图「body-1」缺少搜图词\n', encoding='utf-8')
            with patch.object(console, 'DAILY_DIR', root):
                row = console.latest_topics()[0]
        self.assertEqual(row['内容包状态'], 'failed')
        self.assertEqual(row['提示词状态'], '生成失败 · 配图清单不可用')
        self.assertIn('缺少搜图词', row['内容包错误'])
