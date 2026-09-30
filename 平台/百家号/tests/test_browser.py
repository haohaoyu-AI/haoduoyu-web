"""Browser boundaries, including an optional real Edge offline editor fixture.

Run the browser cases with BAIJIAHAO_BROWSER_TESTS=1. All requests are fulfilled
locally by Playwright; these tests cannot log in, reach Baijiahao, or publish.
The fixture models the editor's DOM contract (visible title field, paste-driven
rich text, 存草稿 button, article_id in the address), not Baidu's real bundles.
A real-site smoke test is still needed when Baijiahao changes its editor.
"""

import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from baijiahao_drafts.browser import (
    BaijiahaoBrowser,
    BrowserError,
    DraftVerificationError,
    _validate_cdp_url,
    canonical_draft_url,
    normalize_text,
)
from baijiahao_drafts.urls import UrlError


DRAFT_URL = "https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=1234567890"

# Content must flow through an event handler into independent persistent state.
# Reading a new page reconstructs the editor from that state, so merely changing
# the editable DOM cannot pass the saved-content tests.
EDITOR_FIXTURE = """<!doctype html><meta charset="utf-8">
<div class="input-box" data-testid="news-title-input">
  <div class="ph">请输入标题（2 - 64字）</div>
  <div contenteditable="true" class="fe-title"></div>
</div>
<div class="cheetah-editor"><div contenteditable="true" class="fe-body"></div></div>
<button>存草稿</button>
<script>
const title = document.querySelector('[data-testid="news-title-input"] [contenteditable]');
const editor = document.querySelector('.cheetah-editor [contenteditable]');
const button = document.querySelector('button');
const saved = JSON.parse(localStorage.getItem('saved') || 'null');
const recover = localStorage.getItem('recover') === 'yes';
let state = (location.search.includes('article_id=') || recover)
    ? (saved || {title: '', html: ''}) : {title: '', html: ''};
title.innerText = state.title;
editor.innerHTML = state.html;
function persist() {
    localStorage.setItem('writes', String(Number(localStorage.getItem('writes') || 0) + 1));
    localStorage.setItem('saved', JSON.stringify(state));
}
title.addEventListener('input', () => { state.title = title.innerText; });
editor.addEventListener('paste', event => {
    event.preventDefault();
    state.html = event.clipboardData.getData('text/html');
    editor.innerHTML = state.html;
    localStorage.setItem('pastes', String(Number(localStorage.getItem('pastes') || 0) + 1));
    persist();
});
button.addEventListener('click', () => {
    if (localStorage.getItem('blockSave') === 'yes') return;
    if (!title.innerText.trim() || !editor.innerText.trim()) return;
    history.replaceState({}, '', '/builder/rc/edit?type=news&article_id=1234567890');
    persist();
});
</script>"""

# 只有标题框、没有正文区：正文定位必须失败，而不是把标题当成正文。
TITLE_ONLY_FIXTURE = """<!doctype html><meta charset="utf-8">
<div class="input-box" data-testid="news-title-input">
  <div class="ph">请输入标题（2 - 64字）</div>
  <div contenteditable="true" class="fe-title"></div>
</div>"""


class BrowserAddressTests(unittest.TestCase):
    def test_only_canonical_baijiahao_edit_urls_are_accepted(self):
        self.assertEqual(
            canonical_draft_url("https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=1234567890"),
            DRAFT_URL,
        )
        for value in (
            "https://example.com/builder/rc/edit?article_id=1234567890",
            "https://baijiahao.baidu.com/builder/rc/draft",
            "https://baijiahao.baidu.com/builder/rc/edit?type=news",
            "https://baijiahao.baidu.com/builder/rc/edit?article_id=abc",
            "https://test@example.invalid/builder/rc/edit?article_id=1234567890",
            "http://baijiahao.baidu.com/builder/rc/edit?article_id=1234567890",
        ):
            with self.subTest(value=value), self.assertRaises(UrlError):
                canonical_draft_url(value)

    def test_cdp_cannot_expose_a_remote_browser_connection(self):
        for value in ("http://127.0.0.1:9222", "http://[::1]:9222", "http://localhost:9222"):
            self.assertEqual(_validate_cdp_url(value), value)
        for value in ("http://192.168.1.2:9222", "http://localhost", "http://user@localhost:9222"):
            with self.subTest(value=value), self.assertRaises(BrowserError):
                _validate_cdp_url(value)

    def test_normalization_keeps_meaningful_content_differences(self):
        self.assertEqual(normalize_text("甲 \n\u200b乙\ufeff"), "甲乙")
        self.assertNotEqual(normalize_text("正文甲"), normalize_text("正文乙"))

    def test_document_import_accepts_accessible_labels_and_reversed_wording(self):
        class Locator:
            def __init__(self, visible=False, click=None):
                self.visible = visible
                self.action = click or (lambda: None)

            def count(self):
                return 1 if self.visible else 0

            def nth(self, _index):
                return self

            def is_visible(self):
                return self.visible

            def click(self, timeout=None):
                self.action()

        class Keyboard:
            def press(self, _key):
                pass

        class Page:
            frames = []

            def __init__(self):
                self.menu_open = False
                self.import_clicked = False
                self.keyboard = Keyboard()

            def get_by_role(self, role, name):
                if role == "button" and name.search("插入"):
                    return Locator(True, lambda: setattr(self, "menu_open", True))
                if role == "menuitem" and name.search("文档导入"):
                    return Locator(self.menu_open, lambda: setattr(self, "import_clicked", True))
                return Locator()

            def get_by_text(self, _name):
                return Locator()

            def locator(self, _selector):
                return Locator()

            def wait_for_timeout(self, _milliseconds):
                pass

        page = Page()
        browser = object.__new__(BaijiahaoBrowser)
        with patch.object(BaijiahaoBrowser, "_clear_overlays"):
            browser._open_import_entry(page)
        self.assertTrue(page.import_clicked)

    def test_leftover_cover_dialog_is_closed_before_save(self):
        browser = object.__new__(BaijiahaoBrowser)
        page = MagicMock()
        modal = MagicMock()
        no_button = MagicMock()
        no_button.count.return_value = 0
        close = MagicMock()
        close.is_visible.return_value = True
        close_nodes = MagicMock()
        close_nodes.count.return_value = 1
        close_nodes.nth.return_value = close
        modal.get_by_role.return_value = no_button
        modal.locator.return_value = close_nodes

        with patch.object(browser, "_cover_dialogs", side_effect=[[modal], []]):
            browser._dismiss_cover_dialog(page)

        close.click.assert_called_once()


@unittest.skipUnless(os.environ.get("BAIJIAHAO_BROWSER_TESTS") == "1", "Set BAIJIAHAO_BROWSER_TESTS=1 for offline Edge integration tests")
class OfflineEdgeEditorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright

        cls.playwright = sync_playwright().start()
        try:
            cls.edge = cls.playwright.chromium.launch(channel="msedge", headless=True)
        except Exception:
            cls.playwright.stop()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.edge.close()
        cls.playwright.stop()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.context = self.edge.new_context(service_workers="block")
        self.requests = []

        def offline_route(route):
            self.requests.append(route.request.url)
            if route.request.is_navigation_request():
                route.fulfill(status=200, content_type="text/html; charset=utf-8", body=EDITOR_FIXTURE)
            else:
                route.abort()

        self.context.route("**/*", offline_route)
        self.browser = BaijiahaoBrowser(Path(self.temp.name))
        self.browser.save_timeout = 5
        self.browser.lookup_timeout = 2
        self.browser._context = self.context
        self.browser._page = self.context.new_page()
        self.browser._page.goto("https://baijiahao.baidu.com/builder/rc/edit?type=news")
        self.browser._logged_in = True
        self.article = SimpleNamespace(
            source=Path(self.temp.name) / "source.txt",
            title="离线文章标题",
            html="<h2>第一节</h2><p>正文<strong>甲乙</strong>。</p>",
            text="第一节\n\n正文甲乙。",
            fingerprint="fixture",
            warnings=[],
        )

    def tearDown(self):
        self.context.close()
        self.temp.cleanup()

    def state(self):
        return self.browser._page.evaluate("""() => ({
            saved: JSON.parse(localStorage.getItem('saved') || 'null'),
            writes: Number(localStorage.getItem('writes') || 0),
            pastes: Number(localStorage.getItem('pastes') || 0)
        })""")

    def seed(self, html, *, recover=False):
        self.browser._page.evaluate(
            """value => {
                localStorage.setItem('saved', JSON.stringify(value.saved));
                localStorage.setItem('recover', value.recover ? 'yes' : 'no');
            }""",
            {"saved": {"title": self.article.title, "html": html}, "recover": recover},
        )

    def test_paste_and_save_click_produce_one_draft_a_new_page_reads_back(self):
        callback_states = []
        result = self.browser.save_draft(
            self.article, on_created=lambda url: callback_states.append((url, self.state()))
        )
        self.assertEqual(result, DRAFT_URL)
        state = self.state()
        self.assertEqual(state["pastes"], 1)
        self.assertEqual(state["saved"]["html"], self.article.html)
        self.assertEqual([url for url, _ in callback_states], [DRAFT_URL])
        self.assertIn(DRAFT_URL, self.requests, "Must perform an independent navigation to the saved URL")

    def test_resume_checks_existing_content_without_any_editor_write(self):
        self.seed(self.article.html)
        before = self.state()
        self.assertEqual(self.browser.save_draft(self.article, resume_url=DRAFT_URL), DRAFT_URL)
        self.assertEqual(self.state(), before)

    def test_same_length_different_remote_text_is_rejected_and_never_overwritten(self):
        self.seed(self.article.html.replace("甲乙", "丙丁"))
        before = self.state()
        with self.assertRaises(DraftVerificationError):
            self.browser.save_draft(self.article, resume_url=DRAFT_URL)
        self.assertEqual(self.state(), before)

    def test_recovered_nonempty_editor_is_not_overwritten(self):
        self.seed("<p>已有草稿</p>", recover=True)
        before = self.state()
        with self.assertRaisesRegex(BrowserError, "已经有内容"):
            self.browser.save_draft(self.article)
        self.assertEqual(self.state(), before)

    def test_unconfirmed_draft_address_stops_instead_of_creating_a_second_draft(self):
        # The fixture never reports an article_id, so no draft address can be confirmed.
        self.browser._page.evaluate("() => localStorage.setItem('blockSave', 'yes')")
        with self.assertRaisesRegex(DraftVerificationError, "没有取得草稿地址"):
            self.browser.save_draft(self.article)
        self.assertIsNone(self.browser.last_draft_url)
        self.assertNotIn("article_id=", self.browser._page.url)

    def test_failed_url_persistence_discloses_the_draft_to_check(self):
        def reject_url(url):
            raise OSError("test local disk failure")

        with self.assertRaisesRegex(BrowserError, "写入本地记录失败"):
            self.browser.save_draft(self.article, on_created=reject_url)
        self.assertEqual(self.browser.last_draft_url, DRAFT_URL)

    def test_the_title_box_is_never_mistaken_for_the_body(self):
        self.browser._page.set_content(TITLE_ONLY_FIXTURE)
        with self.assertRaisesRegex(BrowserError, "正文编辑区"):
            self.browser._find_body(self.browser._page, timeout=1)

    def test_title_limits_come_from_the_editor_itself(self):
        self.assertEqual(self.browser.title_limits(self.browser._find_title(self.browser._page)), (2, 64))


if __name__ == "__main__":
    unittest.main()
