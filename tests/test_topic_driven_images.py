"""选题驱动配图的最小闭环测试；全部使用临时目录和模拟网络/模型。"""

import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote
from unittest.mock import ANY, Mock, patch

from PIL import Image

from article_hub import (
    ai,
    config,
    console,
    image_actions,
    image_review,
    layout,
    library,
    model_settings,
    sourcing,
    topic_packages,
    topics,
)
from article_hub.docxio import Block, read_document, write_document
from article_hub.hits import Hit


def _model_answer(title="高速服务区里的充电长队"):
    candidates = []
    for index in range(5):
        candidate = title if index == 0 else f"{title}·备选{index}"
        score = 10 if index == 0 else 6
        candidates.append({
            "title": candidate,
            "scores": {field: score for field in topics.TITLE_SCORE_FIELDS},
            "reason": "测试评分",
        })
    return {
        "selected_title": title,
        "title_candidates": candidates,
        "angle": "从排队司机的时间成本切入充电基础设施供需矛盾",
        "outline": [
            {"section_id": "s1", "heading": "长队现场", "points": ["还原服务区现场", "核实等待时长"]},
            {"section_id": "s2", "heading": "供需错位", "points": ["比较车流与桩数", "区分平日和假期"]},
            {"section_id": "s3", "heading": "解决办法", "points": ["梳理可行措施", "说明事实边界"]},
        ],
        "prompt": (
            "请使用已经确定的标题、角度和三节大纲完成文章，逐项核实来源、数字与当事人说法，"
            "无法核实的内容明确标注，不得另选标题或改变文章主线。"
        ),
        "image_plan": [
            {"position_id": "cover", "purpose": "cover", "section_id": "", "order": 0,
             "query": "高速服务区 充电排队", "scene": "节假日服务区内多辆新能源车排队等充电",
             "exclude": ["家用充电桩", "品牌广告"]},
            {"position_id": "body-1", "purpose": "body", "section_id": "s1", "order": 1,
             "query": "新能源车主 服务区等待", "scene": "车主在服务区充电区等待并查看车辆",
             "exclude": ["无关人物", "密集字幕"]},
            {"position_id": "body-2", "purpose": "body", "section_id": "s2", "order": 2,
             "query": "高速充电站 车流高峰", "scene": "高速充电站车位与高峰车流同框",
             "exclude": ["室内车展", "其他交通方式"]},
        ],
    }


def _jpeg_bytes(colour):
    stream = io.BytesIO()
    Image.new("RGB", (900, 600), colour).save(stream, format="JPEG")
    return stream.getvalue()


class TopicDrivenImagesTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        paths = {
            "UNFORMATTED": self.root / "未排版文章",
            "FORMATTED": self.root / "已排版文章",
            "DATA": self.root / "data",
            "PREVIEW": self.root / "预览",
        }
        for name, value in paths.items():
            value.mkdir(parents=True)
            mocked = patch.object(config, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        daily = patch.object(topics, "DAILY_DIR", self.root / "选题")
        daily.start()
        self.addCleanup(daily.stop)
        ledger = patch.object(library, "LEDGER", config.DATA / "库.json")
        ledger.start()
        self.addCleanup(ledger.stop)
        empty_ledger = patch.object(library, "load_ledger", return_value={"文章": {}})
        empty_ledger.start()
        self.addCleanup(empty_ledger.stop)
        resolver = patch.object(model_settings, "resolve", return_value={"api_key": "fixture"})
        resolver.start()
        self.addCleanup(resolver.stop)

    def test_topic_search_request_budget_stops_after_the_allowed_attempts(self):
        hit=Hit('模拟图源','词一','词一候选','测试','https://images.test/budget',
                'https://pages.test/budget',900,600)
        source=SimpleNamespace(name='模拟图源',search=Mock(return_value=[hit]))
        progress=[]
        hits,warnings=sourcing.collect_hits(
            [source],[sourcing.Query('词一'),sourcing.Query('词二')],pause=0,
            hint=lambda _:None,progress=progress.append,max_requests=1,deadline=float('inf'))
        self.assertEqual(hits,[hit])
        self.assertEqual(source.search.call_count,1)
        self.assertTrue(any('次数已达到' in warning for warning in warnings))
        self.assertTrue(progress[-1]['budget_exhausted'])
        self.assertEqual(progress[-1]['searches_done'],1)

    def test_bounded_pagination_rotates_queries_and_reports_one_request_budget(self):
        calls=[]
        class PagedSource:
            name='模拟翻页图源'
            def search(self, query):
                calls.append((query,0))
                return [Hit(self.name,query,f'{query} 首页','测试',
                            f'https://images.test/{query}-0','https://pages.test/0',900,600)]
            def search_page(self, query, page):
                calls.append((query,page))
                return [Hit(self.name,query,f'{query} 第{page+1}页','测试',
                            f'https://images.test/{query}-{page}','https://pages.test/x',900,600)]
        progress=[]
        hits,warnings=sourcing.collect_hits_with_pages(
            [PagedSource()],[sourcing.Query('乒乓球'),sourcing.Query('国乒男团')],
            pause=0,hint=lambda _message:None,progress=progress.append,
            max_requests=5,max_pages_per_query=4,deadline=float('inf'))
        self.assertEqual(len(hits),5)
        self.assertEqual(calls[:2],[('乒乓球',0),('国乒男团',0)])
        self.assertEqual(calls[2:4],[('乒乓球',1),('国乒男团',1)])
        self.assertEqual(calls[-1],('乒乓球',2))
        self.assertTrue(all(event.get('searches_total')==5 for event in progress))
        self.assertEqual(progress[-1]['searches_done'],5)

    def test_pagination_resumes_from_the_saved_per_query_cursor(self):
        calls=[]
        class PagedSource:
            name='可翻页图源'
            def search(self, query):
                raise AssertionError('续搜游标不应回到首页')
            def search_page(self, query, page):
                calls.append(page)
                return [Hit(self.name,query,f'第{page+1}页','测试',
                            f'https://images.test/resume-{page}','https://pages.test/resume',900,600)]
        progress=[]
        key=json.dumps(['可翻页图源','乒乓球'],ensure_ascii=False,separators=(',',':'))
        hits,warnings=sourcing.collect_hits_with_pages(
            [PagedSource()],[sourcing.Query('乒乓球')],pause=0,hint=lambda _message:None,
            progress=progress.append,max_requests=3,max_pages_per_query=3,
            deadline=float('inf'),page_offsets={key:4})
        self.assertEqual(calls,[4,5,6])
        self.assertEqual([hit.image_url for hit in hits],[
            'https://images.test/resume-4','https://images.test/resume-5','https://images.test/resume-6'])
        self.assertTrue(all(event.get('page_success') for event in progress))
        self.assertEqual([event['page_index'] for event in progress],[4,5,6])

    def test_expired_topic_filter_budget_does_not_send_an_unchecked_model_call(self):
        hit=Hit('模拟图源','已确认关键词','相关候选','测试','https://images.test/expired',
                'https://pages.test/expired',900,600)
        progress=[]
        with patch.object(sourcing,'rejection_reason',return_value=''), \
             patch.object(sourcing,'_model_json') as model:
            kept=sourcing.model_filter_hits(
                SimpleNamespace(title='标题',blocks=[]),[hit],['已确认关键词'],
                image_plan=[{'query':hit.query}],hint=lambda _:None,
                progress=progress.append,deadline=0)
        model.assert_not_called()
        self.assertEqual(kept,[])
        self.assertTrue(progress[-1]['budget_exhausted'])

    def test_text_filter_progress_separates_rule_prefilter_from_model_work(self):
        candidates=[
            Hit('模拟图源','确认关键词','候选被本地规则过滤','测试','https://images.test/local-drop',
                'https://pages.test/local-drop',900,600),
            Hit('模拟图源','确认关键词','候选通过本地预筛','测试','https://images.test/model-check',
                'https://pages.test/model-check',900,600),
        ]
        events=[]
        with patch.object(sourcing,'rejection_reason',side_effect=['明确不符合规则','']), \
             patch.object(sourcing,'_model_json',return_value={'keep':[0]}):
            result=sourcing.model_filter_hits(SimpleNamespace(title='测试',blocks=[]),candidates,
                ['确认关键词'],image_plan=[{'query':'确认关键词'}],progress=events.append,
                hint=lambda _message:None)
        self.assertEqual(len(result),1)
        self.assertEqual(events[0]['stage'],'本地规则预筛')
        self.assertEqual(events[0]['input_total'],2)
        self.assertEqual(events[0]['prefiltered'],1)
        self.assertEqual(events[0]['check_total'],1)
        self.assertEqual(events[-1]['checked'],1)
        self.assertEqual(events[-1]['check_total'],1)

    def _commit_package(self, suffix="00000001", *, title=None):
        topic_id = f"TP-20260923-{suffix}"
        answer = _model_answer(title or f"测试选题{suffix}")
        keyword_source = "高速服务区充电排队 新能源车主服务区等待 高速充电站车流高峰"
        payload = topic_packages.build(
            topic_id=topic_id,
            title=answer["selected_title"],
            original_topic=keyword_source,
            generated=answer,
            source="测试",
            keyword_source=keyword_source,
        )
        return topic_id, topic_packages.commit(payload), payload

    def _action(self, topic_id):
        try:
            folder = topic_packages.folder_for(topic_id)
            if folder.is_dir() and not topic_packages.is_imported(folder):
                topic_packages.mark_imported(topic_id)
        except (OSError, ValueError):
            pass
        return {
            "topic": topic_id,
            "mode": "search",
            "image": "",
            "count": 20,
            "provider": "deepseek",
            "model": "fixture-text-model",
            "query": "",
            "sources": ["豆瓣"],
        }

    def test_one_model_call_returns_both_parts_and_bad_plan_is_rejected(self):
        # This is the current four-line brief contract. Keep _model_answer's
        # legacy shape in the other compatibility tests.
        brief = {
            "event": "高速服务区充电排队，新能源车主等待时间增加",
            "significance": "充电供需错位影响出行安排",
            "suggested_angle": "核实排队现场与设施供给",
            "requirements": "核对等待时长和充电桩数量",
            "suggested_title": "服务区充电长队从何而来",
            "image_plan": [
                {"position_id": "cover", "order": 0, "query": "高速服务区 充电排队", "keyword_type": "core"},
                {"position_id": "body-1", "order": 1, "query": "新能源车主 服务区等待", "keyword_type": "core"},
                {"position_id": "body-2", "order": 2, "query": "高速充电站 车流高峰", "keyword_type": "core"},
            ],
        }
        raw = json.dumps(brief, ensure_ascii=False)
        with patch.object(topics, "_rule_digest", return_value="测试规则"), \
             patch.object(topics.ai, "chat", return_value=raw) as chat:
            source = "高速服务区充电排队 新能源车主服务区等待 高速充电站车流高峰"
            prepared = topics.prepare_recommendation(title=source)
        chat.assert_called_once()
        self.assertTrue(prepared["generated"])
        package = prepared["content_package"]
        brief_lines = prepared["result"]["提示词"].splitlines()
        self.assertEqual(len(brief_lines), 4)
        self.assertTrue(brief_lines[0].startswith("什么事："))
        self.assertTrue(brief_lines[-1].startswith("建议标题："))
        self.assertEqual(package["outline"], [])
        self.assertEqual([item["query"] for item in package["image_plan"]],
                         [item["query"] for item in brief["image_plan"]])
        self.assertTrue(all(item["keyword_type"] == "core" and item["enabled"]
                            for item in package["image_plan"]))
        self.assertEqual(list(config.UNFORMATTED.iterdir()), [], "prepare 阶段不应提前落盘")

        broken = dict(brief)
        broken["image_plan"] = [dict(item) for item in brief["image_plan"]]
        del broken["image_plan"][1]["query"]
        parsed = topics.parse_prompt_package(
            json.dumps(broken, ensure_ascii=False), require_image_plan=True,
            keyword_source=source)
        self.assertEqual(len(parsed["image_plan"]), 2)
        self.assertEqual(len(parsed["image_plan_warnings"]), 1)
        with patch.object(topics, "_rule_digest", return_value="测试规则"), \
             patch.object(topics.ai, "chat", return_value=json.dumps(broken, ensure_ascii=False)) as chat:
            rejected = topics.prepare_recommendation(title="坏清单")
        chat.assert_called_once()
        self.assertTrue(rejected["generated"])
        self.assertEqual(rejected["content_package"]["status"], "needs_keywords")
        self.assertIn("图片关键词需要调整", rejected["result"]["提示词状态"])
        rejected_brief = rejected["result"]["文章提示词"].splitlines()
        self.assertEqual(len(rejected_brief), 4)
        self.assertTrue(rejected_brief[-1].startswith("建议标题："))

    def _seed_rejected_topic_image(self, suffix):
        topic_id, folder, payload = self._commit_package(suffix)
        topic_packages.mark_imported(topic_id)
        rejected = folder / "rejected.jpg"
        rejected_bytes = _jpeg_bytes("red")
        rejected.write_bytes(rejected_bytes)
        image_review.save_review(topic_id, {rejected.name: "rejected"})
        (folder / sourcing.MANIFEST_FILE).write_text(json.dumps({"建议配图数": 3, "配图": [{
            "原始文件名": rejected.name, "图片链接": "https://images.test/rejected.jpg?old=1",
            "计划位置": payload["image_plan"][0]["position_id"],
        }]}), encoding="utf-8")
        hits = [
            Hit("豆瓣", payload["image_plan"][0]["query"], "same url", "fixture",
                "https://images.test/rejected.jpg?new=2", "", 900, 600, semantic_approved=True),
            Hit("豆瓣", payload["image_plan"][1]["query"], "same pixels", "fixture",
                "https://images.test/same-pixels.jpg", "", 900, 600, semantic_approved=True),
            Hit("豆瓣", payload["image_plan"][2]["query"], "new image", "fixture",
                "https://images.test/new-image.jpg", "", 900, 600, semantic_approved=True),
        ]
        # Keep the first two URLs distinct after URL normalization, but give
        # them identical pixels; the final pattern has a different dHash.
        stripe = Image.new("RGB", (900, 600))
        pixels = stripe.load()
        for x in range(900):
            value = 20 if (x // 24) % 2 else 230
            for y in range(600):
                pixels[x, y] = (value, value, value)
        stream = io.BytesIO(); stripe.save(stream, format="JPEG")
        downloads = {
            hits[1].image_url: rejected_bytes,
            hits[2].image_url: stream.getvalue(),
        }
        return topic_id, folder, payload, rejected_bytes, hits, downloads

    def _run_research_fixture(self, topic_id, hits, downloads):
        source = SimpleNamespace(name="豆瓣", close=lambda: None)
        analysis = sourcing.Analysis(
            [sourcing.Query(item["query"]) for item in topic_packages.load(
                topic_packages.folder_for(topic_id))["image_plan"]],
            [topic_packages.load(topic_packages.folder_for(topic_id))["title"]], [])
        def collect(_sources, queries, **_kwargs):
            return [hit for hit in hits if hit.query == queries[0].text], []
        with patch.object(sourcing, "build_sources", return_value=([source], [])), \
             patch.object(sourcing, "collect_hits_with_pages", side_effect=collect), \
             patch.object(sourcing, "model_analysis", return_value=analysis), \
             patch.object(sourcing, "model_filter_hits", side_effect=lambda _doc, rows, *_a, **_k: rows), \
             patch.object(sourcing, "rejection_reason", return_value=""), \
             patch.object(sourcing, "_Downloader", side_effect=lambda *_a, **_k:
                           lambda hit: downloads.setdefault("__calls__", []).append(hit.image_url)
                           or downloads.get(hit.image_url)):
            return image_actions.run(self._action(topic_id), hint=lambda _message: None)

    def test_research_preserves_rejection_dedupes_and_installs_only_new_pixels(self):
        topic_id, folder, _payload, rejected_bytes, hits, downloads = self._seed_rejected_topic_image("00000021")
        download_calls = downloads["__calls__"] = []
        rows = self._run_research_fixture(topic_id, hits, downloads)
        self.assertNotIn(hits[0].image_url, download_calls,
                         "A normalized URL already in the manifest is skipped before download")
        self.assertIn(hits[1].image_url, download_calls,
                      "A different URL with matching pixels is downloaded before pixel deduplication")
        self.assertIn(hits[2].image_url, download_calls)
        self.assertEqual(len(rows), 1)
        self.assertEqual((folder / "rejected.jpg").read_bytes(), rejected_bytes)
        state = image_review.load_review(folder)["states"]
        self.assertEqual(state["rejected.jpg"], "rejected")
        self.assertEqual(state[rows[0]["原始文件名"]], "pending")
        self.assertEqual(set(state), {"rejected.jpg", rows[0]["原始文件名"]})

    def test_install_review_ledger_failure_rolls_back_candidate_and_rejection(self):
        topic_id, folder, _payload, rejected_bytes, hits, downloads = self._seed_rejected_topic_image("00000022")
        # Only offer one genuinely new picture so the injected failure reaches
        # the commit path after the URL and pixel checks.
        hits = [hits[2]]
        with patch.object(image_review, "save_candidate_review",
                          side_effect=OSError("fixture install ledger failure")):
            with self.assertRaisesRegex(OSError, "fixture install ledger failure"):
                self._run_research_fixture(topic_id, hits, downloads)
        self.assertEqual((folder / "rejected.jpg").read_bytes(), rejected_bytes)
        self.assertEqual(image_review.load_review(folder)["states"], {"rejected.jpg": "rejected"})
        manifest = json.loads((folder / sourcing.MANIFEST_FILE).read_text(encoding="utf-8"))
        self.assertEqual([item["原始文件名"] for item in manifest["配图"]], ["rejected.jpg"])
        self.assertFalse(any(path.name.startswith("网络候选_") for path in folder.iterdir()))
    def test_package_without_word_is_valid_and_uses_plan_target_count(self):
        topic_id, folder, payload = self._commit_package()
        self.assertIsNone(topic_packages.imported_word(folder))
        self.assertEqual(topic_packages.load(folder)["topic_id"], topic_id)
        self.assertEqual(image_review.target_count(folder), len(payload["image_plan"]))
        document = image_review.source_document(folder)
        self.assertEqual(document.path.name, topic_packages.PACKAGE_FILE)
        self.assertFalse(topic_packages.is_imported(folder))
        self.assertNotIn(topic_id, {item['topic'] for item in image_review.list_topics()},
                         'Generated topics stay off the image board until explicit import')
        with self.assertRaisesRegex(ValueError, '一键导入配图清单'):
            image_actions.validate({"topic": topic_id, "mode": "search"})
        with self.assertRaisesRegex(ValueError, '必须使用已导入的提示词清单配图'):
            image_review.resource(topic_id, ['豆瓣'])
        with self.assertRaisesRegex(ValueError, '一键导入配图清单'):
            image_review.reformat(topic_id)
        request_body = json.dumps({'topic_id': topic_id}).encode()
        handler = object.__new__(console.Handler)
        handler.path = '/api/topic-plan-import'
        handler.headers = {'Content-Length': str(len(request_body))}
        handler.rfile = io.BytesIO(request_body)
        responses = []
        handler._json = lambda payload, status=200: responses.append((status, payload))
        handler._handle_post()
        self.assertEqual(responses[0][0], 200)
        self.assertTrue(topic_packages.is_imported(folder))
        row = next(item for item in image_review.list_topics() if item["topic"] == topic_id)
        self.assertTrue(row["plan_ready"])
        self.assertFalse(row["has_word"])
        self.assertEqual(row["target_count"], 3)
        self.assertEqual(row["paragraphs"], [])
        self.assertEqual([item["query"] for item in row["image_plan"]],
                         [item["query"] for item in payload["image_plan"]])
        self.assertEqual([item["heading"] for item in row["image_plan"]],
                         ["", "长队现场", "供需错位"])
        blocked = {**self._action(topic_id), "mode": "generate", "provider": "gpt",
                   "model": "gpt-image-1", "count": 1}
        with self.assertRaisesRegex(ValueError, "只按已校验清单搜索网络图片"):
            image_actions.validate(blocked)
        missing_source = self._action(topic_id)
        missing_source.pop("sources")
        with self.assertRaisesRegex(ValueError, "请选择有效的网络图片来源"):
            image_actions.validate(missing_source)

    def test_multiple_export_words_are_shown_and_the_selected_file_is_copied(self):
        topic_id, folder, _package = self._commit_package('00000046')
        topic_packages.mark_imported(topic_id)
        name='候选图片.jpg'
        (folder/name).write_bytes(_jpeg_bytes('blue'))
        image_review.save_candidate_review(topic_id,[name])
        image_review.save_review(topic_id,{name:'approved'})
        export=image_review.topic_export_folder(topic_id)
        self.assertIsNotNone(export)
        for filename,title in [('稿甲.docx','第一份稿'),('稿乙.docx','第二份稿')]:
            write_document(export/filename,[Block('title',title),Block('p','用于排版的临时测试正文。')],title=title)
        status=topic_packages.export_word_status(topic_id)
        self.assertEqual(status['doc_count'],2)
        with self.assertRaisesRegex(ValueError,'选择要排版的 Word'):
            topic_packages.import_word_from_export(topic_id)
        result=topic_packages.import_word_from_export(topic_id,filename='稿乙.docx')
        self.assertEqual(result['filename'],'稿乙.docx')
        self.assertEqual(topic_packages.imported_word(folder).name,'稿乙.docx')
        self.assertTrue((export/'稿乙.docx').is_file(),"The user's original Word stays in the title folder")

    def test_layout_uses_approved_only_and_preserves_pending_candidate_decisions(self):
        topic_id, folder, package=self._commit_package('00000047')
        topic_packages.mark_imported(topic_id)
        source=self.root/'用户原稿.docx'
        write_document(source,[Block('title',package['title']),Block('h2','长队现场'),
            Block('p','这是一段临时测试正文，用于验证图片落在文章正文而不是封面位置。'),
            Block('p','第二段继续说明测试内容。')],title=package['title'])
        topic_packages.import_word(topic_id,source.name,source.read_bytes())
        names=['保留图片.jpg','待选图片.jpg']
        for filename,colour in zip(names,('red','green')):
            (folder/filename).write_bytes(_jpeg_bytes(colour))
        (folder/sourcing.MANIFEST_FILE).write_text(json.dumps({'配图':[
            {'原始文件名':name,'原始标题':name,'计划顺序':index,'搜索词':package['image_plan'][0]['query']}
            for index,name in enumerate(names)]},ensure_ascii=False),encoding='utf-8')
        image_review.save_candidate_review(topic_id,names)
        image_review.save_review(topic_id,{names[0]:'approved'})
        with patch.object(library,'refresh_ledger',return_value={'文章':{}}):
            image_review.reformat(topic_id)
        finished=topic_packages.formatted_folder_for(topic_id)
        self.assertEqual(finished.name, package['title'])
        final=next(path for path in finished.glob('*.docx') if path.name!='原文.docx')
        manifest=json.loads((finished/sourcing.MANIFEST_FILE).read_text(encoding='utf-8'))
        archived=finished/'原始素材'
        states=image_review.load_review(archived)['states']
        self.assertEqual([item['原始文件名'] for item in manifest['配图']],[names[0]])
        self.assertEqual(states,{names[0]:'approved',names[1]:'pending'})
        self.assertTrue((archived/source.name).is_file())
        image_review.assert_ready_for_dispatch(final)

    def test_plan_search_uses_saved_queries_and_only_selected_provider_and_source(self):
        topic_id, folder, package = self._commit_package()
        colours = {
            item["query"]: colour
            for item, colour in zip(package["image_plan"], ("red", "green", "blue"))
        }
        hits = [
            Hit("豆瓣", item["query"], item["scene"], "测试来源",
                f"https://images.test/{index}.jpg", f"https://pages.test/{index}",
                900, 600, semantic_approved=True,
                cover_approved=item["purpose"] == "cover")
            for index, item in enumerate(package["image_plan"])
        ]
        source = SimpleNamespace(name="豆瓣", close=Mock())
        quality = Mock(return_value="")
        quality.accept = Mock()

        def collect(selected_sources, queries, **_kwargs):
            self.assertEqual(selected_sources, [source])
            self.assertEqual(len(queries), 1)
            self.assertIn(queries[0].text, [item["query"] for item in package["image_plan"]])
            self.assertEqual(_kwargs['max_requests'], 1)
            self.assertIsNotNone(_kwargs['deadline'])
            return [hit for hit in hits if hit.query == queries[0].text], []

        def download(hit):
            return _jpeg_bytes(colours[hit.query])

        with patch.object(model_settings, "resolve", return_value={"api_key": "fixture"}) as resolve, \
             patch.object(sourcing, "search_profiles", side_effect=AssertionError("不得自动换提供方")), \
             patch.object(image_review, "source_document", side_effect=AssertionError("搜图不得读取 Word")) as source_document, \
             patch.object(sourcing, "analyze", side_effect=AssertionError("不得分析全文")) as analyze, \
             patch.object(sourcing, "model_analysis", side_effect=AssertionError("不得二次提词")) as model_analysis, \
             patch.object(sourcing, "build_sources", return_value=([source], [])) as build_sources, \
             patch.object(sourcing, "collect_hits_with_pages", side_effect=collect), \
             patch.object(sourcing, "model_filter_hits", return_value=hits) as model_filter, \
             patch.object(sourcing, "visual_quality_check", return_value=quality), \
             patch.object(sourcing, "_Downloader", return_value=download), \
             patch.object(sourcing, "rejection_reason", return_value=""), \
             patch.object(sourcing, "_similar", return_value=False), \
             patch.object(sourcing, "generate_ai_image") as generate:
            rows = image_actions.run(self._action(topic_id), hint=lambda _message: None)

        self.assertEqual(len(rows), 3)
        analyze.assert_not_called()
        model_analysis.assert_not_called()
        source_document.assert_not_called()
        generate.assert_not_called()
        self.assertTrue(resolve.call_args_list)
        self.assertTrue(all(call.args == ("deepseek", "fixture-text-model")
                            for call in resolve.call_args_list))
        build_sources.assert_called_once_with(["豆瓣"], hint=ANY, exact=True)
        self.assertEqual({item["计划位置"] for item in rows},
                         {item["position_id"] for item in package["image_plan"]})
        self.assertEqual(model_filter.call_args.kwargs["image_plan"], package["image_plan"])
        self.assertIsNotNone(model_filter.call_args.kwargs['deadline'])
        self.assertTrue(all(state == "pending"
                            for state in image_review.load_review(folder)["states"].values()))
        replacement = {**self._action(topic_id), "image": rows[1]["原始文件名"],
                       "count": 1, "query": "不得采用的临时关键词"}
        validated = image_actions.validate(replacement)
        self.assertEqual(validated["query"], package["image_plan"][1]["query"])

    def test_search_reads_saved_keywords_before_each_not_yet_sent_request(self):
        topic_id='TP-20260924-00000894'
        answer=_model_answer()
        answer['image_plan']=[answer['image_plan'][0]]
        old_query=answer['image_plan'][0]['query']
        intermediate_query='新能源车主 服务区等待'
        new_query='新能源车主 服务区等待'
        package=topic_packages.build(topic_id=topic_id,title=answer['selected_title'],
            original_topic='高速服务区充电排队 新能源车主服务区等待 高速充电站车流高峰',
            generated=answer,source='测试',
            keyword_source='高速服务区充电排队 新能源车主服务区等待 高速充电站车流高峰')
        folder=topic_packages.commit(package);topic_packages.mark_imported(topic_id)
        source=SimpleNamespace(name='豆瓣',close=Mock())
        observed=[]
        hit_rows={query:Hit('豆瓣',query,query+' 候选','模拟图源',
            'https://images.test/'+str(index),'https://pages.test/'+str(index),900,600,
            semantic_approved=True) for index,query in enumerate((old_query,new_query))}
        def collect(_sources,queries,**_kwargs):
            query=queries[0].text
            observed.append(query)
            if len(observed)==1:
                topics.confirm_topic_keywords(topic_id,[{'query':intermediate_query,'keyword_type':'core','enabled':True}])
                topics.confirm_topic_keywords(topic_id,[{'query':new_query,'keyword_type':'core','enabled':True}])
            return [hit_rows[query]],[]
        with patch.object(sourcing,'build_sources',return_value=([source],[])), \
             patch.object(sourcing,'collect_hits_with_pages',side_effect=collect), \
             patch.object(sourcing,'model_filter_hits',side_effect=lambda _doc,rows,*_a,**_k:rows), \
             patch.object(sourcing,'_Downloader',return_value=lambda _hit:_jpeg_bytes('blue')), \
             patch.object(sourcing,'_similar',return_value=False):
            messages=[]
            candidates=image_actions.run({**self._action(topic_id),'count':1},hint=messages.append)
        self.assertEqual(observed,[old_query,new_query])
        self.assertEqual(len(candidates),1)
        self.assertEqual(candidates[0]['搜索词'],new_query)
        history=json.loads((folder/image_actions.TOPIC_SEARCH_HISTORY_FILE).read_text(encoding='utf-8'))
        record=history['rounds'][-1]
        self.assertEqual([item['query'] for item in record['queries']],[old_query,new_query])
        self.assertEqual(record['keyword_versions'],[1,3])
        progress=[json.loads(line[len('[图片进度] '):]) for line in messages
                  if line.startswith('[图片进度] ')]
        actual=max((item.get('searched_keywords',[]) for item in progress),key=len)
        self.assertEqual([item['query'] for item in actual],[old_query,new_query])

    def test_one_confirmed_keyword_can_append_twenty_checked_candidates(self):
        topic_id = 'TP-20260924-00000888'
        answer = _model_answer()
        answer['image_plan'] = [answer['image_plan'][1]]
        keyword_source = '新能源车主 服务区等待'
        package = topic_packages.build(
            topic_id=topic_id, title=answer['selected_title'],
            original_topic=keyword_source, generated=answer, source='测试',
            keyword_source=keyword_source)
        folder = topic_packages.commit(package)
        topic_packages.mark_imported(topic_id)
        query = package['image_plan'][0]['query']
        hits = [Hit('豆瓣', query, f'{query} 图片候选 {index}', '模拟图源',
                    f'https://images.test/one-keyword-{index}.jpg',
                    f'https://pages.test/one-keyword-{index}', 900, 600,
                    semantic_approved=True) for index in range(24)]
        pixels = {hit.image_url: _jpeg_bytes((index * 25, 30 + index * 15, 210 - index * 20))
                  for index, hit in enumerate(hits)}
        source = SimpleNamespace(name='豆瓣', close=Mock())
        quality = Mock(return_value='')
        quality.accept = Mock()
        messages = []

        def collect(_sources, queries, *, hint, progress, max_requests, deadline, **_kwargs):
            self.assertEqual([item.text for item in queries], [query])
            self.assertEqual(max_requests, 1)
            self.assertIsNotNone(deadline)
            progress({'stage': '搜图', 'source': '豆瓣', 'query': query,
                      'searches_done': 1, 'searches_total': 1, 'found': len(hits)})
            return hits, []

        with patch.object(sourcing, 'build_sources', return_value=([source], [])), \
             patch.object(sourcing, 'collect_hits_with_pages', side_effect=collect), \
             patch.object(sourcing, 'model_filter_hits', return_value=hits), \
             patch.object(sourcing, 'visual_quality_check', return_value=quality), \
             patch.object(sourcing, '_Downloader', return_value=lambda hit: pixels[hit.image_url]), \
             patch.object(sourcing, 'rejection_reason', return_value=''), \
             patch.object(sourcing, '_similar', return_value=False):
            results = image_actions.run({**self._action(topic_id), 'count': 20},
                                        hint=messages.append)

        self.assertEqual(len(results), 20, messages)
        self.assertEqual({item['搜索词'] for item in image_actions._metadata(folder)['配图']}, {query})
        self.assertEqual(set(image_review.load_review(folder)['states'].values()), {'pending'})
        progress = [json.loads(line[len('[图片进度] '):]) for line in messages
                    if line.startswith('[图片进度] ')]
        self.assertTrue(any(item.get('stage') == '候选检查完成' and item.get('accepted') == 20
                            for item in progress))

    def test_second_round_resumes_pages_and_skips_kept_and_removed_urls(self):
        topic_id='TP-20260924-00000890'
        answer=_model_answer()
        answer['image_plan']=[answer['image_plan'][1]]
        query=answer['image_plan'][0]['query']
        package=topic_packages.build(topic_id=topic_id,title=answer['selected_title'],
            original_topic=query,generated=answer,source='测试',keyword_source=query)
        folder=topic_packages.commit(package);topic_packages.mark_imported(topic_id)
        first=Hit('豆瓣',query,'第一张候选','模拟图源','https://images.test/round/first?sig=one',
                  'https://pages.test/first',900,600,semantic_approved=True)
        second=Hit('豆瓣',query,'第二张候选','模拟图源','https://images.test/round/second',
                   'https://pages.test/second',900,600,semantic_approved=True)
        pixels={first.image_url:_jpeg_bytes('red'),second.image_url:_jpeg_bytes('blue')}
        pages=[]
        class PagedSource:
            name='豆瓣'
            def search(self,_query):return [first]
            def search_page(self,_query,page):
                pages.append(page)
                return [first,second] if page==1 else []
            def download(self,url):return pixels[url]
            def close(self):pass
        source=PagedSource()
        with patch.object(sourcing,'build_sources',return_value=([source],[])), \
             patch.object(sourcing,'model_filter_hits',side_effect=lambda _doc,rows,*_args,**_kw:rows), \
             patch.object(sourcing,'_similar',return_value=False):
            first_round=image_actions.run({**self._action(topic_id),'count':1},hint=lambda _message:None)
            self.assertEqual(len(first_round),1)
            first_name=first_round[0]['原始文件名']
            image_review.save_review(topic_id,{first_name:'rejected'})
            kept_name='preexisting-approved.jpg'
            (folder/kept_name).write_bytes(_jpeg_bytes('yellow'))
            manifest_path=folder/sourcing.MANIFEST_FILE
            manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
            manifest['配图'].append({'原始文件名':kept_name,'搜索词':query,
                '图片链接':'https://images.test/round/already-kept','画面标签':'已确认的比赛现场'})
            manifest_path.write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
            image_review.save_candidate_review(topic_id,[first_name,kept_name])
            image_review.save_review(topic_id,{first_name:'rejected',kept_name:'approved'})
            messages=[]
            second_round=image_actions.run({**self._action(topic_id),'count':1},hint=messages.append)
        self.assertEqual(len(second_round),1)
        self.assertEqual(second_round[0]['图片链接'],second.image_url)
        self.assertEqual(pages[:3],[1,2,3])
        self.assertEqual(pages[3:],[1,2,3,4])
        states=image_review.load_review(folder)['states']
        self.assertEqual(states[first_name],'rejected','A removed choice remains removed')
        self.assertEqual(states[second_round[0]['原始文件名']],'pending')
        progress=[json.loads(line[len('[图片进度] '):]) for line in messages
                  if line.startswith('[图片进度] ')]
        self.assertTrue(any(item.get('round')==2 and item.get('duplicate',0)>=1 for item in progress))
        history=json.loads((folder/image_actions.TOPIC_SEARCH_HISTORY_FILE).read_text(encoding='utf-8'))
        self.assertEqual([item['round'] for item in history['rounds']],[1,2])
        self.assertTrue(all(item['status']=='completed' for item in history['rounds']))

    def test_collaboration_roles_persist_search_and_layout_status_by_topic(self):
        topic_id='TP-20260924-00000893'
        answer=_model_answer();answer['image_plan']=[answer['image_plan'][1]]
        query=answer['image_plan'][0]['query']
        package=topic_packages.build(topic_id=topic_id,title=answer['selected_title'],
            original_topic=query,generated=answer,source='测试',keyword_source=query)
        folder=topic_packages.commit(package);topic_packages.mark_imported(topic_id)
        original=self.root/'三模型协作测试.docx'
        write_document(original,[Block('title',package['title']),Block('h2','长队现场'),
            Block('p','这是一段用于本地排版测试的正文。')],title=package['title'])
        topic_packages.import_word(topic_id,original.name,original.read_bytes())
        collaboration={'mode':'collaborative','vision_confirmed':True,'roles':{
            'text':{'provider':'deepseek','model':'ds-text-fixture'},
            'vision':{'provider':'gpt','model':'gpt-vision-fixture'},
            'layout':{'provider':'doubao','model':'doubao-layout-fixture'}}}
        hit=Hit('豆瓣',query,'服务区充电长队','豆瓣模拟',
            'https://images.test/collab.jpg','https://pages.test/collab',900,600,
            semantic_approved=True)
        class Source:
            name='豆瓣'
            def search(self,_query):return [hit]
            def search_page(self,_query,_page):return []
            def download(self,_url):return _jpeg_bytes('teal')
            def close(self):pass
        provider_names={'deepseek':'DeepSeek','gpt':'GPT','doubao':'豆包'}
        def resolve(provider,model):
            return {'api_key':'fixture','name':provider_names[provider],'模型':model,
                    'wire_api':'chat_completions'}
        def filter_hits(_document,hits,_anchors,**kwargs):
            kwargs['progress']({'stage':'相关性筛选','checked':1,'check_total':1,'accepted':1})
            return hits
        action={**self._action(topic_id),'count':1,'image_mode':'collaborative',
                'collaboration':collaboration}
        with patch.object(model_settings,'resolve',side_effect=resolve), \
             patch.object(sourcing,'build_sources',return_value=([Source()],[])), \
             patch.object(sourcing,'model_filter_hits',side_effect=filter_hits), \
             patch.object(sourcing,'visual_quality_check') as visual, \
             patch.object(sourcing,'_similar',return_value=False):
            candidates=image_actions.run(action,hint=lambda _message:None)
        self.assertEqual(len(candidates),1)
        visual.assert_not_called()
        row=next(item for item in image_review.list_topics() if item['topic']==topic_id)
        search_roles=row['image_progress']['model_roles']
        self.assertEqual(search_roles['text']['status'],'已完成')
        self.assertEqual(search_roles['text']['provider'],'DeepSeek')
        self.assertEqual(search_roles['text']['model'],'ds-text-fixture')
        self.assertNotIn('vision',search_roles)
        self.assertEqual(search_roles['layout']['status'],'未调用')
        self.assertEqual(search_roles['layout']['detail'],'待点击排版后执行')
        filename=candidates[0]['原始文件名']
        image_review.save_review(topic_id,{filename:'approved'})
        word_blocks=read_document(topic_packages.imported_word(folder)).blocks
        paragraph_index=next(index for index,block in enumerate(word_blocks) if block.kind=='p')
        with patch.object(model_settings,'resolve',side_effect=resolve), \
             patch.object(layout,'suggest_image_positions',return_value=({filename:paragraph_index},{})):
            image_review.reformat(topic_id,image_collaboration=collaboration)
        finished=topic_packages.formatted_folder_for(topic_id)
        self.assertEqual(finished.name,package['title'])
        output_row=next(item for item in image_review.list_topics()
                        if item['topic']=='成稿:'+topic_id)
        self.assertEqual(output_row['image_progress']['model_roles']['layout']['status'],'已完成')
        self.assertEqual(output_row['image_progress']['model_roles']['layout']['provider'],'豆包')
        self.assertEqual(output_row['image_progress']['model_roles']['layout']['model'],'doubao-layout-fixture')
        self.assertEqual(output_row['image_progress']['model_roles']['layout']['completed'],1)

    def test_relevance_failure_keeps_only_previously_checked_candidates(self):
        query='已确认人物名'
        hits=[Hit('模拟图源',query,f'{query} 候选 {index}','测试',
                  f'https://images.test/partial-{index}',
                  f'https://pages.test/partial-{index}',900,600)
              for index in range(31)]
        accepted=[]
        with patch.object(sourcing,'rejection_reason',return_value=''), \
             patch.object(sourcing,'_model_json',side_effect=[
                 {'keep':list(range(30))},ValueError('模拟第二批检查失败')]) as model:
            result=sourcing.model_filter_hits(
                SimpleNamespace(title='标题',blocks=[]),hits,[query],
                image_plan=[{'query':query}],hint=lambda _:None,
                accepted_callback=accepted.extend)
        self.assertEqual(model.call_count,2)
        self.assertEqual(len(accepted),30)
        self.assertEqual(result,accepted,'Only explicitly checked candidates may be retained')
        self.assertTrue(all(hit.semantic_approved for hit in accepted))

    def test_research_can_target_a_position_that_already_has_any_decision(self):
        topic_id, folder, package = self._commit_package('00000889')
        plan = package['image_plan'][0]
        candidate = 'already-present.jpg'
        (folder / candidate).write_bytes(_jpeg_bytes('green'))
        (folder / sourcing.MANIFEST_FILE).write_text(json.dumps({'配图': [{
            '原始文件名': candidate, '计划位置': plan['position_id'],
            '计划顺序': plan['order'], '搜索词': plan['query'],
        }]}, ensure_ascii=False), encoding='utf-8')
        image_review.save_candidate_review(topic_id, [candidate])
        image_review.save_review(topic_id, {candidate: 'rejected'})
        action = {**self._action(topic_id), 'position_id': plan['position_id'], 'count': 8}
        validated = image_actions.validate(action)
        _document, analysis, selected = image_actions._package_analysis(folder, validated)
        self.assertEqual([row['position_id'] for row in selected], [plan['position_id']])
        self.assertEqual([row.text for row in analysis.queries], [plan['query']])
        self.assertEqual(validated['count'], 8)

    def test_review_decisions_auto_sync_only_approved_files_and_preserve_user_files(self):
        topic_id, folder, package = self._commit_package('00000890')
        topic_packages.mark_imported(topic_id)
        names = ['candidate-a.jpg', 'candidate-b.jpg', 'candidate-c.jpg']
        manifest_rows = []
        for index, (name, plan) in enumerate(zip(names, package['image_plan'])):
            (folder / name).write_bytes(_jpeg_bytes((index * 70, 40, 180 - index * 45)))
            manifest_rows.append({'原始文件名': name, '计划位置': plan['position_id'],
                                  '计划顺序': plan['order'], '搜索词': plan['query'],
                                  '图片链接': f'https://images.test/{name}'})
        (folder / sourcing.MANIFEST_FILE).write_text(
            json.dumps({'配图': manifest_rows}, ensure_ascii=False), encoding='utf-8')
        image_review.save_candidate_review(topic_id, names)

        first = image_review.save_review(topic_id, {names[1]: 'approved'})
        exported = Path(first['export_sync']['folder_path'])
        self.assertEqual(exported.name, image_review._clean_topic_title(package['title']))
        self.assertEqual(image_review.load_review(folder)['states'], {
            names[0]: 'pending', names[1]: 'approved', names[2]: 'pending'})
        (exported / '用户自己的说明.txt').write_text('请保留', encoding='utf-8')

        removed = image_review.save_review(topic_id, {names[1]: 'rejected'})
        marker = json.loads((exported / '配图文件夹信息.json').read_text(encoding='utf-8'))
        self.assertEqual(marker['images'], [])
        self.assertFalse((exported / names[1]).exists())
        self.assertTrue((folder / names[1]).is_file(), '去掉图片仍保留在原候选目录')
        self.assertTrue((exported / '用户自己的说明.txt').is_file())
        self.assertEqual(removed['export_sync']['folder_path'], str(exported))

        restored = image_review.save_review(topic_id, {names[1]: 'approved'})
        self.assertEqual(restored['export_sync']['folder_path'], str(exported))
        self.assertTrue((exported / names[1]).is_file())
        self.assertEqual(image_review.load_review(folder)['states'][names[0]], 'pending')
        self.assertEqual(image_review.load_review(folder)['states'][names[2]], 'pending')

    def test_export_sync_failure_keeps_decision_and_can_be_retried(self):
        topic_id, folder, package = self._commit_package('00000891')
        topic_packages.mark_imported(topic_id)
        name = 'candidate.jpg'
        (folder / name).write_bytes(_jpeg_bytes('teal'))
        (folder / sourcing.MANIFEST_FILE).write_text(json.dumps({'配图': [{
            '原始文件名': name, '计划位置': package['image_plan'][0]['position_id'],
            '计划顺序': 0, '搜索词': package['image_plan'][0]['query'],
        }]}, ensure_ascii=False), encoding='utf-8')
        image_review.save_candidate_review(topic_id, [name])
        with patch.object(image_review, '_export_topic_package_images_unlocked',
                          side_effect=OSError('模拟目标文件被占用')):
            result = image_review.save_review(topic_id, {name: 'approved'})
        self.assertTrue(result['export_sync']['ok'] is False)
        self.assertEqual(image_review.load_review(folder)['states'][name], 'approved')
        self.assertFalse(image_review.topic_export_status(folder)['ok'])

        retried = image_review.sync_topic_package_export(topic_id)
        self.assertTrue(retried['ok'])
        self.assertTrue((Path(retried['folder_path']) / name).is_file())

    def test_plan_relevance_check_uses_the_requested_scene_not_article_text(self):
        hit = Hit("豆瓣", "晚会 舞台幕后", "节目舞台后台工作人员",
                  "测试来源", "https://images.test/stage.jpg", "https://pages.test/stage",
                  900, 600)
        plan = [{"position_id": "cover", "purpose": "cover", "query": hit.query,
                 "scene": "直播舞台与灯光", "exclude": ["无关明星特写"]}]
        document = SimpleNamespace(title="选题标题", blocks=[Block("p", "这段文章全文不得参与判断")])
        captured = []

        def respond(messages):
            captured.extend(messages)
            return {"keep": [0], "cover": [0]}

        with patch.object(sourcing, "_model_json", side_effect=respond):
            result = sourcing.model_filter_hits(document, [hit], [], image_plan=plan)

        self.assertEqual(len(result), 1)
        payload = json.loads(captured[1]["content"])
        self.assertNotIn("article", payload)
        self.assertEqual(payload["candidates"][0]["image_plan"], {"query": hit.query})
        self.assertNotIn("scene", payload["candidates"][0]["image_plan"])
        self.assertNotIn("文章全文", captured[0]["content"])

    def test_single_prompt_selection_isolated_and_images_can_finish_without_word(self):
        topic_id, folder, package = self._commit_package("00000031")
        action = {**self._action(topic_id), "position_id": "body-1", "count": 1}
        validated = image_actions.validate(action)
        document, analysis, selected = image_actions._package_analysis(folder, validated)
        self.assertEqual([item["position_id"] for item in selected], ["body-1"])
        self.assertEqual([query.text for query in analysis.queries],
                         [package["image_plan"][1]["query"]])
        self.assertIsNone(topic_packages.imported_word(folder))

        image = folder / "network-candidate.jpg"
        image.write_bytes(_jpeg_bytes("teal"))
        image_review.save_review(topic_id, {image.name: "approved"}, image.name)
        image_review.save_selection(topic_id, [image.name], positions={})
        self.assertEqual(image_review.load_selection(folder), [image.name])
        self.assertIsNone(topic_packages.imported_word(folder))

    def test_validated_topic_package_search_limits_real_source_download_attempts(self):
        topic_id, folder, package = self._commit_package('00000039')
        plan = package['image_plan'][1]
        hit = Hit('豆瓣', plan['query'], '新能源车主服务区等待现场', '模拟来源',
                  'https://images.test/topic-retry.jpg', 'https://pages.test/topic-retry',
                  900, 600, semantic_approved=True)
        for attempts in (1, 2):
            with self.subTest(attempts=attempts):
                calls = []
                source = SimpleNamespace(name='豆瓣', close=Mock())

                def download(_url):
                    calls.append(_url)
                    if len(calls) == 1:
                        raise TimeoutError('fixture timeout')
                    return _jpeg_bytes('teal')

                source.download = download
                action = {**self._action(topic_id), 'position_id': 'body-1',
                          'count': 1, 'download_attempts': attempts}
                validated = image_actions.validate(action)
                with patch.object(sourcing, 'build_sources', return_value=([source], [])), \
                     patch.object(sourcing, 'collect_hits_with_pages',
                                  return_value=([hit], [])), \
                     patch.object(sourcing, 'model_filter_hits', return_value=[hit]), \
                     patch.object(sourcing, 'rejection_reason', return_value=''), \
                     patch.object(sourcing, '_similar', return_value=False):
                    stage = self.root / f'topic-stage-{attempts}'
                    stage.mkdir()
                    image_actions._network_round(
                        validated, topic_packages.synthetic_document(folder), folder,
                        stage, {}, lambda _message: None)
                self.assertEqual(len(calls), attempts)


    def test_failed_image_job_surfaces_position_failure_reason(self):
        summary = console._summary_for("配图", [
            "[无图] 位置 2「综艺 剪辑 时间线 工作台」：所选图源没有返回候选图片。",
            "[待处理] 本轮没有取得通过检查的网络图片。",
        ], 1)
        self.assertIn("本轮没有取得通过检查的网络图片", summary)
        self.assertIn("所选图源没有返回候选图片", summary)

    def test_single_prompt_no_search_results_reports_the_exact_position(self):
        topic_id, folder, package = self._commit_package("00000032")
        action = {**self._action(topic_id), "position_id": "body-1", "count": 1}
        validated = image_actions.validate(action)
        source = SimpleNamespace(name="豆瓣", close=Mock())
        messages = []
        with tempfile.TemporaryDirectory() as stage_name, \
             patch.object(model_settings, "resolve", return_value={"api_key": "fixture"}), \
             patch.object(sourcing, "build_sources", return_value=([source], [])), \
             patch.object(sourcing, "collect_hits_with_pages", return_value=([], [])):
            document = topic_packages.synthetic_document(folder)
            results = image_actions._network_round(validated, document, folder,
                                                    Path(stage_name), {}, messages.append)
        self.assertEqual(results, [])
        diagnostic = next(message for message in messages if message.startswith("[无图]"))
        self.assertIn(package["image_plan"][1]["query"], diagnostic)
        self.assertIn("没有返回候选图片", diagnostic)

    def test_plan_pixel_check_uses_only_the_position_prompt(self):
        hit = Hit("豆瓣", "晚会 舞台幕后", "舞台灯光与工作人员",
                  "测试来源", "https://images.test/stage.jpg", "https://pages.test/stage",
                  900, 600)
        document = SimpleNamespace(title="选题标题", blocks=[Block("p", "文章正文不得进入图片检查")])
        captured = []

        def respond(messages, **_kwargs):
            captured.extend(messages)
            return '{"ok":true,"reason":"符合位置提示"}'

        with patch.object(sourcing.ai, "chat", side_effect=respond):
            check = sourcing.visual_quality_check(document, {"wire_api": "chat_completions"},
                                                   prompt_driven=True)
            self.assertEqual(check(_jpeg_bytes("purple"), hit,
                                   "封面；需要画面：直播舞台；排除：无关明星"), "")

        prompt = captured[0]["content"][0]["text"]
        self.assertIn("直播舞台", prompt)
        self.assertIn("不读取 Word 或文章正文", prompt)
        self.assertNotIn("文章正文不得进入图片检查", prompt)

    def test_visual_api_404_is_classified_and_not_misreported_as_image_capability_guess(self):
        hit=Hit('今日头条','孙颖莎','孙颖莎比赛图片','模拟图源',
                'https://images.test/vision-404.jpg','https://pages.test/vision-404',900,600)
        profile={'name':'豆包（火山方舟）','模型':'doubao-seed-1-6-vision-250815',
                 'wire_api':'chat','api_key':'vision-secret'}
        error=ai.AiError(
            '接口返回 HTTP 404（InvalidEndpointOrModel.NotFound）：型号或接入点不存在，或当前账户无访问权限。',
            category='model_or_endpoint_unavailable',http_status=404,
            error_code='InvalidEndpointOrModel.NotFound',provider=profile['name'],model=profile['模型'])
        with patch.object(sourcing.ai,'chat',side_effect=error):
            check=sourcing.visual_quality_check(SimpleNamespace(title='孙颖莎话题',blocks=[]),profile,
                prompt_driven=True)
            with self.assertRaises(ai.AiError) as caught:
                check(_jpeg_bytes('purple'),hit,'候选配图；关键词：孙颖莎')
        self.assertEqual(caught.exception.category,'model_or_endpoint_unavailable')
        self.assertEqual(caught.exception.http_status,404)
        self.assertEqual(caught.exception.error_code,'InvalidEndpointOrModel.NotFound')
        self.assertIn('豆包（火山方舟）',str(caught.exception))
        self.assertIn('doubao-seed-1-6-vision-250815',str(caught.exception))
        self.assertNotIn('请选择支持图片输入',str(caught.exception))

    def test_376_candidates_are_checked_without_a_visual_model(self):
        topic_id,folder,package=self._commit_package('00000035')
        plan=package['image_plan']
        hits=[Hit('今日头条',plan[index%len(plan)]['query'],
            f"{plan[index%len(plan)]['query']} 候选 {index}",'模拟搜索',
            f'https://images.test/sun-{index}.jpg',f'https://pages.test/sun-{index}',
            900,600,semantic_approved=True) for index in range(376)]
        roles={'text':{'provider':'deepseek','model':'text-fixture'},
               'vision':{'provider':'doubao','model':'retired-vision-fixture'},
               'layout':{'provider':'gpt','model':'layout-fixture'}}
        action={**self._action(topic_id),'count':20,'image_mode':'collaborative',
                'collaboration':{'mode':'collaborative','roles':roles}}
        source=SimpleNamespace(name='今日头条',close=Mock())
        def collect(_sources,queries,**_kwargs):
            return [hit for hit in hits if hit.query==queries[0].text],[]
        def filter_candidates(_document,rows,_anchors,**kwargs):
            self.assertEqual(len(rows),80)
            selected=rows[3:70]
            kwargs['progress']({'stage':'本地规则预筛','checked':0,'check_total':77,
                                'input_total':80,'prefiltered':3,'accepted':0})
            kwargs['accepted_callback'](selected)
            kwargs['progress']({'stage':'相关性筛选','checked':77,'check_total':77,
                                'input_total':80,'prefiltered':3,'accepted':67})
            return selected
        def resolve(provider,model):
            return {'api_key':'fixture','name':{'deepseek':'DeepSeek','doubao':'豆包','gpt':'GPT'}[provider],
                    '模型':model,'wire_api':'chat'}
        with patch.object(model_settings,'resolve',side_effect=resolve), \
             patch.object(sourcing,'build_sources',return_value=([source],[])), \
             patch.object(sourcing,'collect_hits_with_pages',side_effect=collect), \
             patch.object(sourcing,'model_filter_hits',side_effect=filter_candidates), \
             patch.object(sourcing,'visual_quality_check') as visual, \
             patch.object(sourcing,'_Downloader',return_value=lambda _hit:_jpeg_bytes('purple')), \
             patch.object(sourcing,'rejection_reason',return_value=''), \
             patch.object(sourcing,'_similar',return_value=False):
            messages=[]
            result=image_actions.run(action,hint=messages.append)
        self.assertEqual(len(result),20)
        visual.assert_not_called()
        history=json.loads((folder/image_actions.TOPIC_SEARCH_HISTORY_FILE).read_text(encoding='utf-8'))
        record=history['rounds'][-1]
        self.assertEqual(record['status'],'completed')
        self.assertEqual(record['found'],376)
        self.assertEqual(record['text_input_count'],80)
        self.assertEqual(record['text_model_checked'],77)
        self.assertEqual(record['text_model_accepted'],67)
        self.assertEqual(record['download_attempted'],20)
        self.assertNotIn('vision_attempted',record)
        progress=json.loads((folder/'配图搜图进度.json').read_text(encoding='utf-8'))
        self.assertEqual(progress['stage'],'候选已保存（待人工审核）')
        self.assertNotIn('vision',progress['model_roles'])
        self.assertEqual(len(image_review.load_review(folder)['states']),20)
    def test_information_material_filter_and_vision_do_not_accept_a_person_photo_as_a_statement(self):
        plan={"position_id":"statement","query":"郭宇欣 声明","keyword_type":"scene",
              "subject_query":"郭宇欣","scene_term":"声明"}
        document=SimpleNamespace(title="郭宇欣相关信息",blocks=[Block("p","正文不参与新版搜图审核")])
        hit=Hit("今日头条","郭宇欣 声明","郭宇欣近照","模拟来源",
                "https://images.test/portrait.jpg","https://pages.test/portrait",900,600)
        with patch.object(sourcing,"_model_json",return_value={"keep":[]}) as text_model:
            selected=sourcing.model_filter_hits(document,[hit],["郭宇欣"],
                queries=[sourcing.Query(plan["query"])],image_plan=[plan],hint=lambda _message:None)
        self.assertEqual(selected,[])
        text_payload=json.loads(text_model.call_args.args[0][1]["content"])
        self.assertEqual(text_payload["candidates"][0]["image_plan"]["scene_term"],"声明")
        self.assertIn("人物照片不能满足信息材料方向",text_model.call_args.args[0][0]["content"])

        captured=[]
        with patch.object(sourcing.ai,"chat",side_effect=lambda messages,**_kwargs:(captured.extend(messages) or
                 '{"ok":false,"reason":"仅是人物照片","label":"人物肖像"}')):
            quality=sourcing.visual_quality_check(document,{"wire_api":"chat_completions"},
                prompt_driven=True,image_plan=[plan])
            reason=quality(_jpeg_bytes("purple"),hit,"候选配图；关键词：郭宇欣 声明")
        self.assertEqual(reason,"仅是人物照片")
        vision_prompt=captured[0]["content"][0]["text"]
        self.assertIn("普通人物肖像",vision_prompt)
        self.assertIn("声明",vision_prompt)
        self.assertIn("配图计划",vision_prompt)

    def test_statement_position_uses_text_relevance_without_visual_review(self):
        topic_id="TP-20260925-00000071"
        title="郭宇欣相关公开信息"
        answer=_model_answer(title)
        answer["image_plan"]=[
            {"position_id":"core","order":0,"query":"郭宇欣","keyword_type":"core"},
            {"position_id":"statement","order":1,"query":"郭宇欣 声明","keyword_type":"scene",
             "subject_query":"郭宇欣","scene_term":"声明"},
        ]
        package=topic_packages.build(topic_id=topic_id,title=title,original_topic="郭宇欣被起诉",
            generated=answer,source="模拟线索",keyword_source="郭宇欣被起诉")
        folder=topic_packages.commit(package)
        topics.confirm_topic_keywords(topic_id,[
            {"query":"郭宇欣","keyword_type":"core","enabled":True},
            {"query":"郭宇欣 声明","keyword_type":"scene","enabled":True},
        ])
        topic_packages.mark_imported(topic_id)
        action=image_actions.validate({"topic":topic_id,"mode":"search","provider":"doubao",
            "position_id":"statement","count":1,"sources":["今日头条"]})
        portrait=Hit("今日头条","郭宇欣 声明","郭宇欣个人照片","模拟来源",
            "https://images.test/statement-portrait.jpg","https://pages.test/statement",900,600,
            semantic_approved=True)
        class Source:
            name="今日头条"
            def download(self,_url):return _jpeg_bytes("purple")
            def close(self):pass
        quality=Mock(return_value="")
        quality.accept=Mock()
        with patch.object(model_settings,"resolve",return_value={"api_key":"fixture","name":"模拟","模型":"fixture"}), \
             patch.object(sourcing,"build_sources",return_value=([Source()],[])), \
             patch.object(sourcing,"collect_hits_with_pages",return_value=([portrait],[])), \
             patch.object(sourcing,"model_filter_hits",return_value=[]), \
             patch.object(sourcing,"visual_quality_check",return_value=quality) as visual:
            result=image_actions.run(action,hint=lambda _message:None)
        self.assertEqual(result,[])
        visual.assert_not_called()
        self.assertFalse(any(path.suffix.lower() in {".jpg",".jpeg",".png"} for path in folder.iterdir()))

    def test_legacy_visual_role_does_not_block_manual_image_review(self):
        topic_id,folder,package=self._commit_package("00000009")
        hits=[Hit("豆瓣",item["query"],item["scene"],"测试来源",
            f"https://images.test/check-{index}.jpg",f"https://pages.test/check-{index}",
            900,600,semantic_approved=True) for index,item in enumerate(package["image_plan"])]
        source=SimpleNamespace(name="豆瓣",close=Mock())
        action={**self._action(topic_id),"count":3,"image_mode":"collaborative",
            "collaboration":{"mode":"collaborative","roles":{
                "text":{"provider":"deepseek","model":"text-fixture"},
                "vision":{"provider":"gpt","model":"retired-vision-fixture"},
                "layout":{"provider":"gpt","model":"layout-fixture"}}}}
        def collect(_sources,queries,**_kwargs):
            return [hit for hit in hits if hit.query==queries[0].text],[]
        with patch.object(sourcing,"build_sources",return_value=([source],[])), \
             patch.object(sourcing,"collect_hits_with_pages",side_effect=collect), \
             patch.object(sourcing,"model_filter_hits",return_value=hits), \
             patch.object(sourcing,"visual_quality_check") as visual, \
             patch.object(sourcing,"_Downloader",return_value=lambda _hit:_jpeg_bytes("purple")), \
             patch.object(sourcing,"rejection_reason",return_value=""), \
             patch.object(sourcing,"_similar",return_value=False):
            results=image_actions.run(action,hint=lambda _message:None)
        self.assertEqual(len(results),3)
        visual.assert_not_called()
        history=json.loads((folder/image_actions.TOPIC_SEARCH_HISTORY_FILE).read_text(encoding="utf-8"))
        self.assertEqual(history["rounds"][-1]["status"],"completed")
        progress=json.loads((folder/"配图搜图进度.json").read_text(encoding="utf-8"))
        self.assertNotIn("vision",progress["model_roles"])
        self.assertEqual(len(image_review.load_review(folder)["states"]),3)

    def test_new_topic_plan_never_requires_a_cover_decision(self):
        topic_id, folder, package = self._commit_package("00000010")
        hits = [
            Hit("豆瓣", item["query"], item["scene"], "测试来源",
                f"https://images.test/cover-{index}.jpg", f"https://pages.test/cover-{index}",
                900, 600, semantic_approved=True, cover_approved=False)
            for index, item in enumerate(package["image_plan"])
        ]
        source = SimpleNamespace(name="豆瓣", close=Mock())
        quality = Mock(return_value="")
        quality.accept = Mock()
        with patch.object(sourcing, "build_sources", return_value=([source], [])), \
             patch.object(sourcing, "collect_hits_with_pages", return_value=(hits, [])), \
             patch.object(sourcing, "model_filter_hits", return_value=hits), \
             patch.object(sourcing, "visual_quality_check", return_value=quality), \
             patch.object(sourcing, "_Downloader", return_value=lambda _hit: _jpeg_bytes("orange")), \
             patch.object(sourcing, "rejection_reason", return_value=""), \
             patch.object(sourcing, "_similar", return_value=False):
            image_actions.run(self._action(topic_id), hint=lambda _message: None)
        positions = {item["计划位置"] for item in image_actions._metadata(folder)["配图"]}
        self.assertEqual(positions, {"cover", "body-1", "body-2"})

    def test_topic_ids_are_isolated_and_retry_preserves_manual_decisions(self):
        first_id, first_folder, _ = self._commit_package("00000011")
        second_id, second_folder, _ = self._commit_package("00000022")
        calls = {first_id: 0, second_id: 0}

        def fake_network(data, _document, folder, stage, _context, _hint):
            calls[data["topic"]] += 1
            package = topic_packages.load(folder)
            occupied = {item.get("计划位置") for item in image_actions._metadata(folder)["配图"]}
            missing = [item for item in package["image_plan"] if item["position_id"] not in occupied]
            if data["topic"] == first_id and calls[first_id] == 1:
                missing = missing[:2]  # 明确制造一次部分成功。
            else:
                missing = missing[:data["count"]]
            result = []
            for item in missing:
                name = f"{data['topic'][-8:]}-{item['position_id']}.jpg"
                (stage / name).write_bytes(_jpeg_bytes((40 * item["order"], 80, 160)))
                result.append({
                    "原始文件名": name,
                    "原始标题": item["scene"],
                    "平台": "模拟图源",
                    "来源": "测试",
                    "图片链接": f"https://images.test/{data['topic']}/{item['position_id']}",
                    "文章链接": "",
                    "搜索词": item["query"],
                    "计划位置": item["position_id"],
                    "计划顺序": item["order"],
                })
            return result

        with patch.object(image_actions, "_network", side_effect=fake_network):
            image_actions.run(self._action(first_id), hint=lambda _message: None)
            first_manifest = image_actions._metadata(first_folder)["配图"]
            approved = first_manifest[0]["原始文件名"]
            rejected = first_manifest[1]["原始文件名"]
            image_review.save_review(first_id, {approved: "approved", rejected: "rejected"},
                                     cover=approved)
            image_actions.run(self._action(first_id), hint=lambda _message: None)
            image_actions.run(self._action(second_id), hint=lambda _message: None)

        first_review = image_review.load_review(first_folder)
        self.assertEqual(first_review["states"][approved], "approved")
        self.assertEqual(first_review["states"][rejected], "rejected")
        self.assertEqual(first_review["cover"], "")
        self.assertEqual(len(first_review["states"]), 3)
        self.assertEqual(len(image_review.load_review(second_folder)["states"]), 3)
        first_names = {path.name for path in first_folder.glob("*.jpg")}
        second_names = {path.name for path in second_folder.glob("*.jpg")}
        self.assertTrue(first_names.isdisjoint(second_names))
        self.assertTrue(all(name.startswith(first_id[-8:]) for name in first_names))
        self.assertTrue(all(name.startswith(second_id[-8:]) for name in second_names))

    def test_same_title_exports_stay_isolated_ordered_and_out_of_legacy_list(self):
        packages = [self._commit_package("00000031", title="重名选题"),
                    self._commit_package("00000032", title="重名选题")]
        expected_topics = []
        for topic_id, folder, package in packages:
            topic_packages.mark_imported(topic_id)
            plan = package["image_plan"]
            names = [topic_id[-8:] + "-0.jpg", topic_id[-8:] + "-1.jpg"]
            manifest = {"配图": []}
            for index, item in enumerate(plan[:2]):
                (folder / names[index]).write_bytes(_jpeg_bytes((40 + index * 80, 90, 150)))
                manifest["配图"].append({
                    "原始文件名": names[index], "计划位置": item["position_id"],
                    "计划顺序": item["order"], "搜索词": item["query"],
                })
            (folder / sourcing.MANIFEST_FILE).write_text(
                json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            image_review.save_review(topic_id, {name: "approved" for name in names},
                                     cover=names[1])
            exported = image_review.save_selection(topic_id, list(reversed(names)))
            self.assertEqual([row["filename"] for row in json.loads(
                (exported / "配图文件夹信息.json").read_text(encoding="utf-8"))["images"]], names)
            expected_topics.append(topic_id)

        legacy = config.UNFORMATTED / "传统Word稿"
        legacy.mkdir()
        write_document(legacy / "传统Word稿.docx", [
            Block("title", "传统 Word 稿"), Block("p", "用于验证旧版文章列表只收 Word 稿。"),
        ])
        image_only = config.UNFORMATTED / "非文章图片目录"
        image_only.mkdir()
        (image_only / "孤立图片.jpg").write_bytes(_jpeg_bytes("gray"))

        rows = image_review.list_topics()
        listed = {row["topic"] for row in rows}
        self.assertTrue(set(expected_topics).issubset(listed))
        self.assertIn("传统Word稿", listed)
        self.assertNotIn("重名选题", listed)
        self.assertNotIn("重名选题（2）", listed)
        self.assertNotIn("非文章图片目录", listed)
        self.assertEqual([path.name for path in sourcing.discover_topics(
            hint=lambda _message: None)], ["传统Word稿"])

    def test_missing_candidate_file_reopens_only_that_plan_position(self):
        topic_id, folder, package = self._commit_package("00000023")
        topic_packages.mark_imported(topic_id)
        missing_name = "lost-cover.jpg"
        (folder / sourcing.MANIFEST_FILE).write_text(json.dumps({"配图": [{
            "原始文件名": missing_name,
            "计划位置": "cover",
            "计划顺序": 0,
            "搜索词": package["image_plan"][0]["query"],
        }]}, ensure_ascii=False), encoding="utf-8")
        validated = image_actions.validate(self._action(topic_id))
        self.assertEqual(validated["count"], image_actions.TOPIC_CANDIDATE_TARGET)
        row = next(item for item in image_review.list_topics() if item["topic"] == topic_id)
        self.assertEqual(row["unfilled_plan_count"], 3)

    def test_stable_id_with_missing_package_never_falls_back_to_legacy_analysis(self):
        topic_id = "TP-20260923-00000024"
        folder = config.UNFORMATTED / topic_id
        folder.mkdir()
        write_document(folder / "稿件.docx", [Block("title", "损坏包"), Block("p", "正文")],
                       title="损坏包")
        self.assertTrue(topic_packages.is_package(folder))
        self.assertNotIn(folder, sourcing.discover_topics(hint=lambda _message: None))
        with patch.object(sourcing, "analyze", side_effect=AssertionError("不得退回全文分析")) as analyze:
            with self.assertRaisesRegex(ValueError, "内容包文件缺失.*不会退回全文分析"):
                image_actions.validate(self._action(topic_id))
        analyze.assert_not_called()
        with self.assertRaisesRegex(ValueError, "内容包文件缺失.*不会退回全文分析"):
            image_review.reformat(topic_id)

    def test_no_image_result_is_explicit_and_keeps_package_unchanged(self):
        topic_id, folder, _ = self._commit_package("00000033")
        topic_packages.mark_imported(topic_id)
        before = {path.name: path.read_bytes() for path in folder.iterdir()
                  if path.name != '配图搜图进度.json'}
        with patch.object(image_actions, "_network", return_value=[]), \
             patch.object(sourcing, "generate_ai_image") as generate:
            messages = []
            result = image_actions.run(self._action(topic_id), hint=messages.append)
        generate.assert_not_called()
        self.assertEqual(result, [])
        self.assertTrue(any('[配图结果] 本轮没有新增合格图片' in line for line in messages))
        self.assertEqual({path.name: path.read_bytes() for path in folder.iterdir()
                          if path.name != '配图搜图进度.json'}, before)

    def test_explicit_word_import_formats_locally_without_ai(self):
        topic_id, folder, package = self._commit_package("00000044")
        source = self.root / "用户写好的文章.docx"
        write_document(source, [
            Block("title", package["title"]),
            Block("h2", "长队现场"),
            Block("p", "第一段正文，说明现场情况。"),
            Block("p", "第二段正文，补充等待细节。"),
            Block("h2", "供需错位"),
            Block("p", "第三段正文，比较车流和充电桩。"),
            Block("p", "第四段正文，说明高峰差异。"),
            Block("h2", "解决办法"),
            Block("p", "第五段正文，梳理可行措施。"),
        ], title=package["title"])
        raw_word = source.read_bytes()
        handler = object.__new__(console.Handler)
        topic_packages.mark_imported(topic_id)
        handler.path = (f"/api/topic-word?topic={quote(topic_id)}"
                        f"&name={quote(source.name)}")
        handler.headers = {"Content-Length": str(len(raw_word))}
        handler.rfile = io.BytesIO(raw_word)
        responses = []
        handler._json = lambda payload, status=200: responses.append((status, payload))
        handler._handle_post()
        self.assertEqual(responses[0][0], 200)
        imported = responses[0][1]
        self.assertEqual(imported["topic_id"], topic_id)
        self.assertEqual(topic_packages.imported_word(folder).name, source.name)
        with patch.object(image_review, "_read_source_document",
                          side_effect=AssertionError("配图流程不读取 Word 正文")):
            self.assertEqual(image_review.source_document(folder).path.name,
                             topic_packages.PACKAGE_FILE)
            imported_row = next(row for row in image_review.list_topics()
                                if row["topic"] == topic_id)
            self.assertEqual(imported_row["paragraphs"], [])

        names = []
        manifest = {"配图": []}
        for index, item in enumerate(package["image_plan"]):
            name = f"candidate-{index}.jpg"
            (folder / name).write_bytes(_jpeg_bytes((index * 50, 100, 180)))
            names.append(name)
            manifest["配图"].append({
                "原始文件名": name,
                "原始标题": item["scene"],
                "计划位置": item["position_id"],
                "计划顺序": item["order"],
                "插入到小标题": "" if index == 0 else package["outline"][index - 1]["heading"],
            })
        (folder / sourcing.MANIFEST_FILE).write_text(
            json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        image_review.save_review(topic_id, {name: "approved" for name in names}, cover=names[1])

        with patch.object(ai, "chat", side_effect=AssertionError("本地排版不得调用模型")) as chat, \
             patch.object(library, "refresh_ledger", return_value={"文章": {}}):
            image_review.reformat(topic_id)
        chat.assert_not_called()

        finished = topic_packages.formatted_folder_for(topic_id)
        self.assertEqual(finished.name, package['title'])
        output = next(path for path in finished.glob("*.docx") if path.name != "原文.docx")
        self.assertEqual(read_document(output).title, package["title"])
        self.assertTrue((finished / "原文.docx").is_file())
        ledger_row=next(item for item in library.scan_formatted()
                        if item['文件夹']==finished)
        self.assertEqual(ledger_row['主题'],topic_id,
                         'The title directory resolves back to the stable package ID downstream')
        final_manifest = json.loads((finished / sourcing.MANIFEST_FILE).read_text(encoding="utf-8"))
        self.assertEqual(final_manifest["配图"][0]["原始文件名"], names[0])
        self.assertEqual(len(final_manifest["配图"]), 3)
        archived_source = finished / "原始素材"
        self.assertEqual(topic_packages.load(archived_source)["topic_id"], topic_id)
        finished_row = next(row for row in image_review.list_topics()
                            if row["topic"] == "成稿:" + topic_id)
        self.assertTrue(finished_row["plan_ready"])
        self.assertTrue(finished_row["has_word"])
        daily = self.root / "选题首页"
        daily.mkdir()
        (daily / "当前选题.md").write_text(
            f"# 标题：{package['title']}\n\n> 选题编号：{topic_id}\n", encoding="utf-8")
        with patch.object(console, "DAILY_DIR", daily):
            topic_row = console.latest_topics()[0]
        self.assertEqual(topic_row["内容包状态"], "finalized")
        self.assertEqual(topic_row["提示词状态"], "写文提示词与配图清单已完成")

    def test_same_title_final_folders_keep_distinct_stable_package_ids(self):
        first_id,_,first=self._commit_package('00000891',title='两个选题同标题')
        second_id,_,second=self._commit_package('00000892',title='两个选题同标题')
        first_dir=image_review._formatted_topic_destination(first_id,first['title'])
        second_dir=image_review._formatted_topic_destination(second_id,second['title'])
        self.assertNotEqual(first_dir,second_dir)
        self.assertTrue(second_dir.name.startswith('两个选题同标题（'))
        self.assertEqual(topic_packages.formatted_folder_for(first_id),first_dir.resolve())
        self.assertEqual(topic_packages.formatted_folder_for(second_id),second_dir.resolve())

    def test_publish_gate_still_blocks_pending_or_dirty_review(self):
        finished = config.FORMATTED / "待发布测试"
        source = finished / "原始素材"
        source.mkdir(parents=True)
        manuscript = finished / "待发布测试.docx"
        manuscript.write_bytes(b"fixture")
        (source / "cover.jpg").write_bytes(_jpeg_bytes("navy"))

        review_file = source / image_review.REVIEW_FILE
        review_file.write_text(json.dumps({
            "states": {"cover.jpg": "pending"},
            "cover": "",
            "revision": 1,
            "needs_layout": True,
        }), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "尚未全部审阅"):
            image_review.assert_ready_for_dispatch(manuscript)

        review_file.write_text(json.dumps({
            "states": {"cover.jpg": "approved"},
            "cover": "cover.jpg",
            "revision": 2,
            "needs_layout": True,
        }), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "重新生成成稿"):
            image_review.assert_ready_for_dispatch(manuscript)

        review_file.write_text(json.dumps({
            "states": {"cover.jpg": "approved"},
            "cover": "cover.jpg",
            "revision": 2,
            "needs_layout": False,
        }), encoding="utf-8")
        image_review.assert_ready_for_dispatch(manuscript)


if __name__ == "__main__":
    unittest.main()
