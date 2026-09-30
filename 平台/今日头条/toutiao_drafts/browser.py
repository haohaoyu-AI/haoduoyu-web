"""今日头条发文页的浏览器适配层：只点「存草稿」，从不点发布。

和知乎、百家号两个助手同一套约定：

* 用本项目自己的 Edge 配置目录（data/edge-profile）启动可见窗口，登录由人工完成；
* 拿到草稿地址后必须独立回读验证，验证通过才允许归档源文件；
* 任何情况下都不点击「发布」「定时发布」「预览并发布」。
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import replace
from .draft_titles import draft_article
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from .urls import (BrowserError, DRAFT_BOX_URL, DraftVerificationError, EDITOR_URL,
                   canonical_draft_url)

TITLE_SELECTORS = (
    'textarea[placeholder*="标题"]',
    'textarea[placeholder*="请输入文章标题"]',
    '.publish-title textarea',
    'input[placeholder*="标题"]',
    'div[contenteditable="true"][data-placeholder*="标题"]',
)
BODY_SELECTORS = (
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder*="正文"]',
    'div[contenteditable="true"][placeholder*="正文"]',
    'div[contenteditable="true"]',
)
# 只有这两个 cookie 代表真的登录了；匿名访问也会种下 uid_tt / passport_csrf_token 之类的
# cookie，一开始就是拿它们判断，结果把没登录误判成已登录，反复把页面拉回发文页。
SESSION_COOKIES = ("sessionid", "sid_tt")
SAVE_LABELS = ("存草稿", "保存草稿", "存入草稿箱")
FORBIDDEN_LABELS = ("发布", "定时发布", "预览并发布", "立即发布", "提交")

# 头条号发文页的工具栏工具（class 名带 syl-toolbar-tool-<工具名>）。
TOOL_DOC_IMPORT = "div.syl-toolbar-tool.doc-import button"
TOOL_IMAGE = "div.syl-toolbar-tool.image button"

# 草稿箱候选地址，probe 会逐个访问并记录哪个是真的。
DRAFT_BOX_CANDIDATES = (
    "https://mp.toutiao.com/profile_v4/manage/draft",
    "https://mp.toutiao.com/profile_v4/graphic/articles?tab=draft",
)


def _validate_cdp_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost"):
        raise BrowserError("--cdp 只接受本机地址，例如 http://127.0.0.1:9222")
    return value.rstrip("/")


class ToutiaoBrowser:
    """Own an isolated Edge session, or borrow an explicitly supplied local CDP."""

    def __init__(self, root: Path, cdp_url: str | None = None, login_timeout: int = 180):
        self.root = Path(root).resolve()
        self.cdp_url = _validate_cdp_url(cdp_url) if cdp_url else None
        self.login_timeout = max(1, int(login_timeout))
        self.save_timeout = 90.0
        self.lookup_timeout = 25.0
        self.last_draft_url: str | None = None
        self._playwright = None
        self._context = None
        self._page = None
        self._browser = None
        self._logged_in = False
        self._callback_error: Exception | None = None

    # ------------------------------------------------------------------ session

    def __enter__(self) -> "ToutiaoBrowser":
        if self._playwright is not None:
            raise BrowserError("浏览器会话已经打开。")
        try:
            from playwright.sync_api import sync_playwright

            self._playwright = sync_playwright().start()
            if self.cdp_url:
                self._browser = self._playwright.chromium.connect_over_cdp(self.cdp_url, timeout=20_000)
                if not self._browser.contexts:
                    raise BrowserError("本机 CDP 浏览器没有可使用的浏览器上下文。")
                self._context = self._browser.contexts[0]
            else:
                profile = self.root / "data" / "edge-profile"
                profile.mkdir(parents=True, exist_ok=True)
                self._context = self._playwright.chromium.launch_persistent_context(
                    str(profile), channel="msedge", headless=False,
                    # 窗口要够宽：右侧「头条创作助手」面板会盖住工具栏右边的「导入文档」按钮。
                    viewport={"width": 1600, "height": 1000},
                    args=["--disable-blink-features=AutomationControlled", "--start-minimized"],
                )
            self._context.set_default_timeout(15_000)
            self._page = self._context.new_page()
            self._window_state('minimized')
            return self
        except Exception as exc:
            self.__exit__(None, None, None)
            if isinstance(exc, BrowserError):
                raise
            raise BrowserError(
                "无法启动今日头条浏览器。请确认已安装 Microsoft Edge 和项目依赖，"
                "且没有另一个程序占用 data/edge-profile。详细原因：" + str(exc)
            ) from exc

    def __exit__(self, exc_type, exc, traceback) -> None:
        try:
            if self.cdp_url:
                if self._page is not None and not self._page.is_closed():
                    self._page.close()
            elif self._context is not None:
                self._context.close()
        except Exception:
            pass
        finally:
            if self._playwright is not None:
                try:
                    self._playwright.stop()
                except Exception:
                    pass
            self._page = None
            self._context = None
            self._browser = None
            self._playwright = None
            self._logged_in = False

    def _require_page(self):
        if self._page is None or self._context is None:
            raise BrowserError("请先通过 with ToutiaoBrowser(...) 打开浏览器会话。")
        if self._page.is_closed():
            raise BrowserError("今日头条操作标签页已被关闭。")
        return self._page

    # ------------------------------------------------------------ element lookup

    @staticmethod
    def _first_visible(scope, selectors):
        for selector in selectors:
            try:
                locator = scope.locator(selector)
                count = min(locator.count(), 8)
            except Exception:
                continue
            for index in range(count):
                item = locator.nth(index)
                try:
                    if item.is_visible():
                        return item, selector
                except Exception:
                    continue
        return None

    def _find_title(self, page, timeout: float = 30.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            found = self._first_visible(page, TITLE_SELECTORS)
            if found:
                return found[0]
            page.wait_for_timeout(400)
        raise BrowserError("没有找到头条号的标题输入框，页面结构可能已经变化。")

    def _find_body(self, page, timeout: float = 45.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            found = self._first_visible(page, BODY_SELECTORS)
            if found:
                return found[0]
            page.wait_for_timeout(400)
        raise BrowserError("没有找到头条号的正文编辑区，页面结构可能已经变化。")

    def _has_session(self) -> bool:
        if self._context is None:
            return False
        try:
            names = {cookie.get("name") for cookie in self._context.cookies()}
        except Exception:
            return False
        return any(name in names for name in SESSION_COOKIES)

    def cookie_names(self) -> list[str]:
        """只列 cookie 名字，便于诊断登录状态；不读也不打印值。"""
        if self._context is None:
            return []
        try:
            return sorted({str(cookie.get("name", "")) for cookie in self._context.cookies()})
        except Exception:
            return []

    def _login_wall_visible(self, page) -> bool:
        """登录页/扫码页是否还在。在的期间一律不刷新、不跳转。"""
        try:
            return page.locator(
                'text=/扫码登录|请登录|登录后|立即登录|手机号登录/' 
            ).first.is_visible()
        except Exception:
            return False

    def _editor_ready(self, page) -> bool:
        return self._first_visible(page, TITLE_SELECTORS) is not None

    def _window_state(self, state):
        """Only adjust the dedicated browser; leave user-attached CDP sessions alone."""
        if self.cdp_url:
            return
        session = None
        try:
            session = self._context.new_cdp_session(self._page)
            window = session.send('Browser.getWindowForTarget')
            session.send('Browser.setWindowBounds', {'windowId': window['windowId'], 'bounds': {'windowState': state}})
            if state == 'normal':
                self._page.bring_to_front()
                self._page.evaluate("document.title = '今日头条｜需要登录或验证'")
        except Exception:
            print('[提示] 今日头条窗口状态调整失败，请查看浏览器窗口。', flush=True)
        finally:
            if session is not None:
                try:
                    session.detach()
                except Exception:
                    pass

    def ensure_login(self) -> None:
        """Wait for the user to log in in the dedicated, visible Edge window.

        登录期间绝不主动刷新或跳转——页面只在两个时刻被导航：最开始的这一次，
        以及确认已经拿到登录态、且页面已经不在登录墙上时的一次性归位。
        """
        page = self._require_page()
        if self._logged_in:
            return
        try:
            page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=60_000)
            began = time.monotonic()
            returned_at = 0.0
            if not self._editor_ready(page):
                self._window_state('normal')
                print(
                    f"请在已打开的 Edge 窗口里登录今日头条号（扫码即可）；等待最多 {self.login_timeout} 秒。"
                    "登录期间这个程序不会刷新页面、不会跳转，你可以慢慢来；"
                    "登录状态保存在本项目的专用浏览器配置里，之后不用重复登录。",
                    flush=True,
                )
            deadline = time.monotonic() + self.login_timeout
            while time.monotonic() < deadline:
                if self._editor_ready(page):
                    self._logged_in = True
                    self._window_state('minimized')
                    return
                # 只有「确认真的登录了」且「登录墙已经消失」时，才允许回一次发文页。
                parsed = urlsplit(page.url)
                if (
                    parsed.hostname == "mp.toutiao.com"
                    and not page.url.startswith(EDITOR_URL)
                    and self._has_session()
                    and not self._login_wall_visible(page)
                    and time.monotonic() - began > 45
                    and (returned_at == 0.0 or time.monotonic() - returned_at > 60)
                ):
                    returned_at = time.monotonic()
                    page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=45_000)
                page.wait_for_timeout(1000)
            raise BrowserError("等待今日头条登录超时，或发文页结构已经变化；本次没有填写文章。")
        except Exception as exc:
            shot = self._capture_failure(page)
            if isinstance(exc, BrowserError):
                raise BrowserError(str(exc) + shot) from exc
            raise BrowserError("无法进入今日头条发文页：" + str(exc) + shot) from exc

    # ---------------------------------------------------------------- failures

    def _capture_failure(self, page) -> str:
        try:
            logs = self.root / "logs"
            logs.mkdir(parents=True, exist_ok=True)
            path = logs / f"draft-failure-{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:6]}.png"
            page.screenshot(path=str(path), full_page=True, timeout=15_000)
            return f"\n失败现场截图：{path}"
        except Exception:
            return "\n无法截取失败现场。"

    # ------------------------------------------------------------------- probe

    def dump_editor(self) -> Path:
        """Write the live editor structure to logs/ for diagnosis after a redesign."""
        page = self._require_page()
        page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=60_000)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline and not self._editor_ready(page):
            page.wait_for_timeout(500)
        page.wait_for_timeout(4_000)
        script = """() => {
            const visible = el => !!(el.offsetParent || el.getClientRects().length);
            const info = el => ({
                tag: el.tagName,
                id: el.id || '',
                class: String(el.className || '').slice(0, 160),
                type: el.getAttribute('type') || '',
                placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '',
                maxlength: el.getAttribute('maxlength') || '',
                editable: el.getAttribute('contenteditable') || '',
                role: el.getAttribute('role') || '',
                name: el.getAttribute('name') || '',
                text: (el.innerText || el.value || '').trim().slice(0, 80),
                visible: visible(el),
            });
            const attrInfo = el => ({
                tag: el.tagName,
                class: String(el.className || '').slice(0, 90),
                title: el.getAttribute('title') || '',
                aria: el.getAttribute('aria-label') || '',
                data: Array.from(el.attributes)
                    .filter(a => a.name.indexOf('data-') === 0)
                    .map(a => a.name + '=' + a.value).join(' ').slice(0, 140),
                text: (el.innerText || '').trim().slice(0, 40),
                html: (el.innerHTML || '').replace(/\\s+/g, ' ').slice(0, 220),
            });
            const all = Array.from(document.querySelectorAll('*'));
            const byKeyword = re => all
                .filter(el => re.test((el.className || '') + ' ' + (el.id || '') + ' '
                    + (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('data-placeholder') || '')))
                .map(info).slice(0, 40);
            return {
                url: location.href,
                title_text: document.title,
                body_class: document.body ? String(document.body.className).slice(0, 200) : '',
                body_text: (document.body ? document.body.innerText : '').slice(0, 2500),
                iframes: Array.from(document.querySelectorAll('iframe')).map(el => info(el)).slice(0, 20),
                editables: all.filter(el => el.isContentEditable).map(info).slice(0, 25),
                inputs: all.filter(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA').map(info).slice(0, 40),
                file_inputs: Array.from(document.querySelectorAll('input[type=file]')).map(info),
                buttons: all.filter(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'
                        || el.tagName === 'A').filter(visible).map(info).slice(0, 90),
                toolbar: all.filter(el => /toolbar/.test(String(el.className || ''))).map(attrInfo).slice(0, 45),
                save_hits: all.filter(el => /草稿|自动保存|已保存|保存中/.test(el.innerText || '')
                        && el.children.length === 0).map(info).slice(0, 30),
                links: Array.from(document.querySelectorAll('a[href]'))
                    .map(el => ({href: el.getAttribute('href'), text: (el.innerText || '').trim().slice(0, 30)}))
                    .filter(item => /draft|article|content|graphic|home/.test(item.href || '')).slice(0, 30),
                draft_like: byKeyword(/草稿|保存/),
                publish_like: byKeyword(/发布|定时|预览/),
                title_like: byKeyword(/标题|title/),
                body_like: byKeyword(/正文|content|editor|ProseMirror/),
                import_like: byKeyword(/导入|上传|insert|upload/i),
            };
        }"""
        tree = []
        for frame in list(page.frames):
            try:
                tree.append({"url": frame.url, "name": frame.name, **frame.evaluate(script)})
            except Exception as exc:
                tree.append({"url": frame.url, "name": frame.name, "error": str(exc)[:200]})
        report = {
            "probed_at": datetime.now().isoformat(timespec="seconds"),
            "url": page.url,
            "logged_in": self._has_session(),
            "cookie_names": self.cookie_names(),
            "frames": tree,
        }
        logs = self.root / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        report["doc_import"] = self._probe_doc_import(page, logs)
        report["draft_list"] = self._probe_draft_list(page, logs)
        path = logs / "editor-probe.json"
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    @staticmethod
    def _dialog_snapshot(page) -> dict:
        """记录当前弹出的对话框结构（标题、按钮、上传控件、可见文字）。"""
        script = """() => {
            const visible = el => !!(el.offsetParent || el.getClientRects().length);
            const boxes = Array.from(document.querySelectorAll(
                '[class*=modal],[class*=dialog],[class*=Drawer],[role=dialog]')).filter(visible);
            return boxes.slice(0, 6).map(box => ({
                class: String(box.className || '').slice(0, 120),
                text: (box.innerText || '').slice(0, 600),
                buttons: Array.from(box.querySelectorAll('button,[role=button],a')).filter(visible)
                    .map(el => ((el.innerText || '').trim() || el.getAttribute('aria-label') || '').slice(0, 30))
                    .filter(Boolean).slice(0, 20),
                file_inputs: Array.from(box.querySelectorAll('input[type=file]'))
                    .map(el => ({accept: el.getAttribute('accept') || '', multiple: el.hasAttribute('multiple')})),
            }));
        }"""
        try:
            return {"dialogs": page.evaluate(script),
                    "file_inputs": page.evaluate(
                        "() => Array.from(document.querySelectorAll('input[type=file]'))"
                        ".map(el => ({accept: el.getAttribute('accept') || '', multiple: el.hasAttribute('multiple')}))")}
        except Exception as exc:
            return {"error": str(exc)[:200]}

    def _probe_doc_import(self, page, logs: Path) -> dict:
        """点开工具栏的「导入文档」，记录它要什么，然后原样关掉。"""
        result: dict = {"opened": False}
        try:
            button = page.locator(TOOL_DOC_IMPORT).first
            if not button.count():
                result["error"] = "没有找到 doc-import 工具按钮。"
                return result
            page.evaluate("() => window.scrollTo(0, 0)")
            try:
                with page.expect_file_chooser(timeout=4000) as chooser_info:
                    button.click()
                chooser = chooser_info.value
                result["opened"] = True
                result["mode"] = "直接打开文件选择器"
                result["multiple"] = chooser.is_multiple()
                try:
                    chooser.set_files([])
                except Exception:
                    pass
            except Exception:
                result["mode"] = "打开对话框"
            page.wait_for_timeout(2500)
            result.update(self._dialog_snapshot(page))
            shot = logs / "probe-doc-import.png"
            page.screenshot(path=str(shot))
            result["screenshot"] = str(shot)
            # 原样关掉对话框：Escape 不会写入任何内容。
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            page.wait_for_timeout(800)
        except Exception as exc:
            result["error"] = str(exc)[:300]
        return result

    def _probe_draft_list(self, page, logs: Path) -> list[dict]:
        """逐个访问候选草稿箱地址，记录哪个是草稿列表。"""
        results: list[dict] = []
        for index, url in enumerate(DRAFT_BOX_CANDIDATES, start=1):
            entry: dict = {"url": url}
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                page.wait_for_timeout(3500)
                entry["final_url"] = page.url
                entry["title"] = page.title()
                entry["links"] = page.evaluate(
                    "() => Array.from(document.querySelectorAll('a[href]'))"
                    ".map(el => ({href: el.getAttribute('href'), text: (el.innerText || '').trim().slice(0, 40)}))"
                    ".filter(x => /publish|draft|graphic/.test(x.href || '')).slice(0, 25)")
                entry["text"] = page.evaluate(
                    "() => (document.body ? document.body.innerText : '').slice(0, 4000)")
                shot = logs / f"probe-draft-list-{index}.png"
                page.screenshot(path=str(shot))
                entry["screenshot"] = str(shot)
            except Exception as exc:
                entry["error"] = str(exc)[:200]
            results.append(entry)
        return results

    # ---------------------------------------------------------------- draft save

    def save_draft(self, article, resume_url: str | None = None, on_created=None,
                   reset_editor: bool = False) -> str:
        """导入一篇成稿，等它自动存成草稿，再独立回读确认；从不点发布。"""
        article = draft_article(article)
        page = self._require_page()
        source = Path(article.source)
        if not source.exists():
            raise BrowserError(f"找不到源文件：{source}")
        self.ensure_login()
        page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=60_000)
        title_input = self._find_title(page)
        body = self._find_body(page)

        state = self._editor_state(page)
        if (state.get("title") or "").strip() or len(state.get("body") or "") > 30:
            already = (re.sub(r"\s+", "", state.get("title") or "")
                       == re.sub(r"\s+", "", article.title or ""))
            if already:
                print("编辑器里已经是这篇稿子，直接等它保存。", flush=True)
            elif not reset_editor:
                raise BrowserError(
                    "编辑器里已经有内容（可能是头条自动恢复的上次草稿）。"
                    "确认那些内容不要了，就在命令后加 --清空编辑器 再运行一次；"
                    "清空只作用于编辑器里的临时内容，不会删除已保存的草稿。")
            else:
                print("先清空编辑器里的临时内容，再导入。", flush=True)
                self._clear_editor(page, title_input, body)

        print(f"正在导入文档：{source.name}", flush=True)
        self._import_document(page, source)
        state = self._wait_for_import(page, article)
        expected = re.sub(r"\s+", "", article.title or "")
        actual = re.sub(r"\s+", "", state.get("title") or "")
        if actual != expected:
            if re.fullmatch(r"\d{2,20}", actual):
                # 纯数字标题是作者在平台端留下的人工占位，保留它，方便后续手工修改。
                article = replace(article, title=state.get("title", "").strip())
                expected = actual
            else:
                # 头条导入器偶尔把文件名或旧草稿带进标题框，才用本地标题覆盖。
                title_input.fill(article.title)
                state = self._wait_for_import(page, article, timeout=25)
        if re.sub(r"\s+", "", state.get("title") or "") != expected:
            raise BrowserError("导入后标题为空或与本地标题不一致。"
                               + self._capture_failure(page))
        evidence = self._verify_import(state, article)
        print(f"导入完成，{evidence}", flush=True)

        tip = self._wait_for_autosave(page)
        print(f"自动保存提示：{tip or '（没有读到提示文本）'}", flush=True)
        draft_page, row = self._draft_in_box(self._context, article.title)
        try:
            if not row:
                raise DraftVerificationError(
                    "草稿箱里没找到这篇的标题，不能确认已经存成草稿；已保留待发原文，"
                    "请到头条号草稿箱人工确认后再重跑。" + self._capture_failure(page))
            print(f"草稿箱回读：{row}", flush=True)
            url = canonical_draft_url(EDITOR_URL)
            if on_created is not None:
                on_created(url)
            self.last_draft_url = url
            return url
        finally:
            try:
                draft_page.close()
            except Exception:
                pass

    # ------------------------------------------------------------ editor helpers

    def _editor_state(self, page) -> dict:
        return page.evaluate("""() => {
            const t = document.querySelector('textarea[placeholder*="标题"]');
            const b = document.querySelector('div.ProseMirror');
            const tip = document.querySelector('.footer-tip-save');
            const draft = document.querySelector('.draft-tip-span');
            return {
                title: t ? t.value : '',
                body: b ? (b.innerText || '') : '',
                images: b ? b.querySelectorAll('img').length : 0,
                image_srcs: b ? Array.from(new Set(Array.from(b.querySelectorAll('img'))
                    .map(img => img.getAttribute('src') || ''))).filter(Boolean).length : 0,
                save_tip: tip ? tip.innerText : '',
                draft_tip: draft ? draft.innerText : '',
            };
        }""")

    def _clear_editor(self, page, title_input, body) -> None:
        """只清编辑器里的临时内容，不碰已经保存的草稿。"""
        try:
            title_input.fill("")
        except Exception:
            pass
        try:
            body.click()
            page.keyboard.press("Control+A")
            page.keyboard.press("Delete")
        except Exception:
            pass
        page.wait_for_timeout(600)

    def _import_document(self, page, path: Path) -> None:
        """工具栏「导入文档」→ 对话框里交文件。"""
        button = page.locator(TOOL_DOC_IMPORT).first
        button.click(timeout=20_000)
        modal = page.locator("div.byte-modal.doc-import-modal").first
        modal.wait_for(state="visible", timeout=20_000)
        file_input = modal.locator("input[type=file]").first
        if file_input.count():
            file_input.set_input_files(str(path))
            return
        with page.expect_file_chooser(timeout=20_000) as chooser_info:
            modal.get_by_text("选择文档", exact=False).first.click()
        chooser_info.value.set_files(str(path))

    @staticmethod
    def _samples(text: str, size: int = 30) -> list[str]:
        """按段落取特征串，判断导入是否完整。

        不能跨段落取样：头条会在段与段之间插入图片占位，
        把上一段结尾和下一段开头连起来比对必然对不上（以前就是这么误报的）。
        """
        paras = [re.sub(r"\s+", "", line) for line in (text or "").splitlines()]
        paras = [para for para in paras if len(para) >= 12]
        if not paras:
            return []
        picks = []
        for ratio in (0.2, 0.45, 0.7, 0.92):
            index = min(int(len(paras) * ratio), len(paras) - 1)
            picks.append(paras[index][:size])
        return picks

    def _wait_for_import(self, page, article, *, timeout: float = 210.0) -> dict:
        """等导入落定：标题有值、正文有字、图片数不再变化。"""
        deadline = time.monotonic() + timeout
        last: dict = {}
        stable = 0
        while time.monotonic() < deadline:
            page.wait_for_timeout(2000)
            state = self._editor_state(page)
            if not (state.get('title') or '').strip():
                self._find_title(page).fill(article.title)
                print(f'[标题] 已自动填写：{article.title}', flush=True)
                state = self._editor_state(page)
            same = bool(last) and (state["title"] == last.get("title")
                                   and len(state["body"]) == len(last.get("body", ""))
                                   and state["images"] == last.get("images"))
            stable = stable + 1 if same else 0
            last = state
            if state["title"] and len(state["body"]) >= 120 and stable >= 2:
                return state
        return last

    def _verify_import(self, state: dict, article) -> str:
        """核对标题、正文采样、配图数量；对不上就停下，绝不点发布。"""
        expected_title = re.sub(r"\s+", "", article.title or "")
        actual_title = re.sub(r"\s+", "", state.get("title") or "")
        if actual_title != expected_title:
            raise DraftVerificationError(
                f"标题对不上：头条里是「{state.get('title')}」，本地是「{article.title}」。已保留待发原文。")
        expected_images = len(article.images)
        actual_images = int(state.get("image_srcs") or state.get("images") or 0)
        if expected_images and actual_images < expected_images:
            raise DraftVerificationError(
                f"配图数量对不上：本地 {expected_images} 张，头条编辑器里 {actual_images} 张。已保留待发原文。")
        body = re.sub(r"\s+", "", state.get("body") or "")
        missing = [sample for sample in self._samples(article.text) if sample and sample not in body]
        if missing:
            raise DraftVerificationError(
                f"正文对不上：编辑器里缺了本地正文的 {len(missing)} 处内容（例如「{missing[0][:16]}…」）。"
                "已保留待发原文。")
        return f"标题、正文采样与配图（{actual_images} 张）一致"

    def _wait_for_autosave(self, page, *, timeout: float = 90.0) -> str:
        """头条草稿是自动保存的，等底部提示变成已保存。"""
        deadline = time.monotonic() + timeout
        tip = ""
        while time.monotonic() < deadline:
            tip = self._editor_state(page).get("save_tip") or ""
            if "已保存" in tip or "保存成功" in tip or "保存于" in tip:
                return tip
            page.wait_for_timeout(2000)
        return tip

    def _draft_in_box(self, context, title: str, *, timeout: float = 90.0):
        """独立开一个页面回读草稿箱，确认这篇真的在里面。"""
        page = context.new_page()
        try:
            page.goto(DRAFT_BOX_URL, wait_until="domcontentloaded", timeout=45_000)
            page.wait_for_timeout(4000)
            # 这个地址默认落在「作品管理」的全部列表，先切到「草稿箱」标签。
            try:
                page.locator("text=/^草稿箱/").first.click(timeout=10_000)
                page.wait_for_timeout(4000)
            except Exception:
                pass
            wanted = re.sub(r"\s+", "", title)
            deadline = time.monotonic() + timeout
            last_error = ""
            while time.monotonic() < deadline:
                try:
                    found = page.evaluate("""(wanted) => {
                        const text = (document.body ? document.body.innerText : '').replace(/\\s+/g, '');
                        if (!text.includes(wanted)) return null;
                        const rows = Array.from(document.querySelectorAll('div,li,tr'));
                        const row = rows.reverse().find(el => (el.innerText || '').replace(/\\s+/g, '')
                            .startsWith(wanted) && el.querySelector('a,button'));
                        return {found: true, row: row ? (row.innerText || '').slice(0, 120) : ''};
                    }""", wanted)
                except Exception as exc:
                    last_error = str(exc)[:200]
                    found = None
                if found:
                    return page, str(found.get("row") or "")
                page.wait_for_timeout(3000)
            if last_error:
                raise DraftVerificationError("草稿箱回读失败：" + last_error)
            return page, ""
        except Exception:
            try:
                page.close()
            except Exception:
                pass
            raise
