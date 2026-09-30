import json
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from PIL import Image

from article_hub import (config, console, image_actions, image_review, model_settings,
                         sourcing, topic_packages, topics)
from article_hub.hits import Hit


def model_answer(title, queries):
    return {
        "event": f"围绕“{title}”的事件线索，现有信息需要根据原始来源进一步核实",
        "significance": "事件包含现实影响和待澄清的信息疑问，值得在事实清楚后判断",
        "suggested_angle": "已核实事实对具体当事人的影响",
        "requirements": "逐项核实来源，不确定信息明确标注",
        "suggested_title": title,
        "image_plan": [
            {**(dict(query) if isinstance(query, dict) else {"query": query}),
             "position_id": (query.get("position_id") if isinstance(query, dict) else None)
                            or f"image-{index}",
             "order": query.get("order", index - 1) if isinstance(query, dict) else index - 1}
            for index, query in enumerate(queries, start=1)
        ],
    }


def jpeg_bytes():
    stream = io.BytesIO()
    Image.new("RGB", (900, 600), "navy").save(stream, format="JPEG")
    return stream.getvalue()


class TopicKeywordRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.daily = root / "选题"
        self.packages = root / "未排版文章"
        self.formatted = root / "已排版文章"
        self.data = root / "data"
        for path in (self.daily, self.packages, self.formatted, self.data):
            path.mkdir()
        self.patches = [
            patch.object(topics, "DAILY_DIR", self.daily),
            patch.object(console, "DAILY_DIR", self.daily),
            patch.object(config, "UNFORMATTED", self.packages),
            patch.object(config, "FORMATTED", self.formatted),
            patch.object(config, "DATA", self.data),
            patch.object(topics, "_rule_digest", return_value="模拟规则"),
            patch.object(topics, "mark_batch"),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def prepare(self, source, queries):
        answer = json.dumps(model_answer("根据已知对象写作", queries), ensure_ascii=False)
        with patch.object(topics.ai, "chat", return_value=answer) as chat:
            prepared = topics.prepare_recommendation(title=source)
        chat.assert_called_once()
        prompt = chat.call_args.args[0][1]["content"]
        self.assertIn("原始热门话题文本（图片关键词唯一事实来源）", prompt)
        self.assertIn(source, prompt)
        self.assertIn("不得据此补充或确认", prompt)
        return topics.commit_recommendation(prepared), prepared

    def test_one_keyword_is_saved_imported_and_accepted_by_single_topic_search(self):
        source = "中国男足小组第一进8强，赛事名称待核实"
        result, prepared = self.prepare(source, ["中国男足"])
        self.assertIn("已完成", result["提示词状态"])
        topic_id = result["选题编号"]
        folder = topic_packages.folder_for(topic_id)
        package = topic_packages.load(folder)
        self.assertEqual([item["query"] for item in package["image_plan"]], ["中国男足"])
        self.assertNotIn("世界杯", [item["query"] for item in package["image_plan"]])
        topic_packages.mark_imported(topic_id)
        action = image_actions.validate({"topic": topic_id, "mode": "search", "provider": "doubao",
                                         "sources": ["今日头条"]})
        self.assertEqual(action["topic"], topic_id)
        self.assertEqual(action["count"], 1)
        self.assertTrue(prepared["generated"])
        hit = Hit("今日头条", "中国男足", "中国男足相关比赛图片", "模拟图源",
                  "https://images.test/football.jpg", "https://pages.test/football",
                  900, 600, semantic_approved=True)
        source = SimpleNamespace(name="今日头条", close=Mock())
        quality = Mock(return_value="")
        quality.accept = Mock()
        with patch.object(model_settings, "resolve", return_value={"api_key": "fixture"}), \
             patch.object(sourcing, "build_sources", return_value=([source], [])), \
             patch.object(sourcing, "collect_hits_with_pages", return_value=([hit], [])), \
             patch.object(sourcing, "model_filter_hits", return_value=[hit]), \
             patch.object(sourcing, "visual_quality_check", return_value=quality), \
             patch.object(sourcing, "_Downloader", return_value=lambda _hit: jpeg_bytes()), \
             patch.object(sourcing, "rejection_reason", return_value=""), \
             patch.object(sourcing, "_similar", return_value=False), \
             patch.object(sourcing, "analyze", side_effect=AssertionError("不能分析全文")), \
             patch.object(sourcing, "model_analysis", side_effect=AssertionError("不能二次提词")), \
             patch.object(sourcing, "generate_ai_image", side_effect=AssertionError("不能自动生图")):
            rows = image_actions.run(action, hint=lambda _message: None)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["搜索词"], "中国男足")
        self.assertEqual(rows[0]["计划顺序"], 0)
        self.assertEqual(len(image_review.load_review(folder)["states"]), 1)

    def test_invalid_keyword_is_removed_without_losing_valid_terms(self):
        source = "罗永浩点赞小米18Fold"
        result, _ = self.prepare(source, ["足球比赛", "小米18Fold"])
        package = topic_packages.load(topic_packages.folder_for(result["选题编号"]))
        self.assertEqual([item["query"] for item in package["image_plan"]], ["小米18Fold"])
        self.assertEqual(package["image_plan_warnings"][0]["query"], "足球比赛")
        self.assertIn("明确内容", package["image_plan_warnings"][0]["reason"])
        self.assertIn("文章提示词已完成", result["提示词状态"])
        board_row = console.latest_topics()[0]
        self.assertEqual(board_row["图片关键词"], ["小米18Fold"])
        self.assertEqual(board_row["图片关键词警告"][0]["query"], "足球比赛")

    def test_all_invalid_keywords_keep_article_prompt_and_user_can_confirm(self):
        source = "中国男足小组第一进8强，赛事名称和组别待核实"
        result, prepared = self.prepare(source, ["世界杯", "亚洲杯", "赛事名称"])
        self.assertTrue(prepared["generated"])
        self.assertEqual(len(prepared["result"]["文章提示词"].splitlines()), 4)
        self.assertIn("什么事：", prepared["result"]["文章提示词"])
        self.assertIn("图片关键词需要调整", result["提示词状态"])
        topic_id = result["选题编号"]
        folder = topic_packages.folder_for(topic_id)
        pending = topic_packages.load_any(folder)
        self.assertEqual(pending["status"], "needs_keywords")
        uncertain = next(item for item in pending["image_plan_warnings"]
                         if item["query"] == "赛事名称")
        self.assertIn("待核实", uncertain["reason"])
        self.assertNotIn("基础版（标题待确认）", Path(result["文件"]).read_text(encoding="utf-8"))
        board_row = console.latest_topics()[0]
        self.assertEqual(board_row["内容包状态"], "needs_keywords")
        self.assertEqual(board_row["图片关键词"], [])
        html = (Path(__file__).parents[1] / "article_hub" / "console_page.html").read_text(encoding="utf-8")
        self.assertIn("data-topic-confirm-keywords", html)

        confirmed = topics.confirm_topic_keywords(topic_id, [
            {"query": "中国男足", "keyword_type": "core", "enabled": True},
            {"query": "赛事新闻 搜索词", "keyword_type": "background", "enabled": True},
        ])
        self.assertEqual(confirmed["keywords"], ["中国男足", "赛事新闻 搜索词"])
        imported = topic_packages.mark_imported(topic_id)
        self.assertEqual(imported["image_count"], 2)
        action = image_actions.validate({"topic": topic_id, "mode": "search", "provider": "doubao",
                                         "sources": ["今日头条"]})
        self.assertEqual(action["count"], 1)
        saved_prompt = Path(result["文件"]).read_text(encoding="utf-8")
        self.assertNotIn("图片提示词：", saved_prompt)
        self.assertNotIn("背景词（已确认启用）", saved_prompt)
        self.assertNotIn("赛事新闻 搜索词", saved_prompt)
        self.assertIn("赛事新闻 搜索词", topic_packages.markdown_plan(
            topic_packages.load(folder)))

    def test_malformed_image_list_does_not_replace_the_valid_writing_prompt(self):
        source = "一个明确的选题对象"
        malformed = model_answer("文章标题", ["一个明确的选题对象"])
        malformed["image_plan"] = {"query": "一个明确的选题对象"}
        with patch.object(topics.ai, "chat",
                          return_value=json.dumps(malformed, ensure_ascii=False)) as chat:
            prepared = topics.prepare_recommendation(title=source)
        chat.assert_called_once()
        self.assertTrue(prepared["generated"])
        self.assertEqual(len(prepared["result"]["文章提示词"].splitlines()), 4)
        self.assertIn("建议标题：", prepared["result"]["文章提示词"])
        self.assertEqual(prepared["content_package"]["status"], "needs_keywords")
        self.assertIn("不是列表", prepared["content_package"]["image_plan_warnings"][0]["reason"])

    def test_unconfirmed_policy_types_are_not_accepted_as_facts(self):
        source = "5300多万名老年人享受老年人补贴；具体补贴类型待核实，例如高龄补贴"
        result, _ = self.prepare(source, ["老年人", "老年人补贴", "养老服务补贴", "高龄补贴"])
        package = topic_packages.load(topic_packages.folder_for(result["选题编号"]))
        self.assertEqual([item["query"] for item in package["image_plan"]], ["老年人", "老年人补贴"])
        self.assertEqual([item["query"] for item in package["image_plan_warnings"]],
                         ["养老服务补贴", "高龄补贴"])

    def test_confirm_endpoint_accepts_explicit_user_edits_and_imports(self):
        result, _ = self.prepare("原话中只有一个对象", ["不在原话中的模型词"])
        topic_id = result["选题编号"]
        body = json.dumps({"topic_id": topic_id, "keywords": [
            {"query": "原话中只有一个对象", "keyword_type": "core", "enabled": True},
            {"query": "用户确认的对象", "keyword_type": "background", "enabled": True},
        ]},
                          ensure_ascii=False).encode("utf-8")
        handler = object.__new__(console.Handler)
        handler.path = "/api/topic-keywords-confirm"
        handler.headers = {"Content-Length": str(len(body))}
        handler.rfile = __import__("io").BytesIO(body)
        responses = []
        handler._json = lambda payload, status=200: responses.append((status, payload))
        handler._handle_post()
        self.assertEqual(responses[0][0], 200)
        self.assertTrue(topic_packages.is_imported(topic_packages.folder_for(topic_id)))
        self.assertEqual([item["query"] for item in topic_packages.searchable_plan(
            topic_packages.load(topic_packages.folder_for(topic_id)))],
            ["原话中只有一个对象", "用户确认的对象"])

    def test_three_to_five_grounded_keywords_remain_usable(self):
        source = "喜人奇妙夜 吕严 李川 王安宇"
        result, _ = self.prepare(source, ["喜人奇妙夜", "吕严", "李川", "王安宇"])
        package = topic_packages.load(topic_packages.folder_for(result["选题编号"]))
        self.assertEqual(len(package["image_plan"]), 4)
        self.assertEqual(package["image_plan_warnings"], [])

    def test_short_topic_keeps_core_and_offers_unconfirmed_scene_and_background_terms(self):
        source = "潘展乐责任全在我"
        result, _ = self.prepare(source, [
            {"query": "潘展乐", "keyword_type": "core"},
            {"query": "潘展乐 训练", "keyword_type": "scene",
             "subject_query": "潘展乐", "scene_term": "训练"},
            {"query": "中国游泳", "keyword_type": "background"},
            {"query": "孙杨", "keyword_type": "background"},
        ])
        folder = topic_packages.folder_for(result["选题编号"])
        package = topic_packages.load(folder)
        self.assertEqual(package["image_plan"][0]["query"], "潘展乐")
        self.assertEqual([row["query"] for row in package["image_plan"]],
                         ["潘展乐", "潘展乐 训练", "中国游泳", "孙杨"])
        self.assertEqual([row["keyword_type"] for row in package["image_plan"]],
                         ["core", "scene", "background", "background"])
        self.assertEqual([row["query"] for row in topic_packages.searchable_plan(package)],
                         ["潘展乐"])
        self.assertTrue(all(not row["enabled"] for row in package["image_plan"][1:]))
        self.assertTrue(all(not row["user_confirmed"] for row in package["image_plan"][1:]))

    def test_information_material_terms_can_be_confirmed_without_the_markdown_prompt(self):
        source = "郭宇欣被起诉，详情待核实"
        result, _ = self.prepare(source, [
            {"query": "郭宇欣", "keyword_type": "core"},
            {"query": "郭宇欣 声明", "keyword_type": "scene",
             "subject_query": "郭宇欣", "scene_term": "声明"},
            {"query": "郭宇欣 公告", "keyword_type": "scene",
             "subject_query": "郭宇欣", "scene_term": "公告"},
            {"query": "郭宇欣 新闻报道", "keyword_type": "scene",
             "subject_query": "郭宇欣", "scene_term": "新闻报道"},
        ])
        topic_id = result["选题编号"]
        folder = topic_packages.folder_for(topic_id)
        Path(result["文件"]).unlink()
        topic_packages.mark_imported(topic_id)
        saved = topics.confirm_topic_keywords(topic_id, [
            {"query": "郭宇欣", "keyword_type": "core", "enabled": True},
            {"query": "郭宇欣 声明", "keyword_type": "scene", "enabled": True},
            {"query": "郭宇欣 公告", "keyword_type": "scene", "enabled": True},
            {"query": "郭宇欣 新闻报道", "keyword_type": "scene", "enabled": True},
        ])
        self.assertEqual(saved["keyword_version"], 2)
        self.assertIn("仅更新选题内容包", saved["note"])
        self.assertEqual(saved["keywords"], ["郭宇欣", "郭宇欣 声明", "郭宇欣 公告", "郭宇欣 新闻报道"])
        package = topic_packages.load(folder)
        self.assertEqual(len(package["image_plan"]), 4)
        self.assertFalse(any(name in " ".join(saved["keywords"])
                             for name in ("某某公司", "法院", "孙杨")))
        scene = next(row for row in package["image_plan"] if row["scene_term"] == "声明")
        action = image_actions.validate({"topic": topic_id, "mode": "search", "provider": "doubao",
                                         "position_id": scene["position_id"], "count": 1,
                                         "sources": ["今日头条"]})
        self.assertEqual([row["query"] for row in action["keyword_snapshot"]], ["郭宇欣", "郭宇欣 声明", "郭宇欣 公告", "郭宇欣 新闻报道"])
        self.assertEqual(action["position_id"], scene["position_id"])
        self.assertIn("人物 声明", topics.ASK_PROMPT)
        self.assertIn("不得猜测公司、诉讼当事人、法院", topics.ASK_PROMPT)

    def test_confirmed_terms_edit_next_round_only_and_preserve_keyword_snapshot_and_history(self):
        source = "潘展乐责任全在我"
        result, _ = self.prepare(source, [
            {"query": "潘展乐", "keyword_type": "core"},
            {"query": "潘展乐 训练", "keyword_type": "scene",
             "subject_query": "潘展乐", "scene_term": "训练"},
            {"query": "中国游泳", "keyword_type": "background"},
        ])
        topic_id = result["选题编号"]
        folder = topic_packages.folder_for(topic_id)
        topic_packages.mark_imported(topic_id)
        history_path = folder / image_actions.TOPIC_SEARCH_HISTORY_FILE
        history_path.write_text('{"rounds":[{"round":1,"status":"completed"}]}', encoding="utf-8")
        before_history = history_path.read_bytes()

        confirmed = topics.confirm_topic_keywords(topic_id, [
            {"query": "潘展乐", "keyword_type": "core", "enabled": True},
            {"query": "潘展乐 训练", "keyword_type": "scene", "enabled": True},
            {"query": "中国游泳", "keyword_type": "background", "enabled": False},
        ])
        self.assertEqual(confirmed["image_count"], 2)
        self.assertEqual(confirmed["keyword_version"], 2)
        action = image_actions.validate({"topic": topic_id, "mode": "search", "provider": "doubao",
                                         "sources": ["今日头条"]})
        self.assertEqual([row["query"] for row in action["keyword_snapshot"]],
                         ["潘展乐", "潘展乐 训练"])
        self.assertEqual(action["keyword_version"], 2)

        topics.confirm_topic_keywords(topic_id, [
            {"query": "潘展乐", "keyword_type": "core", "enabled": True},
            {"query": "潘展乐 训练", "keyword_type": "scene", "enabled": False},
            {"query": "中国游泳", "keyword_type": "background", "enabled": True},
        ])
        _, analysis, running_plan = image_actions._package_analysis(folder, action)
        self.assertEqual([row["query"] for row in running_plan], ["潘展乐", "潘展乐 训练"])
        self.assertEqual([row.text for row in analysis.queries], ["潘展乐", "潘展乐 训练"])
        self.assertEqual(history_path.read_bytes(), before_history)
        self.assertTrue(topic_packages.is_imported(folder))

    def test_confirmed_background_keyword_uses_its_own_relevance_type(self):
        source = "潘展乐责任全在我"
        result, _ = self.prepare(source, [
            {"query": "潘展乐", "keyword_type": "core"},
            {"query": "中国游泳", "keyword_type": "background"},
        ])
        topic_id = result["选题编号"]
        folder = topic_packages.folder_for(topic_id)
        topics.confirm_topic_keywords(topic_id, [
            {"query": "潘展乐", "keyword_type": "core", "enabled": True},
            {"query": "中国游泳", "keyword_type": "background", "enabled": True},
        ])
        package = topic_packages.load(folder)
        plan = next(row for row in package["image_plan"] if row["keyword_type"] == "background")
        document = topic_packages.synthetic_document(folder, package_override=package)
        hit = Hit("今日头条", "中国游泳", "中国游泳训练馆信息", "模拟图源",
                  "https://images.test/swimming-background.jpg", "https://pages.test/swimming", 900, 600)
        with patch.object(sourcing, "_model_json", return_value={"keep": [0]}) as model:
            kept = sourcing.model_filter_hits(document, [hit], ["潘展乐"],
                queries=[sourcing.Query("中国游泳")], image_plan=[plan], hint=lambda _message: None)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].query, "中国游泳")
        self.assertTrue(kept[0].semantic_approved)
        sent = json.loads(model.call_args.args[0][1]["content"])
        self.assertEqual(sent["candidates"][0]["image_plan"]["keyword_type"], "background")

    def test_hot_topic_board_generates_once_with_one_source_grounded_keyword(self):
        source = "中国男足小组第一进8强，赛事名称待核实"
        card = self.daily / "2026-09-24_001_中国男足_选题卡.md"
        card.write_text(f"# 候选 1：{source}\n\n热点线索：赛事与组别待核实。\n", encoding="utf-8")
        answer = json.dumps(model_answer("中国男足晋级8强", ["中国男足"]), ensure_ascii=False)
        with patch.object(topics.ai, "ready", return_value=(True, "模拟模型")), \
             patch.object(topics.ai, "chat", return_value=answer) as chat:
            result = topics.generate_prompts(cards=[card], hint=lambda _message: None)
        chat.assert_called_once()
        self.assertEqual(result, 0)
        item = console.latest_topics()[0]
        self.assertEqual(item["内容包状态"], "ready")
        self.assertEqual(item["图片关键词"], ["中国男足"])
        self.assertIn("原始热门话题文本（图片关键词唯一事实来源）", chat.call_args.args[0][1]["content"])

    def test_manual_topic_generation_uses_the_same_keyword_contract(self):
        source = "罗永浩点赞小米18Fold"
        answer = json.dumps(model_answer("罗永浩点评小米18Fold", ["罗永浩", "小米18Fold"]),
                            ensure_ascii=False)
        with patch.object(topics, "fetch_combined_board", return_value=[]), \
             patch.object(topics, "article_samples", return_value=[]), \
             patch.object(topics.ai, "ready", return_value=(True, "模拟模型")), \
             patch.object(topics.ai, "settings", return_value={}), \
             patch.object(topics, "_chat_with_profile", return_value=answer) as chat:
            prepared = topics.prepare_manual_topics([source], hint=lambda _message: None)
        chat.assert_called_once()
        item = prepared["items"][0]
        self.assertTrue(item["generated"])
        self.assertEqual([term["query"] for term in item["content_package"]["image_plan"]],
                         ["罗永浩", "小米18Fold"])
        topics.commit_manual_topics(prepared)
        self.assertTrue(topic_packages.folder_for(item["content_package"]["topic_id"]).is_dir())


if __name__ == "__main__":
    unittest.main()
