"""Save articles through Baijiahao's visible editor, and verify the saved draft.

Only the editor's own "存草稿" (save draft) action is used. This module never
clicks 发布 / 定时发布 / 预览并发布, and never reads or copies cookies from the
user's everyday Edge profile.
"""

from __future__ import annotations

import ipaddress
import json
import re
import time
from dataclasses import replace
from .draft_titles import draft_article
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Protocol
from urllib.parse import quote, urlsplit
from uuid import uuid4

from .urls import (
    DRAFT_BOX_URL,
    EDITOR_URL,
    BrowserError,
    DraftVerificationError,
    build_draft_url,
    canonical_draft_url,
)

if TYPE_CHECKING:
    from playwright.sync_api import BrowserContext, Frame, Locator, Page, Playwright


_EDIT_PATH = "/builder/rc/edit"
_INVISIBLE = re.compile(r"[\s\u200b\u200c\u200d\u2060\ufeff]+")
# 编辑器给每张图加的“图片描述”占位文字，不是正文内容。
_EDITOR_NOISE = re.compile(r"编辑搜图请点击输入图片描述（最多\d+字）|请点击输入图片描述|点击输入图片描述")

# 2026-09 实测的百家号发文页结构：标题是 data-testid="news-title-input" 里的
# contenteditable，正文是懒加载 iframe 里的 <body class="news-editor-pc">。
# 改版时按下面的候选顺序回退，第一个可见元素即被采用。
TITLE_SELECTORS = (
    '[data-testid="news-title-input"] [contenteditable="true"]',
    '.client_pages_edit_components_titleInput [contenteditable="true"]',
    '#bjhNewsTitle [contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder*="标题"]',
    'input[placeholder*="请输入标题"]',
    'textarea[placeholder*="请输入标题"]',
)
BODY_SELECTORS = (
    'body.news-editor-pc',
    'body[contenteditable="true"].view',
    '.cheetah-editor [contenteditable="true"]',
    '.edui-body-container[contenteditable="true"]',
    'div[contenteditable="true"]',
)
SAVE_LABELS = ("存草稿", "保存草稿", "存入草稿箱")
IMPORT_TAB_LABELS = ("插入",)
IMPORT_ITEM_LABELS = ("导入文档",)
_INSERT_PATTERN = re.compile(r"^\s*插入\s*$")
_IMPORT_PATTERN = re.compile(r"(?:导入\s*文档|文档\s*导入)")
TITLE_DEFAULT_LIMITS = (2, 64)
PLACEHOLDERS = {
    "请输入标题", "请输入文章标题", "请输入正文", "请输入文章正文",
    "在此输入正文", "输入正文", "写点什么吧", "正文",
}


class ArticleLike(Protocol):
    source: Path
    title: str
    html: str
    text: str
    fingerprint: str
    warnings: list[str]


def normalize_text(value: str) -> str:
    """Ignore layout whitespace and editor zero-width characters, nothing else."""
    return _INVISIBLE.sub("", value)


def _meaningful(value: str) -> str:
    """Editor placeholder text is not user content."""
    return "" if value.strip() in PLACEHOLDERS else value


def _validate_cdp_url(value: str) -> str:
    parsed = urlsplit(value)
    try:
        local = parsed.hostname == "localhost" or ipaddress.ip_address(parsed.hostname or "").is_loopback
    except ValueError:
        local = False
    try:
        port = parsed.port
    except ValueError as exc:
        raise BrowserError("CDP 地址的端口无效。") from exc
    if (
        parsed.scheme not in ("http", "https", "ws", "wss")
        or not local
        or not port
        or parsed.username
        or parsed.password
    ):
        raise BrowserError("CDP 只允许连接本机地址及明确端口，例如 http://127.0.0.1:9222。")
    return value


class BaijiahaoBrowser:
    """Own an isolated Edge session, or borrow an explicitly supplied local CDP.

    ``on_created`` must durably record the URL before returning. If this callback
    fails, saving stops. A failure without a known URL must be manually
    reconciled with the draft box before another new draft is attempted.
    """

    def __init__(self, root: Path, cdp_url: str | None = None, login_timeout: int = 180):
        self.root = Path(root).resolve()
        self.cdp_url = _validate_cdp_url(cdp_url) if cdp_url else None
        self.login_timeout = max(1, int(login_timeout))
        # 等待“存草稿”结果和草稿箱列表的时间，测试里会调小。
        self.save_timeout = 90.0
        self.lookup_timeout = 25.0
        self.last_draft_url: str | None = None
        self._playwright: Playwright | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._browser = None
        self._logged_in = False
        self._callback_error: Exception | None = None

    # ------------------------------------------------------------------ session

    def __enter__(self) -> "BaijiahaoBrowser":
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
                    str(profile), channel="msedge", headless=False, no_viewport=True,
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
                "无法启动百家号浏览器。请确认已安装 Microsoft Edge 和项目依赖，"
                "且没有另一个程序占用 data/edge-profile。详细原因：" + str(exc)
            ) from exc

    def __exit__(self, exc_type, exc, traceback) -> None:
        # CDP belongs to the user: close only the tab created by this adapter.
        # Stopping Playwright disconnects the transport without Browser.close().
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

    def _require_page(self) -> "Page":
        if self._page is None or self._context is None:
            raise BrowserError("请先通过 with BaijiahaoBrowser(...) 打开浏览器会话。")
        if self._page.is_closed():
            raise BrowserError("百家号操作标签页已被关闭。")
        return self._page

    # ------------------------------------------------------------- element lookup

    @staticmethod
    def _first_visible(scope, selectors) -> tuple["Locator", str] | None:
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

    def _find_title(self, page: "Page", timeout: float = 30.0) -> "Locator":
        """按候选顺序在所有 frame 里找标题编辑区，避免误抓侧栏的其它输入框。"""
        deadline = time.monotonic() + timeout
        while True:
            for selector in TITLE_SELECTORS:
                for scope in (page, *page.frames):
                    found = self._first_visible(scope, (selector,))
                    if found:
                        return found[0]
            if time.monotonic() >= deadline:
                raise BrowserError(
                    "没有找到百家号的标题输入框。页面结构可能已变化；"
                    "请运行 06-查看页面结构.cmd 反馈日志 logs/editor-probe.json。"
                )
            page.wait_for_timeout(400)

    def _find_body(self, page: "Page", timeout: float = 45.0) -> tuple["Locator", "Frame"]:
        """正文在 iframe 里，必须先把所有 frame 过一遍再退回通用 contenteditable。"""
        deadline = time.monotonic() + timeout
        while True:
            for selector in BODY_SELECTORS:
                for frame in list(page.frames):
                    found = self._first_visible(frame, (selector,))
                    if found and self._is_body_candidate(found[0]):
                        return found[0], frame
            if time.monotonic() >= deadline:
                raise BrowserError("没有找到百家号的正文编辑区。页面结构可能已变化。")
            page.wait_for_timeout(400)

    @staticmethod
    def _is_body_candidate(locator: "Locator") -> bool:
        """标题框本身也是 contenteditable，不能把它当成正文。"""
        try:
            return bool(locator.evaluate(
                """el => !el.closest('[data-testid="news-title-input"]')
                    && !el.closest('.client_pages_edit_components_titleInput')
                    && !el.closest('#bjhNewsTitle')"""
            ))
        except Exception:
            return False

    @staticmethod
    def title_limits(title: "Locator") -> tuple[int, int]:
        """百家号把字数要求写在标题框的占位文案里，例如“请输入标题（2 - 64字）”。"""
        try:
            text = title.evaluate(
                """el => {
                    const box = el.closest('[data-testid="news-title-input"]')
                        || el.closest('.client_pages_edit_components_titleInput') || el.parentElement;
                    return box ? (box.innerText || '') : '';
                }"""
            )
            match = re.search(r"(\d+)\s*[-~～—–至到]\s*(\d+)\s*字", text or "")
        except Exception:
            match = None
        if match:
            low, high = int(match.group(1)), int(match.group(2))
            if 0 < low < high:
                return low, high
        return TITLE_DEFAULT_LIMITS

    @staticmethod
    def _element_text(locator: "Locator") -> str:
        return locator.evaluate(
            "el => ('value' in el && String(el.tagName).toLowerCase() !== 'div')"
            " ? (el.value || '') : (el.innerText || el.textContent || '')"
        )

    def _read_content(self, title: "Locator", body: "Locator") -> tuple[str, str]:
        return self._element_text(title), self._element_text(body)

    @staticmethod
    def _matches(content: tuple[str, str], article: ArticleLike) -> bool:
        """标题一致、正文一致（导入文档时平台可能把标题重复写进正文开头）。"""
        title, body = content
        wanted_title = normalize_text(article.title)
        wanted_body = normalize_text(article.text)
        body_text = _EDITOR_NOISE.sub("", normalize_text(_meaningful(body)))
        return (
            normalize_text(_meaningful(title)) == wanted_title
            and body_text in {wanted_body, wanted_title + wanted_body}
        )

    # ------------------------------------------------------------------- login

    def _editor_ready(self, page: "Page") -> bool:
        return self._first_visible(page, TITLE_SELECTORS) is not None

    def _has_baidu_session(self) -> bool:
        """Baidu marks a signed-in browser with a BDUSS cookie on .baidu.com."""
        if self._context is None:
            return False
        try:
            return any(cookie.get("name") == "BDUSS" for cookie in self._context.cookies())
        except Exception:
            return False

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
                self._page.evaluate("document.title = '百家号｜需要登录或验证'")
        except Exception:
            print('[提示] 百家号窗口状态调整失败，请查看浏览器窗口。', flush=True)
        finally:
            if session is not None:
                try:
                    session.detach()
                except Exception:
                    pass

    def ensure_login(self) -> None:
        """Wait for the user to log in in the dedicated, visible Edge window."""
        page = self._require_page()
        if self._logged_in:
            return
        try:
            page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=60_000)
            # An already signed-in editor can take a while to hydrate.
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline and not self._editor_ready(page):
                page.wait_for_timeout(300)
            if not self._editor_ready(page):
                if self._has_baidu_session():
                    print("已检测到百家号登录状态，正在等待发文页加载……", flush=True)
                else:
                    self._window_state('normal')
                    print(
                        f"请在已打开的 Edge 窗口里登录百家号（扫码或账号密码均可）；等待最多 {self.login_timeout} 秒。"
                        "登录过程中本项目不会刷新页面；登录成功后会自动回到发文页。"
                        "登录状态会保留在本项目的专用浏览器配置中，之后无需重复登录。",
                        flush=True,
                    )
            deadline = time.monotonic() + self.login_timeout
            redirected_at = 0.0
            while time.monotonic() < deadline:
                if self._editor_ready(page):
                    self._logged_in = True
                    self._window_state('minimized')
                    return
                # 只有确认已经拿到百度登录态、而且当前不在发文页时才回一次编辑器。
                # 登录页、扫码页、验证码页一律不碰，绝不打断或刷新登录流程。
                parsed = urlsplit(page.url)
                if (
                    parsed.hostname == "baijiahao.baidu.com"
                    and parsed.path != _EDIT_PATH
                    and self._has_baidu_session()
                    and time.monotonic() - redirected_at > 10
                ):
                    redirected_at = time.monotonic()
                    page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=45_000)
                page.wait_for_timeout(600)
            raise BrowserError("等待百家号登录超时，或编辑器页面结构已变化；本次没有填写文章。")
        except Exception as exc:
            screenshot = self._capture_failure(page)
            if isinstance(exc, BrowserError):
                raise BrowserError(str(exc) + screenshot) from exc
            raise BrowserError("无法进入百家号文章编辑器：" + str(exc) + screenshot) from exc

    # ------------------------------------------------------------------ failure

    def _capture_failure(self, page: "Page") -> str:
        try:
            logs = self.root / "logs"
            logs.mkdir(parents=True, exist_ok=True)
            path = logs / f"draft-failure-{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:6]}.png"
            page.screenshot(path=str(path), full_page=True, timeout=15_000)
            return f"\n失败现场截图：{path}"
        except Exception:
            return "\n无法截取失败现场。"

    # ------------------------------------------------------------- draft address

    def _check_callback(self) -> None:
        if self._callback_error is not None:
            raise BrowserError(
                "草稿地址写入本地记录失败，已停止后续操作：" + str(self._callback_error)
            ) from self._callback_error

    def _observe_url(self, page: "Page", on_created: Callable[[str], None] | None) -> None:
        try:
            url = canonical_draft_url(page.url)
        except (BrowserError, ValueError):
            return
        self._remember_url(url, on_created)

    def _remember_url(self, url: str, on_created: Callable[[str], None] | None) -> None:
        if self.last_draft_url == url:
            return
        if self.last_draft_url is not None:
            self._callback_error = BrowserError("同一次编辑出现了不同草稿地址，需要人工核对。")
            return
        # Keep the URL even if persisting it fails, so the exception can disclose
        # where the user should inspect the possibly-created draft.
        self.last_draft_url = url
        if on_created is not None:
            try:
                on_created(url)
            except Exception as exc:
                self._callback_error = exc

    def _draft_url_from_box(self, title: str) -> str | None:
        """Last resort: read the作品管理 row whose title matches exactly.

        The list page links every item to ``/builder/preview/s?id=<article_id>``,
        which is the only place the id is exposed when the editor keeps its own
        address unchanged.
        """
        if self._context is None:
            return None
        box = self._context.new_page()
        try:
            box.goto(f"{DRAFT_BOX_URL}?currentPage=1&pageSize=10&search={quote(title)}",
                     wait_until="domcontentloaded", timeout=60_000)
            deadline = time.monotonic() + self.lookup_timeout
            while time.monotonic() < deadline:
                if box.locator('a[href*="/builder/preview/s?id="]').count():
                    break
                box.wait_for_timeout(500)
            links = box.locator('a[href*="/builder/preview/s?id="]')
            wanted = normalize_text(title)
            for index in range(min(links.count(), 40)):
                link = links.nth(index)
                try:
                    if normalize_text(link.inner_text()) != wanted:
                        continue
                    href = link.get_attribute("href") or ""
                except Exception:
                    continue
                match = re.search(r"[?&]id=(\d{6,})", href)
                if match:
                    return build_draft_url(match.group(1))
        except Exception:
            return None
        finally:
            if not box.is_closed():
                box.close()
        return None

    # ---------------------------------------------------------------- verifying

    def _verify_saved(self, url: str, article: ArticleLike, *, allow_save_delay: bool) -> str:
        """Read from a separate page; never modify content while reconciling."""
        if self._context is None:
            raise BrowserError("浏览器会话没有打开。")
        verify_page = self._context.new_page()
        last_content: tuple[str, str] | None = None
        try:
            # A short bounded read-only retry accommodates the autosave request.
            # Resume mode gets exactly one navigation and never writes anything.
            attempts = 4 if allow_save_delay else 1
            for attempt in range(attempts):
                verify_page.goto(url, wait_until="domcontentloaded", timeout=60_000)
                title = self._find_title(verify_page, timeout=30)
                body, _frame = self._find_body(verify_page, timeout=30)
                loaded_url = canonical_draft_url(verify_page.url)
                if loaded_url != url:
                    raise DraftVerificationError("回读草稿时跳转到了另一篇文章，已停止。")
                # Wait for asynchronous initial editor hydration as well as DOM.
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline:
                    last_content = self._read_content(title, body)
                    if self._matches(last_content, article):
                        return url
                    verify_page.wait_for_timeout(300)
                if attempt + 1 < attempts:
                    verify_page.wait_for_timeout(2_000)
            title_text, body_text = last_content or ("", "")
            raise DraftVerificationError(
                "草稿回读与源文章不一致，未确认成功。"
                f"标题匹配：{normalize_text(_meaningful(title_text)) == normalize_text(article.title)}；"
                f"正文有效字符数：线上 {len(normalize_text(_meaningful(body_text)))} / "
                f"本地 {len(normalize_text(article.text))}。"
                "请打开该草稿人工检查；程序不会覆盖或另建重试。"
            )
        except Exception as exc:
            screenshot = self._capture_failure(verify_page)
            if isinstance(exc, DraftVerificationError):
                raise DraftVerificationError(str(exc) + screenshot) from exc
            raise DraftVerificationError("无法独立回读草稿：" + str(exc) + screenshot) from exc
        finally:
            if not verify_page.is_closed():
                verify_page.close()

    # -------------------------------------------------------------------- saving

    def save_draft(
        self,
        article: ArticleLike,
        resume_url: str | None = None,
        on_created: Callable[[str], None] | None = None,
        reset_editor: bool = False,
    ) -> str:
        """Create one draft or verify a recorded draft; never publish it.

        A returned URL means a fresh page has read back the complete title and
        body. Exceptions must not cause the caller to archive the source file or
        blindly call this method again without a recorded resume URL.

        ``reset_editor`` 表示允许先清空编辑器里的临时内容（不会删除已保存的草稿）。
        """
        article = draft_article(article)
        page = self._require_page()
        self.last_draft_url = None
        self._callback_error = None
        if not article.title.strip() or not normalize_text(article.text):
            raise BrowserError("标题或正文为空，拒绝创建草稿。")
        self.ensure_login()

        if resume_url:
            self.last_draft_url = canonical_draft_url(resume_url)
            return self._verify_saved(self.last_draft_url, article, allow_save_delay=False)

        try:
            page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=60_000)
            title_field = self._find_title(page, timeout=45)
            body_field, _frame = self._find_body(page, timeout=45)

            # Do not overwrite a recovered editor, a previous draft, or content
            # the user typed into this automation tab.
            old_title, old_body = self._read_content(title_field, body_field)
            already_loaded = (
                self._matches((old_title, old_body), article)
                and self._image_count(body_field) >= len(getattr(article, "images", ()) or ())
            )
            if (normalize_text(_meaningful(old_title)) or normalize_text(_meaningful(old_body))) \
                    and not already_loaded:
                if not reset_editor:
                    raise BrowserError(
                        "编辑器里已经有内容（可能是百家号自动恢复的上次草稿）。"
                        "为避免覆盖或另建重复稿，已停止；确认那些内容不需要时，"
                        "可以用「清空编辑器后重试」再运行一次。"
                    )
                print("已按参数清空编辑器里的临时内容。", flush=True)
                self.clear_editor(page, title_field, body_field)
            low, high = self.title_limits(title_field)
            title = article.title.strip()
            if not low <= len(title) <= high:
                raise BrowserError(
                    f"标题 {len(title)} 字，百家号要求 {low}-{high} 字，请先修改源文章标题。"
                )

            self._observe_url(page, on_created)
            self._check_callback()

            source = Path(getattr(article, "source", "") or "")
            if already_loaded:
                print("编辑器里已经是这篇稿子的内容，直接保存为草稿。", flush=True)
            elif source.suffix.lower() == ".docx":
                # 走平台自带的“导入文档”：正文和配图由百家号自己读进编辑器。
                import tempfile
                from .import_document import compatible_copy
                with tempfile.TemporaryDirectory(prefix='baijiahao-import-') as temporary:
                    try:
                        upload = compatible_copy(source, Path(temporary) / source.name)
                    except Exception as exc:
                        raise BrowserError(
                            f'本地兼容副本准备失败，尚未把文章上传到百家号：{exc}'
                        ) from exc
                    self._import_document(page, upload)
                    print("已把 Word 交给百家号“导入文档”，等待标题、正文和配图就绪……", flush=True)
                    matched = self._wait_for_import(page, title_field, body_field, article,
                                                    on_created, 150)
                if not matched:
                    modals = page.locator('.cheetah-modal-wrap')
                    if any(modals.nth(i).is_visible() for i in range(modals.count())):
                        raise DraftVerificationError('百家号文档导入尚未完成，弹窗仍打开；未保存草稿。' + self._visible_messages(page))
                    # 百家号导入器可能只写入部分标题；覆盖为空标题或占位标题后再核验一次。
                    current_raw_title = _meaningful(self._element_text(title_field)).strip()
                    current_title = normalize_text(current_raw_title)
                    expected_title = normalize_text(title)
                    if re.fullmatch(r"\d{2,20}", current_title):
                        # 纯数字标题是作者人工留下的占位，后续可在平台手工修改。
                        article = replace(article, title=current_raw_title)
                        title = current_raw_title
                        matched = self._wait_for_content(page, title_field, body_field, article,
                                                         on_created, 25)
                    elif current_title != expected_title:
                        self._fill_title(page, title_field, title)
                        matched = self._wait_for_content(page, title_field, body_field, article,
                                                         on_created, 25)
                    if not matched:
                        raise DraftVerificationError(
                            "导入文档后没有读到完整的标题、正文或配图，已停止，未保存草稿。"
                        )
                if not normalize_text(_meaningful(self._element_text(title_field))):
                    self._fill_title(page, title_field, title)
                    if not self._wait_for_content(page, title_field, body_field, article,
                                                  on_created, 15):
                        raise DraftVerificationError("导入后标题没有写进编辑器，已停止。")
                # 导入的正文里已经有图，直接把第一张设为封面（“设置封面 → 选择封面 → 确定”）。
                if getattr(article, "images", ()):
                    if self._set_cover(page):
                        print("已自动匹配封面：使用正文第一张图。", flush=True)
                    else:
                        print("提示：没能自动选中封面，请在草稿的“设置封面”里点一下。", flush=True)
            else:
                self._fill_title(page, title_field, title)
                self._observe_url(page, on_created)
                self._check_callback()
                body_field.focus()
                # A real paste event is handled by the editor's own importer, which
                # updates its internal document state. Assigning innerHTML would not.
                self._fill_body(body_field, article)
                matched = self._wait_for_content(page, title_field, body_field, article, on_created, 15)
                if not matched:
                    # 少数情况下编辑器不接管合成粘贴事件，退回直接写入 HTML 再触发 input。
                    self._inject_body(body_field, article)
                    matched = self._wait_for_content(page, title_field, body_field, article, on_created, 10)
                if not matched:
                    raise DraftVerificationError(
                        "百家号编辑器没有完整接收标题和富文本正文。可能是页面结构或粘贴行为变化；"
                        "已停止，未创建草稿。"
                    )

            # “选择封面”改版后可能没有“确定”按钮，而是点缩略图后自动生效。
            # 如果自动选封面没有识别成功，弹窗仍会覆盖页面底部，导致后续误报
            # “没有找到存草稿按钮”。保存前再做一次有范围限制的封面弹窗清理。
            self._dismiss_cover_dialog(page)
            self._click_save(page)

            deadline = time.monotonic() + self.save_timeout
            while time.monotonic() < deadline:
                self._observe_url(page, on_created)
                self._check_callback()
                if self.last_draft_url is not None:
                    break
                page.wait_for_timeout(400)

            if self.last_draft_url is None:
                recovered = self._draft_url_from_box(article.title)
                if recovered:
                    self._remember_url(recovered, on_created)
            if self.last_draft_url is None:
                raise DraftVerificationError(
                    "点击“存草稿”后没有取得草稿地址，不能确认已保存。"
                    + self._visible_messages(page)
                    + "请先打开百家号草稿箱检查，勿直接重跑，以免重复建稿。"
                )

            self._check_callback()
            verified = self._verify_saved(self.last_draft_url, article, allow_save_delay=True)
            self._check_callback()
            return verified
        except Exception as exc:
            location = (
                f"\n待核对草稿：{self.last_draft_url}"
                if self.last_draft_url
                else "\n尚未取得草稿地址；请先检查百家号草稿箱，勿直接重新创建，以免重复。"
            )
            screenshot = self._capture_failure(page)
            error_type = DraftVerificationError if isinstance(exc, DraftVerificationError) else BrowserError
            raise error_type(str(exc) + location + screenshot) from exc

    def _fill_body(self, body: "Locator", article: ArticleLike) -> None:
        """Feed the rich text in, preferring a real paste over direct injection."""
        body.evaluate(
            """(element, content) => {
                const clipboard = new DataTransfer();
                clipboard.setData('text/html', content.html);
                clipboard.setData('text/plain', content.text);
                element.dispatchEvent(new ClipboardEvent('paste', {
                    bubbles: true, cancelable: true, clipboardData: clipboard
                }));
            }""",
            {"html": article.html, "text": article.text},
        )

    # -------------------------------------------------------------- 文档导入

    def clear_editor(self, page: "Page", title: "Locator", body: "Locator") -> None:
        """清空编辑器里的临时内容；百家号只有点“存草稿”才会保存到服务器。"""
        body.click()
        page.keyboard.press("Control+A")
        page.keyboard.press("Delete")
        page.wait_for_timeout(500)
        title.click()
        page.keyboard.press("Control+A")
        page.keyboard.press("Delete")
        page.wait_for_timeout(500)

    def _import_document(self, page: "Page", path: Path) -> None:
        """用编辑器自带的“插入 → 导入文档”读入 .docx；图片由百家号自己上传。"""
        if not path.is_file():
            raise BrowserError(f"找不到要导入的 Word 文件：{path}")
        self._open_import_entry(page)
        # Modal mounting is asynchronous. Setting a hidden input before the
        # new modal has mounted can target an obsolete React upload instance.
        select = page.get_by_text('选择文档', exact=True)
        try:
            select.first.wait_for(state='visible', timeout=8000)
        except Exception:
            pass
        else:
            with page.expect_file_chooser(timeout=12_000) as selected:
                select.first.click()
            selected.value.set_files(str(path))
            print('已通过导入弹窗选择文档', path.name, flush=True)
            return
        chooser = None
        failure = ""
        try:
            with page.expect_file_chooser(timeout=12_000) as info:
                self._open_import_entry(page)
            chooser = info.value
        except Exception as exc:
            failure = str(exc)[:200]
        if chooser is not None:
            chooser.set_files(str(path))
            return
        # The current importer opens a modal first; its own document chooser
        # must be used, not an unrelated hidden image-upload input.
        select_document = page.get_by_role('button', name='选择文档', exact=True)
        if select_document.count() and select_document.first.is_visible():
            with page.expect_file_chooser(timeout=12_000) as selected:
                select_document.first.click()
            selected.value.set_files(str(path))
            return
        # 有些版式的“导入文档”在弹窗里，再给隐藏的 file 控件直接投放文件。
        for scope in (page, *page.frames):
            try:
                inputs = scope.locator('input[type="file"]')
                count = min(inputs.count(), 8)
            except Exception:
                continue
            for index in range(count):
                element = inputs.nth(index)
                try:
                    accept = (element.get_attribute("accept") or "").lower()
                except Exception:
                    continue
                if accept and not any(token in accept for token in (".doc", "word", "docx")):
                    continue
                try:
                    element.set_input_files(str(path))
                    return
                except Exception:
                    continue
        raise BrowserError(
            "没有找到百家号“导入文档”的上传控件，可能页面已改版。"
            + (f"（{failure}）" if failure else "")
        )

    def _open_import_entry(self, page: "Page") -> None:
        """点开“插入”，再点“导入文档”。

        百家号最近新加了两块浮层，正好压住工具栏右边的「插入」按钮：
        「新增智能标题…」推广弹窗、右侧「欢迎使用AI助手」面板。
        先清掉它们再点菜单；菜单没出来就再来一遍。
        """
        opened_once = False
        for _attempt in range(2):
            self._clear_overlays(page)
            opened = False
            # 改版后“插入”有时只有 aria/title，没有独立文本节点；按可访问
            # 名称、文本、属性依次尝试。也检查 iframe，避免工具栏被移入子框架。
            for scope in (page, *page.frames):
                candidates = (
                    scope.get_by_role("button", name=_INSERT_PATTERN),
                    scope.get_by_role("tab", name=_INSERT_PATTERN),
                    scope.get_by_text(_INSERT_PATTERN),
                    scope.locator('[aria-label*="插入"], [title*="插入"]'),
                )
                for target in candidates:
                    try:
                        for index in range(min(target.count(), 8) - 1, -1, -1):
                            candidate = target.nth(index)
                            if candidate.is_visible():
                                candidate.click(timeout=10_000)
                                opened = True
                                opened_once = True
                                break
                    except Exception:
                        continue
                    if opened:
                        break
                if opened:
                    break
            if not opened:
                continue

            # 第一次点击可能只收起遮罩而没有真正展开菜单，所以每次点击后
            # 都短暂查找菜单项；找不到就关闭浮层并完整重试一次。
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                for scope in (page, *page.frames):
                    items = (
                        scope.get_by_role("menuitem", name=_IMPORT_PATTERN),
                        scope.get_by_role("button", name=_IMPORT_PATTERN),
                        scope.get_by_text(_IMPORT_PATTERN),
                        scope.locator(
                            '[aria-label*="导入文档"], [title*="导入文档"], '
                            '[aria-label*="文档导入"], [title*="文档导入"]'
                        ),
                    )
                    for item in items:
                        try:
                            for index in range(min(item.count(), 8)):
                                candidate = item.nth(index)
                                if candidate.is_visible():
                                    candidate.click(timeout=10_000)
                                    return
                        except Exception:
                            continue
                page.wait_for_timeout(250)
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
        if not opened_once:
            raise BrowserError("没有找到百家号编辑器的“插入”菜单。")
        raise BrowserError("“插入”菜单里没有找到“导入文档”。")

    @staticmethod
    def _clear_overlays(page: "Page") -> None:
        """关掉挡住工具栏的推广弹窗和右侧 AI 面板。"""
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        for label in ("收起", "关闭"):
            try:
                node = page.get_by_text(label, exact=True).first
                if node.count() and node.is_visible():
                    node.click(timeout=2500)
                    page.wait_for_timeout(300)
            except Exception:
                continue
        page.wait_for_timeout(300)

    @staticmethod
    def _image_count(body: "Locator") -> int:
        """正文编辑区里已经就绪的图片数量。"""
        try:
            return int(body.evaluate("el => el.querySelectorAll('img').length"))
        except Exception:
            return 0

    def _wait_for_import(self, page, title, body, article, on_created, seconds: float) -> bool:
        """等导入完成：标题、正文都对上，并且配图数量到位。"""
        expected = len(getattr(article, "images", ()) or ())
        deadline = time.monotonic() + seconds
        progress = (0, 0, 0)
        while time.monotonic() < deadline:
            self._observe_url(page, on_created)
            self._check_callback()
            failure = page.get_by_text('上传文件解析为空', exact=False)
            if failure.count() and failure.first.is_visible():
                raise DraftVerificationError('百家号提示上传文件解析为空，导入失败，未保存草稿。')
            title_text, body_text = self._read_content(title, body)
            count = self._image_count(body)
            if self._matches((title_text, body_text), article) and count >= expected:
                return True
            progress = (
                len(normalize_text(_meaningful(title_text))),
                len(normalize_text(_meaningful(body_text))),
                count,
            )
            # 百家号有时只导入正文，标题需要补写。
            import_open = page.locator('.cheetah-modal-wrap')
            if (not normalize_text(_meaningful(title_text))
                    and not any(import_open.nth(i).is_visible() for i in range(import_open.count()))):
                self._fill_title(page, title, article.title.strip())
                print(f'[标题] 已自动填写：{article.title}', flush=True)
            page.wait_for_timeout(600)
        print(
            f"导入进度停在：标题 {progress[0]} 字 / 正文 {progress[1]} 字 / 图片 {progress[2]}/{expected} 张",
            flush=True,
        )
        return False

    def _set_cover(self, page: "Page") -> bool:
        """把正文第一张图设为封面；失败不影响草稿保存。"""
        opened = False
        try:
            trigger = page.get_by_text("选择封面", exact=True)
            if not trigger.count():
                return False
            trigger.first.click(timeout=10_000)
            opened = True
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                # 只在封面弹窗内部找确认控件，避免误点编辑器里的发布按钮。
                for modal in self._cover_dialogs(page):
                    candidates = modal.get_by_role(
                        "button", name=re.compile(r"^(?:确定|完成|保存封面)$")
                    )
                    for index in range(min(candidates.count(), 5)):
                        button = candidates.nth(index)
                        try:
                            if button.is_visible() and not button.is_disabled():
                                button.click(timeout=10_000)
                                page.wait_for_timeout(1_500)
                                return True
                        except Exception:
                            continue
                page.wait_for_timeout(300)
        except Exception:
            pass
        finally:
            if opened:
                self._dismiss_cover_dialog(page)
        return False

    @staticmethod
    def _cover_dialogs(page: "Page") -> list["Locator"]:
        """Return visible cover-selection dialogs, excluding unrelated modals."""
        found: list["Locator"] = []
        selectors = (
            '.cheetah-modal-wrap',
            '[role="dialog"]',
            '[class*="modal"][class*="wrap"]',
        )
        for selector in selectors:
            try:
                nodes = page.locator(selector)
                for index in range(min(nodes.count(), 12)):
                    node = nodes.nth(index)
                    if not node.is_visible():
                        continue
                    text = (node.inner_text(timeout=1_500) or "")[:2_000]
                    if any(token in text for token in ("正文/本地上传", "AI封面", "免费正版图库", "封面预览")):
                        found.append(node)
            except Exception:
                continue
        return found

    def _dismiss_cover_dialog(self, page: "Page") -> None:
        """Close a leftover cover chooser without touching publish controls."""
        for _attempt in range(3):
            dialogs = self._cover_dialogs(page)
            if not dialogs:
                return
            for modal in dialogs:
                closed = False
                candidates = (
                    modal.get_by_role("button", name=re.compile(r"^(?:关闭|取消)$")),
                    modal.locator(
                        '[aria-label*="关闭"], [title*="关闭"], '
                        '[class*="modal-close"], [class*="Modal-close"], '
                        '[class*="close"], [class*="Close"]'
                    ),
                )
                for nodes in candidates:
                    try:
                        for index in range(min(nodes.count(), 12)):
                            node = nodes.nth(index)
                            if node.is_visible():
                                node.click(timeout=3_000)
                                page.wait_for_timeout(400)
                                closed = True
                                break
                    except Exception:
                        continue
                    if closed:
                        break
                if closed:
                    continue
                # 最后的安全回退只点击该弹窗自己的右上角关闭位置。
                try:
                    box = modal.bounding_box()
                    if box:
                        page.mouse.click(box["x"] + box["width"] - 28, box["y"] + 28)
                        page.wait_for_timeout(400)
                except Exception:
                    pass
            try:
                page.keyboard.press("Escape")
                page.wait_for_timeout(400)
            except Exception:
                pass

    @staticmethod
    def _inject_body(body: "Locator", article: ArticleLike) -> None:
        """Fallback: write the same HTML the paste would have delivered."""
        body.evaluate(
            """(element, content) => {
                element.innerHTML = content.html;
                element.dispatchEvent(new InputEvent('input', {bubbles: true}));
            }""",
            {"html": article.html},
        )

    @staticmethod
    def _fill_title(page: "Page", title: "Locator", text: str) -> None:
        """Type the title like a person would; fall back to a direct fill."""
        title.click()
        page.keyboard.press("Control+A")
        page.keyboard.press("Delete")
        title.press_sequentially(text, delay=15)
        if normalize_text(BaijiahaoBrowser._element_text(title)) != normalize_text(text):
            title.fill(text)

    def _wait_for_content(self, page, title, body, article, on_created, seconds: float) -> bool:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self._observe_url(page, on_created)
            self._check_callback()
            if self._matches(self._read_content(title, body), article):
                return True
            page.wait_for_timeout(300)
        return False

    @staticmethod
    def _visible_messages(page: "Page") -> str:
        """Surface the editor's own toast / dialog text so failures are explainable."""
        try:
            texts = page.evaluate(
                """() => Array.from(document.querySelectorAll(
                    '[class*=toast],[class*=Toast],[class*=message],[class*=Message],'
                    + '[class*=dialog],[class*=Dialog],[class*=modal],[class*=Modal]'
                )).filter(el => el.offsetParent !== null)
                  .map(el => (el.innerText || '').trim())
                  .filter(text => text && text.length < 120)"""
            )
        except Exception:
            return ""
        unique = list(dict.fromkeys(texts))[:4]
        return ("页面提示：" + " / ".join(unique) + "。") if unique else ""

    def _click_save(self, page: "Page") -> None:
        """Click 存草稿 only; publishing controls are never touched."""
        for label in SAVE_LABELS:
            for scope in (page, *page.frames):
                try:
                    target = scope.get_by_text(label, exact=True)
                    if target.count() and target.first.is_visible():
                        target.first.click(timeout=15_000)
                        return
                except Exception:
                    continue
        for scope in (page, *page.frames):
            try:
                target = scope.get_by_role("button", name=re.compile("存.*草稿|草稿"))
                if target.count() and target.first.is_visible():
                    target.first.click(timeout=15_000)
                    return
            except Exception:
                continue
        raise BrowserError("没有找到“存草稿”按钮，为避免误发布已停止；本次没有点击任何发布按钮。")

    # -------------------------------------------------------------------- probe

    def dump_editor(self) -> Path:
        """Write the live editor structure to logs/ for diagnosis after a redesign."""
        page = self._require_page()
        page.goto(EDITOR_URL, wait_until="domcontentloaded", timeout=60_000)
        # 编辑器主体是懒加载的 iframe，等到真正出现再采样。
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            ready = False
            for frame in list(page.frames):
                try:
                    if frame.locator('body.news-editor-pc, body[contenteditable="true"]').count():
                        ready = True
                        break
                except Exception:
                    continue
            if ready:
                break
            page.wait_for_timeout(500)
        page.wait_for_timeout(4_000)
        script = """() => {
            const visible = el => !!(el.offsetParent || el.getClientRects().length);
            const info = el => ({
                tag: el.tagName,
                id: el.id || '',
                class: String(el.className || '').slice(0, 140),
                type: el.getAttribute('type') || '',
                placeholder: el.getAttribute('placeholder') || '',
                maxlength: el.getAttribute('maxlength') || '',
                editable: el.getAttribute('contenteditable') || '',
                name: el.getAttribute('name') || '',
                text: (el.innerText || el.value || '').trim().slice(0, 60),
                visible: visible(el),
            });
            const all = Array.from(document.querySelectorAll('*'));
            return {
                body_class: document.body ? document.body.className : '',
                editables: all.filter(el => el.isContentEditable || el.getAttribute('contenteditable') === 'true').map(info).slice(0, 25),
                inputs: all.filter(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA').map(info).slice(0, 40),
                file_inputs: Array.from(document.querySelectorAll('input[type=file]')).map(info),
                image_like: all.filter(el => /image|upload|pic|图片|上传/i.test(
                                (el.className || '') + ' ' + (el.id || '') + ' '
                                + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('data-tooltip') || ''))
                            ).map(info).slice(0, 60),
                titled: all.filter(el => /标题/.test((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('placeholder') || ''))).map(info).slice(0, 25),
                buttons: all.filter(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'A').filter(visible).map(info).slice(0, 60),
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
            "frames": tree,
        }
        report["image_dialog"] = self._probe_image_dialog(page)
        report["cover_area"] = self._probe_cover_area(page)
        logs = self.root / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        path = logs / "editor-probe.json"
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def _probe_image_dialog(self, page: "Page") -> dict:
        """打开“插入图片”对话框，记录里面的上传控件，然后原样关掉。"""
        result: dict = {"opened": False}
        try:
            button = page.locator(".edui-for-insertimage").first
            if not button.count() or not button.is_visible():
                return result
            button.click()
            page.wait_for_timeout(3_000)
            result["opened"] = True
            result["frames"] = []
            for frame in page.frames:
                try:
                    data = frame.evaluate(_DIALOG_SCRIPT)
                except Exception as exc:  # 跨域或已销毁的 iframe
                    data = {"error": str(exc)[:200]}
                data["url"] = frame.url
                result["frames"].append(data)
            result["html"] = [node for node in result["frames"] if node.get("file_inputs") or node.get("buttons")]
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)
        except Exception as exc:
            result["error"] = str(exc)[:300]
        finally:
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
        return result

    def _probe_cover_area(self, page: "Page") -> dict:
        """记录“封面”设置区域的可见控件，便于自动选择封面。"""
        try:
            return page.evaluate(_COVER_SCRIPT)
        except Exception as exc:
            return {"error": str(exc)[:300]}


_DIALOG_SCRIPT = """() => {
    const visible = el => !!(el.offsetParent || el.getClientRects().length);
    const info = el => ({
        tag: el.tagName,
        id: el.id || '',
        cls: String(el.className || '').slice(0, 100),
        type: el.getAttribute('type') || '',
        accept: el.getAttribute('accept') || '',
        text: (el.innerText || el.value || '').trim().slice(0, 30),
        visible: visible(el),
    });
    const all = Array.from(document.querySelectorAll('*'));
    return {
        file_inputs: Array.from(document.querySelectorAll('input[type=file]')).map(info),
        buttons: all.filter(el => el.tagName === 'BUTTON' || el.tagName === 'A'
                        || /edui-button|edui-dialog/.test(el.className || ''))
                    .filter(visible).map(info).slice(0, 40),
        dialogs: all.filter(el => /edui-dialog|edui-modal/.test(el.className || ''))
                    .map(el => ({cls: String(el.className).slice(0, 80),
                                 text: (el.innerText || '').trim().slice(0, 200),
                                 visible: visible(el)})).slice(0, 10),
    };
}"""

_COVER_SCRIPT = """() => {
    const visible = el => !!(el.offsetParent || el.getClientRects().length);
    const radios = Array.from(document.querySelectorAll('input[name=cover]')).map(el => ({
        value: el.value, checked: el.checked, visible: visible(el),
        label: (el.closest('label') ? (el.closest('label').innerText || '') : '').trim().slice(0, 40),
    }));
    const holders = Array.from(document.querySelectorAll('*'))
        .filter(el => el.children.length && /封面/.test(el.innerText || '') && (el.innerText || '').length < 400)
        .map(el => ({cls: String(el.className || '').slice(0, 80), text: (el.innerText || '').trim().slice(0, 300)}))
        .slice(0, 6);
    return {radios: radios, holders: holders};
}"""
