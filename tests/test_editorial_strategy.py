import unittest

from article_hub import topics


class EditorialStrategyTests(unittest.TestCase):
    def test_prompt_requests_a_compact_optional_handoff(self):
        prompt = topics.ASK_PROMPT.format(card='选题卡')
        self.assertIn('四行选题简报', prompt)
        self.assertIn('event：什么事', prompt)
        self.assertIn('significance：为什么值得写', prompt)
        self.assertIn('无，由写作团判断', prompt)
        self.assertIn('不是定稿，不要求写作团沿用', prompt)
        self.assertNotIn('给出 5 个方案', prompt)
        self.assertNotIn('准确兑现、情绪张力、悬念、账号辨识度', prompt)

    def test_prompt_keeps_image_plan_executable_but_independent(self):
        prompt = topics.ASK_PROMPT.format(card='选题卡')
        self.assertIn('独立配图关键词', prompt)
        self.assertIn('原始热门话题文本', prompt)
        self.assertIn('不得从 event、significance', prompt)
        self.assertIn('"query"', prompt)
        self.assertIn('"keyword_type"', prompt)
        self.assertNotIn('具体场景开头', prompt)
        self.assertNotIn('关键金句', prompt)


if __name__ == '__main__':
    unittest.main()
