import json
import unittest

from article_hub import topic_packages, topics


def brief_answer(**overrides):
    payload = {
        "event": "9月27日，某地公布公共服务办理规则调整方案",
        "significance": "调整会直接影响居民的办理成本，部分适用范围仍不清楚",
        "suggested_angle": "普通居民的实际办理体验与规则变化",
        "requirements": "先核查方案原文、生效时间和适用范围",
        "suggested_title": "一项公共服务调整，会怎样影响普通居民",
        "image_plan": [
            {"position_id": "image-1", "order": 0,
             "query": "公共服务办理规则", "keyword_type": "core"},
        ],
    }
    payload.update(overrides)
    return json.dumps(payload, ensure_ascii=False)


class TopicBriefTests(unittest.TestCase):
    def test_new_contract_renders_exactly_four_lines_and_keeps_images_separate(self):
        package = topics.parse_prompt_package(
            brief_answer(), require_image_plan=True,
            keyword_source="某地公布公共服务办理规则调整方案")
        lines = topics.finalized_brain_prompt(package).splitlines()
        self.assertEqual(len(lines), 4)
        self.assertEqual([line.split("：", 1)[0] for line in lines],
                         ["什么事", "值得写", "特殊要求", "建议标题"])
        self.assertIn("仅供参考，可调整", lines[-1])
        self.assertEqual(package["outline"], [])
        self.assertEqual([item["query"] for item in package["image_plan"]],
                         ["公共服务办理规则"])
        self.assertNotIn("图片提示词", "\n".join(lines))
        content_package = topic_packages.build(
            topic_id="TP-20260927-aabbccdd",
            title=package["selected_title"],
            original_topic="某地公布公共服务办理规则调整方案",
            generated=package,
            keyword_source="某地公布公共服务办理规则调整方案",
        )
        self.assertEqual(content_package["outline"], [])
        self.assertEqual(topic_packages.validate(content_package)["image_plan"][0]["query"],
                         "公共服务办理规则")

    def test_no_special_requirement_uses_the_stable_default(self):
        package = topics.parse_prompt_package(
            brief_answer(requirements="无"), require_image_plan=True,
            keyword_source="某地公布公共服务办理规则调整方案")
        self.assertEqual(package["prompt"].splitlines()[2],
                         "特殊要求：无，由写作团判断")

    def test_multiline_brief_field_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "单行文本"):
            topics.parse_prompt_package(brief_answer(event="第一行\n第二行"))

    def test_prescriptive_writing_or_detection_rules_are_rejected(self):
        for requirement in (
            "必须按固定结构写作并加入三个小标题",
            "文章要用五段式来写",
            "先列5个标题，再逐个打分",
            "写作时要规避 AI 检测",
            "尽量去掉AI味，更像真人写作",
            "把AI率降低到20%以下",
        ):
            with self.subTest(requirement=requirement), self.assertRaisesRegex(
                    ValueError, "固定写法或检测规避"):
                topics.parse_prompt_package(brief_answer(requirements=requirement))
        with self.assertRaisesRegex(ValueError, "固定写法或检测规避"):
            topics.parse_prompt_package(
                brief_answer(event="文章要用五段式来写"))
        with self.assertRaisesRegex(ValueError, "固定写法或检测规避"):
            topics.parse_prompt_package(
                brief_answer(suggested_title="请规避AI检测"))

    def test_factual_mentions_of_openings_or_endings_are_not_writing_rules(self):
        for event in (
            "导演表示电影按照原著结尾拍摄，影片于9月27日上映",
            "平台新规要求文章开头标注广告来源，相关规则于9月27日生效",
        ):
            with self.subTest(event=event):
                package = topics.parse_prompt_package(brief_answer(event=event))
                self.assertIn(event, package["prompt"])

    def test_copy_extractor_returns_only_the_four_line_brief(self):
        brief = topics.parse_prompt_package(brief_answer())["prompt"]
        document = ("# 建议标题：本地标题\n\n> 选题编号：TP-20260927-aabbccdd\n"
                    "> 配图状态：关键词已校验\n\n文章提示词：\n\n" + brief
                    + "\n\n图片提示词：\n\n- 公共服务办理规则\n")
        copied = topics.brain_brief_from_document(document)
        self.assertEqual(copied, brief)
        self.assertNotIn("图片提示词", copied)
        self.assertNotIn("选题编号", copied)

    def test_copy_extractor_converts_a_legacy_document_to_four_lines(self):
        document = (
            "# 标题：旧版硬标题\n\n"
            "> 原始选题：中秋档票房破2亿，《复联4》重映暂列档期冠军\n\n"
            "文章提示词：\n\n"
            "## 已定标题（硬约束）\n\n旧版硬标题\n\n"
            "## 写作任务\n\n必须按固定结构写作。\n\n"
            "图片提示词：\n\n- 中秋档\n- 复联4\n"
        )
        copied = topics.brain_brief_from_document(document)
        self.assertEqual(len(copied.splitlines()), 4)
        self.assertIn("什么事：中秋档票房破2亿", copied)
        self.assertIn("建议标题：中秋档票房破2亿", copied)
        self.assertNotIn("旧版硬标题", copied)
        self.assertNotIn("固定结构", copied)
        self.assertNotIn("图片提示词", copied)

    def test_copy_extractor_rejects_an_unidentifiable_legacy_prompt(self):
        document = ("文章提示词：\n\n必须给五个标题并评分，再按固定结构写作。\n\n"
                    "图片提示词：\n\n- 不应复制的图片词\n")
        with self.assertRaisesRegex(ValueError, "缺少可安全转换"):
            topics.brain_brief_from_document(document)

    def test_model_material_excludes_local_selection_frameworks(self):
        card = (
            "# 候选 1：公共服务规则调整\n\n"
            "- 热榜依据：某平台第 1 位\n"
            "- 适合度打分：9\n"
            "- 推荐理由：有爆款潜力\n第二行仍是内部写作方法\n"
            "- 建议切口（编辑分析，待证据验证）：普通人处境\n"
            "## 要回答的三问\n1. 谁想看？\n"
            "## Creator Buddy 研究材料\n- 待核实：规则生效时间\n"
            "## 同题样本\n对标参考：某账号\n1. 某媒体：规则调整原文\n"
        )
        material = topics._brief_source_material(card)
        self.assertIn("热榜依据", material)
        self.assertIn("同题样本", material)
        self.assertIn("已有来源材料", material)
        self.assertIn("待核实：规则生效时间", material)
        self.assertNotIn("适合度打分", material)
        self.assertNotIn("推荐理由", material)
        self.assertNotIn("第二行仍是内部写作方法", material)
        self.assertNotIn("建议切口", material)
        self.assertNotIn("要回答的三问", material)
        self.assertNotIn("Creator Buddy", material)
        self.assertNotIn("对标参考", material)


if __name__ == "__main__":
    unittest.main()
