"""发文时间表测试：首发规则、排期、登记发布、网页。"""

import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from article_hub import config, library  # noqa: E402
from article_hub.docxio import Block, write_document  # noqa: E402


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self._saved = (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
                       config.SETTINGS, config.PUBLISH_RULES, library.LEDGER)
        config.UNFORMATTED = self.root / "未排版文章"
        config.FORMATTED = self.root / "已排版文章"
        config.PREVIEW = self.root / "预览"
        config.DATA = self.root / "data"
        config.SETTINGS = config.DATA / "平台设置.json"
        config.PUBLISH_RULES = config.DATA / "发布规则.json"
        library.LEDGER = config.DATA / "库.json"
        config.ensure_directories()
        config.SETTINGS.write_text(json.dumps({
            "今日头条": {"root": str(self.root / "今日头条"), "pending": "待发文章",
                         "sent": "已发文章", "receipts": "data"},
        }, ensure_ascii=False), encoding="utf-8")
        self.now = datetime(2026, 9, 15, 14, 0)
        for name in ("第一篇", "第二篇"):
            topic = config.FORMATTED / name
            topic.mkdir(parents=True)
            write_document(topic / f"{name}.docx",
                           [Block("title", name), Block("p", "正文")], title=name)
            (topic / "配图清单.json").write_text(
                json.dumps({"标题": name, "封面": "", "配图": []}, ensure_ascii=False),
                encoding="utf-8")
        library.refresh_ledger()

    def tearDown(self):
        (config.UNFORMATTED, config.FORMATTED, config.PREVIEW, config.DATA,
         config.SETTINGS, config.PUBLISH_RULES, library.LEDGER) = self._saved
        self.temp.cleanup()

    def entries(self, now=None):
        return library.schedule_entries(now=now or self.now)

    def pick(self, topic, platform, now=None):
        return next(item for item in self.entries(now)
                    if item["主题"] == topic and item["平台"] == platform)

    def test_rules_file_defaults_to_toutiao_first(self):
        rules = config.load_publish_rules()
        self.assertTrue(config.PUBLISH_RULES.exists())
        self.assertEqual(rules["首发平台"], "今日头条")
        self.assertEqual(config.publish_delay_hours("知乎", rules), 24)
        self.assertEqual(config.publish_delay_hours("今日头条", rules), 0)

    def test_unscheduled_article_shows_up_as_unscheduled(self):
        rows = self.entries()
        self.assertEqual({item["状态"] for item in rows}, {"未排期"})
        self.assertTrue(all(item["首发"] for item in rows))

    def test_plan_puts_one_first_publish_each_day(self):
        result = library.plan_schedule(now=self.now)
        planned = {item["主题"]: item for item in result["排期"]}
        self.assertEqual(set(planned), {"第一篇", "第二篇"})
        # 当天还没到 20:00，就用今天这一场；往后一天一篇。
        self.assertEqual(planned["第一篇"]["首发"], datetime(2026, 9, 15, 20, 0))
        self.assertEqual(planned["第二篇"]["首发"], datetime(2026, 9, 16, 20, 0))
        later = dict(planned["第一篇"]["后续"])
        self.assertEqual(later["知乎"], datetime(2026, 9, 16, 20, 0))
        self.assertEqual(later["百家号"], datetime(2026, 9, 16, 20, 0))

    def test_other_platforms_wait_for_the_first_publish(self):
        library.plan_schedule(now=self.now)
        self.assertEqual(self.pick("第一篇", "知乎")["状态"], "等首发")
        self.assertEqual(self.pick("第一篇", "今日头条")["状态"], "等到点")

    def test_recording_toutiao_pushes_later_platforms_back(self):
        library.plan_schedule(now=self.now)
        result = library.record_publish("第一篇", "今日头条", "2026-09-18 21:30", now=self.now)
        later = dict(result["后续"])
        self.assertEqual(later["知乎"], datetime(2026, 9, 19, 21, 30))

        later_now = datetime(2026, 9, 20, 9, 0)
        self.assertEqual(self.pick("第一篇", "今日头条", later_now)["状态"], "已发")
        self.assertEqual(self.pick("第一篇", "知乎", later_now)["状态"], "该发了")

    def test_recording_a_later_platform_keeps_the_first_publish(self):
        library.plan_schedule(now=self.now)
        library.record_publish("第一篇", "知乎", "2026-09-17 20:10", now=self.now)
        head = self.pick("第一篇", "今日头条", datetime(2026, 9, 18, 9, 0))
        self.assertEqual(head["状态"], "该发了")
        self.assertEqual(self.pick("第一篇", "知乎", datetime(2026, 9, 18, 9, 0))["状态"], "已发")

    def test_one_article_can_be_scheduled_at_a_time(self):
        result = library.plan_schedule(only="第二篇", first_time="2026-10-01 07:30", now=self.now)
        self.assertEqual(result["排期"][0]["首发"], datetime(2026, 10, 1, 7, 30))
        self.assertEqual(self.pick("第二篇", "知乎")["计划"], datetime(2026, 10, 2, 7, 30))

    def test_schedule_start_date_can_be_chosen(self):
        result = library.plan_schedule(start_after="2026-10-05", now=self.now)
        planned = {item["主题"]: item["首发"] for item in result["排期"]}
        self.assertEqual(planned["第一篇"], datetime(2026, 10, 5, 20, 0))
        self.assertEqual(planned["第二篇"], datetime(2026, 10, 6, 20, 0))

    def test_planning_twice_does_not_move_existing_slots(self):
        library.plan_schedule(now=self.now)
        again = library.plan_schedule(now=self.now)
        self.assertEqual(again["排期"], [])

    def test_replan_clears_plans_but_keeps_published_records(self):
        library.plan_schedule(now=self.now)
        library.record_publish("第一篇", "今日头条", "2026-09-15 21:00", now=self.now)
        result = library.plan_schedule(start_after="2026-10-01", reset=True, now=self.now)
        planned = {item["主题"]: item for item in result["排期"]}
        self.assertEqual(set(planned), {"第二篇"})
        self.assertEqual(planned["第二篇"]["首发"], datetime(2026, 10, 1, 20, 0))
        self.assertEqual(self.pick("第一篇", "今日头条")["状态"], "已发")

    def test_unknown_topic_is_reported(self):
        with self.assertRaises(ValueError):
            library.plan_schedule(only="没有这篇", now=self.now)
        with self.assertRaises(ValueError):
            library.record_publish("没有这篇", "今日头条", now=self.now)
        with self.assertRaises(ValueError):
            library.record_publish("第一篇", "小红书", now=self.now)

    def test_parse_when_accepts_the_forms_people_actually_type(self):
        self.assertEqual(library.parse_when("20:00", now=self.now), datetime(2026, 9, 15, 20, 0))
        self.assertEqual(library.parse_when("2026-09-16 07:05", now=self.now),
                         datetime(2026, 9, 16, 7, 5))
        self.assertEqual(library.parse_when("2026/09/16 07:05", now=self.now),
                         datetime(2026, 9, 16, 7, 5))
        self.assertEqual(library.parse_when("09-16", default_time="08:00", now=self.now),
                         datetime(2026, 9, 16, 8, 0))
        self.assertEqual(library.parse_when("", now=self.now), self.now)
        with self.assertRaises(ValueError):
            library.parse_when("明天下午", now=self.now)

    def test_schedule_page_lists_every_entry(self):
        library.plan_schedule(now=self.now)
        path = library.write_schedule_page(now=self.now)
        page = path.read_text(encoding="utf-8")
        self.assertTrue(path.exists())
        self.assertIn("发文时间表", page)
        self.assertIn("第一篇", page)
        self.assertIn("今日头条（首发）", page)
        self.assertIn("等首发", page)

    def test_todo_lists_what_is_due(self):
        library.plan_schedule(only="第一篇", first_time="2026-09-14 20:00", now=self.now)
        due, unscheduled = library.schedule_todo(self.entries())
        self.assertEqual(due, ["今日头条《第一篇》"])
        self.assertEqual(unscheduled, ["第二篇"])


if __name__ == "__main__":
    unittest.main()
