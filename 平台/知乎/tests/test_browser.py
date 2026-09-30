"""Browser boundaries, including an optional real Edge offline editor fixture.

Run the browser cases with ZHIHU_BROWSER_TESTS=1. All requests are fulfilled
locally by Playwright; these tests cannot log in, reach Zhihu, or publish. The
fixture tests browser paste-event/state behavior, not Zhihu's actual Draft.js
version. A real-site smoke test is still needed when Zhihu changes its editor.
"""

import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from zhihu_drafts.browser import (
    BODY_SELECTOR,
    BrowserError,
    DraftVerificationError,
    ZhihuBrowser,
    _validate_cdp_url,
    canonical_draft_url,
    normalize_text,
)


DRAFT_URL = "https://zhuanlan.zhihu.com/p/123456789/edit"

# Content must flow through an event handler into independent persistent state.
# Reading a new page reconstructs the editor from that state, so merely changing
# the editable DOM cannot pass the saved-content tests.
EDITOR_FIXTURE = """<!doctype html><meta charset="utf-8">
<textarea placeholder="请输入标题（最多 100 个字）"></textarea>
<div contenteditable="true" role="textbox" class="public-DraftEditor-content"></div>
<div>草稿保存中</div>
<script>
const title = document.querySelector('textarea');
const editor = document.querySelector('[contenteditable]');
const saved = JSON.parse(localStorage.getItem('saved') || 'null');
const recover = localStorage.getItem('recover') === 'yes';
let state = location.pathname.endsWith('/edit') || recover
    ? (saved || {title: '', html: ''}) : {title: '', html: ''};
title.value = state.title;
editor.innerHTML = state.html;
function persist() {
    localStorage.setItem('writes', String(Number(localStorage.getItem('writes') || 0) + 1));
    localStorage.setItem('saved', JSON.stringify(state));
    if (!location.pathname.endsWith('/edit')) history.replaceState({}, '', '/p/123456789/edit');
}
title.addEventListener('input', () => { state.title = title.value; persist(); });
editor.addEventListener('paste', event => {
    event.preventDefault();
    state.html = event.clipboardData.getData('text/html');
    editor.innerHTML = state.html;
    localStorage.setItem('pastes', String(Number(localStorage.getItem('pastes') || 0) + 1));
    persist();
});
</script>"""


class BrowserAddressTests(unittest.TestCase):
    def test_only_canonical_zhihu_edit_urls_are_accepted(self):
        self.assertEqual(canonical_draft_url(DRAFT_URL + "?source=drafts"), DRAFT_URL)
        for value in (
            "https://example.com/p/123/edit",
            "https://zhuanlan.zhihu.com/p/123",
            "https://test@example.invalid/p/123/edit",
            "http://zhuanlan.zhihu.com/p/123/edit",
        ):
            with self.subTest(value=value), self.assertRaises(BrowserError):
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


@unittest.skipUnless(os.environ.get("ZHIHU_BROWSER_TESTS") == "1", "Set ZHIHU_BROWSER_TESTS=1 for offline Edge integration tests")
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
        self.browser = ZhihuBrowser(Path(self.temp.name))
        self.browser._context = self.context
        self.browser._page = self.context.new_page()
        self.browser._page.goto("https://zhuanlan.zhihu.com/write")
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

    def test_paste_updates_persistent_state_and_a_new_page_reads_complete_content(self):
        callback_states = []
        result = self.browser.save_draft(self.article, on_created=lambda url: callback_states.append((url, self.state())))
        self.assertEqual(result, DRAFT_URL)
        state = self.state()
        self.assertEqual(state["pastes"], 1)
        self.assertEqual(state["saved"]["html"], self.article.html)
        self.assertEqual(callback_states[0][0], DRAFT_URL)
        self.assertEqual(len(callback_states), 1)
        self.assertIn(DRAFT_URL, self.requests, "Must perform an independent navigation to the saved URL")
        # The fixture intentionally never shows '刚刚 · 草稿'; readback proves success.

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
        with self.assertRaisesRegex(BrowserError, "并非空白"):
            self.browser.save_draft(self.article)
        self.assertEqual(self.state(), before)

    def test_failed_url_persistence_stops_before_pasting_body(self):
        def reject_url(url):
            raise OSError("test local disk failure")

        with self.assertRaisesRegex(BrowserError, "写入本地记录失败"):
            self.browser.save_draft(self.article, on_created=reject_url)
        self.assertEqual(self.browser.last_draft_url, DRAFT_URL)
        self.assertEqual(self.state()["pastes"], 0)


if __name__ == "__main__":
    unittest.main()
