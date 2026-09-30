"""Save articles through Zhihu's visible editor, and verify the saved draft.

Only the editor's autosave is used. This module never clicks Publish or Publish
Settings, and never reads/copies cookies from the user's normal Edge profile.
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
from urllib.parse import urlsplit
from uuid import uuid4

if TYPE_CHECKING:
    from playwright.sync_api import BrowserContext, Frame, Page, Playwright


WRITE_URL = "https://zhuanlan.zhihu.com/write"
TITLE_SELECTOR = 'textarea[placeholder="请输入标题（最多 100 个字）"]'
BODY_SELECTOR = 'div[contenteditable="true"][role="textbox"].public-DraftEditor-content'
IMPORT_LABELS = ("导入",)
IMPORT_ITEM_LABELS = ("导入文档",)
_DRAFT_PATH = re.compile(r"^/p/([0-9]+)/edit/?$")
_SAVE_MARKER = re.compile(r"(?:刚刚|\d+\s*(?:秒|分钟|小时)(?:前)?)\s*[·•]\s*草稿")
_INVISIBLE = re.compile(r"[\s\u200b\u200c\u200d\u2060\ufeff]+")
# 编辑器给图片加的占位说明（“添加图片注释，不超过140字（可选）”），不算正文。
_EDITOR_NOISE = re.compile(r"添加图片注释[，,]\s*不超过\d+字（可选）|请输入图片描述|添加图片描述|编辑图片描述")


class ArticleLike(Protocol):
    source: Path
    title: str
    html: str
    text: str
    fingerprint: str
    warnings: list[str]


class BrowserError(RuntimeError):
    """A browser operation stopped without claiming that a draft was saved."""


class DraftVerificationError(BrowserError):
    """A draft could not be independently read back with identical content."""


def normalize_text(value: str) -> str:
    """Ignore layout whitespace and editor zero-width characters, nothing else."""
    return _INVISIBLE.sub("", value)


def canonical_draft_url(value: str) -> str:
    """Accept only a Zhihu article editing URL, never an arbitrary destination."""
    parsed = urlsplit(value)
    match = _DRAFT_PATH.fullmatch(parsed.path)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "zhuanlan.zhihu.com"
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or not match
    ):
        raise BrowserError(f"不是受支持的知乎草稿编辑地址：{value}")
    return f"https://zhuanlan.zhihu.com/p/{match.group(1)}/edit"


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


class ZhihuBrowser:
    """Own an isolated Edge session, or borrow an explicitly supplied local CDP.

    ``on_created`` must durably record the URL before returning. If this callback
    fails, saving stops. A failure without a known URL must be manually reconciled
    with the draft box before another new draft is attempted.
    """

    def __init__(self, root: Path, cdp_url: str | None = None, login_timeout: int = 180):
        self.root = Path(root).resolve()
        self.cdp_url = _validate_cdp_url(cdp_url) if cdp_url else None
        self.login_timeout = max(1, int(login_timeout))
        self.last_draft_url: str | None = None
        self._playwright: Playwright | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._browser = None
        self._logged_in = False
        self._callback_error: Exception | None = None

    def __enter__(self) -> "ZhihuBrowser":
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
                    args=["--start-minimized"],
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
                "无法启动知乎浏览器。请确认已安装 Microsoft Edge 和项目依赖，"
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
            raise BrowserError("请先通过 with ZhihuBrowser(...) 打开浏览器会话。")
        if self._page.is_closed():
            raise BrowserError("知乎操作标签页已被关闭。")
        return self._page

    @staticmethod
    def _editor_visible(page: "Page") -> bool:
        return page.locator(TITLE_SELECTOR).is_visible() and page.locator(BODY_SELECTOR).is_visible()

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
                self._page.evaluate("document.title = '知乎｜需要登录或验证'")
        except Exception:
            print('[提示] 知乎窗口状态调整失败，请查看浏览器窗口。', flush=True)
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
            page.goto(WRITE_URL, wait_until="domcontentloaded", timeout=45_000)
            # Give an already signed-in editor time to hydrate before asking the
            # user to log in again on every ordinary launch.
            ready_deadline = time.monotonic() + 4
            while time.monotonic() < ready_deadline and not self._editor_visible(page):
                page.wait_for_timeout(250)
            if not self._editor_visible(page):
                self._window_state('normal')
                print(
                    f"请在已打开的 Edge 窗口中登录知乎；等待最多 {self.login_timeout} 秒。"
                    "登录状态会保留在本项目的专用浏览器配置中。",
                    flush=True,
                )
            deadline = time.monotonic() + self.login_timeout
            while time.monotonic() < deadline:
                if self._editor_visible(page):
                    self._logged_in = True
                    self._window_state('minimized')
                    return
                # After login some flows return to the home page. Return to the
                # requested editor only after leaving the login/signin route.
                parsed = urlsplit(page.url)
                if (
                    parsed.hostname in ("www.zhihu.com", "zhihu.com")
                    and parsed.path in ("", "/")
                    and page.get_by_role("button", name="提问", exact=True).is_visible()
                ):
                    page.goto(WRITE_URL, wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_timeout(500)
            raise BrowserError("等待知乎登录超时，或知乎编辑器页面结构已变化；本次没有填写文章。")
        except Exception as exc:
            screenshot = self._capture_failure(page)
            if isinstance(exc, BrowserError):
                raise BrowserError(str(exc) + screenshot) from exc
            raise BrowserError("无法进入知乎文章编辑器：" + str(exc) + screenshot) from exc

    def _capture_failure(self, page: "Page") -> str:
        try:
            logs = self.root / "logs"
            logs.mkdir(parents=True, exist_ok=True)
            path = logs / f"draft-failure-{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:6]}.png"
            page.screenshot(path=str(path), full_page=True, timeout=10_000)
            return f"\n失败现场截图：{path}"
        except Exception:
            return "\n无法截取失败现场。"

    def _check_callback(self) -> None:
        if self._callback_error is not None:
            raise BrowserError("草稿地址写入本地记录失败，已停止后续操作：" + str(self._callback_error)) from self._callback_error

    def _observe_url(self, page: "Page", on_created: Callable[[str], None] | None) -> None:
        try:
            url = canonical_draft_url(page.url)
        except (BrowserError, ValueError):
            return
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

    @staticmethod
    def _read_content(page: "Page") -> tuple[str, str]:
        return (
            page.locator(TITLE_SELECTOR).input_value(),
            ZhihuBrowser._body_text(page.locator(BODY_SELECTOR)),
        )

    @staticmethod
    def _body_text(locator):
        text = locator.inner_text()
        # Browser innerText omits CSS-rendered ordered-list counters. Recover
        # counters from actual OL/LI semantics, not by deleting source numbers.
        lists = locator.evaluate("""el => Array.from(el.querySelectorAll('ol')).map(o => ({
            start: o.start || 1,
            items: Array.from(o.children).filter(l => l.tagName === 'LI').map(l => ({
                text: l.innerText, value: l.getAttribute('value')
            }))
        }))""")
        for listing in lists:
            number = listing['start']
            for item in listing['items']:
                if item['value'] is not None:
                    number = int(item['value'])
                value = item['text'].strip()
                if value and not re.match(r'^\d+[.、]\s*', value):
                    text = re.sub(r'(?m)^' + re.escape(value), lambda m: str(number) + '. ' + m[0], text, count=1)
                number += 1
        return text

    @staticmethod
    def _body_matches(body: str, article: ArticleLike) -> bool:
        """正文比对：忽略编辑器给图片加的占位说明，允许平台把标题重复写进正文开头。"""
        wanted_body = normalize_text(article.text)
        wanted_title = normalize_text(article.title)
        body_text = _EDITOR_NOISE.sub("", normalize_text(body))
        return body_text in {wanted_body, wanted_title + wanted_body}

    @classmethod
    def _matches(cls, content: tuple[str, str], article: ArticleLike) -> bool:
        title, body = content
        return normalize_text(title) == normalize_text(article.title) and cls._body_matches(body, article)

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
                verify_page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                verify_page.locator(TITLE_SELECTOR).wait_for(state="visible", timeout=20_000)
                verify_page.locator(BODY_SELECTOR).wait_for(state="visible", timeout=20_000)
                loaded_url = canonical_draft_url(verify_page.url)
                if loaded_url != url:
                    raise DraftVerificationError("回读草稿时跳转到了另一篇文章，已停止。")
                # Wait for asynchronous initial editor hydration as well as DOM.
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    last_content = self._read_content(verify_page)
                    if self._matches(last_content, article):
                        return url
                    verify_page.wait_for_timeout(250)
                if attempt + 1 < attempts:
                    verify_page.wait_for_timeout(2_000)
            title, body = last_content or ("", "")
            raise DraftVerificationError(
                "草稿回读与源文章不一致，未确认成功。"
                f"标题匹配：{normalize_text(title) == normalize_text(article.title)}；"
                f"正文有效字符数：线上 {len(normalize_text(body))} / 本地 {len(normalize_text(article.text))}。"
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
        if len(article.title) > 100:
            raise BrowserError("标题超过知乎编辑器的 100 字限制，请先修改源文章。")
        self.ensure_login()

        if resume_url:
            self.last_draft_url = canonical_draft_url(resume_url)
            return self._resume_saved(article, on_created)

        listener_installed = False

        def on_navigation(frame: "Frame") -> None:
            if frame == page.main_frame:
                self._observe_url(page, on_created)

        try:
            page.goto(WRITE_URL, wait_until="domcontentloaded", timeout=45_000)
            page.locator(TITLE_SELECTOR).wait_for(state="visible", timeout=20_000)
            page.locator(BODY_SELECTOR).wait_for(state="visible", timeout=20_000)
            # Do not overwrite a recovered editor, a previous draft, or content
            # the user typed into this automation tab.
            old_title, old_body = self._read_content(page)
            already_loaded = (
                self._matches((old_title, old_body), article)
                and self._image_count(page) >= len(getattr(article, "images", ()) or ())
            )
            if (normalize_text(old_title) or normalize_text(old_body)) and not already_loaded:
                if not reset_editor:
                    raise BrowserError(
                        "新建编辑器并非空白，为避免覆盖已有内容，已停止；"
                        "确认那些内容不需要时，可以用「清空编辑器后重试」再运行一次。"
                    )
                print("已按参数清空编辑器里的临时内容。", flush=True)
                self.clear_editor(page)

            page.on("framenavigated", on_navigation)
            listener_installed = True
            self._observe_url(page, on_created)
            self._check_callback()

            source = Path(getattr(article, "source", "") or "")
            if already_loaded:
                print("编辑器里已经是这篇稿子的内容，等待自动保存。", flush=True)
            elif source.suffix.lower() == ".docx":
                self._import_document(page, source)
                print("已把 Word 交给知乎“导入文档”，等待标题、正文和配图就绪……", flush=True)
                if not self._wait_for_import(page, article, on_created, 150):
                    raise DraftVerificationError(
                        "导入文档后没有读到完整的标题、正文或配图，已停止。"
                    )
                if not normalize_text(page.locator(TITLE_SELECTOR).input_value()):
                    page.locator(TITLE_SELECTOR).fill(article.title)
                    if not self._wait_for_content(page, article, on_created, 20):
                        raise DraftVerificationError("导入后标题没有写进编辑器，已停止。")
            else:
                page.locator(TITLE_SELECTOR).fill(article.title)
                self._observe_url(page, on_created)
                self._check_callback()

                body = page.locator(BODY_SELECTOR)
                body.focus()
                # Playwright may deliver the title-triggered navigation event while
                # focus() pumps browser events. Recheck before the next mutation so
                # a failed durable-URL callback cannot be followed by body insertion.
                self._observe_url(page, on_created)
                self._check_callback()
                # A real paste event is handled by Draft.js/React's importer, which
                # updates editor state. Assigning innerHTML would not update that
                # state and could make a visually-filled editor save an empty body.
                body.evaluate(
                    """(element, content) => {
                        const clipboard = new DataTransfer();
                        clipboard.setData('text/html', content.html);
                        clipboard.setData('text/plain', content.text);
                        const event = new ClipboardEvent('paste', {
                            bubbles: true, cancelable: true, clipboardData: clipboard
                        });
                        element.dispatchEvent(event);
                    }""",
                    {"html": article.html, "text": article.text},
                )
                if not self._wait_for_content(page, article, on_created, 15):
                    raise DraftVerificationError(
                        "知乎编辑器未完整接收标题和富文本正文。可能是页面结构或粘贴行为变化；已停止，未创建第二份。"
                    )
            if getattr(article, "images", ()):
                if self._set_cover(page, article):
                    print("已自动匹配封面：使用成稿第一张图。", flush=True)
                else:
                    print("提示：没能自动设置知乎封面，可在“发布设置 → 添加文章封面”里手动选一张。",
                          flush=True)
            self._observe_url(page, on_created)
            self._check_callback()

            # Moving focus lets editor blur/debounce behavior run; it never
            # presses any toolbar button, including Publish/Publish Settings.
            page.locator(TITLE_SELECTOR).focus()
            deadline = time.monotonic() + 60
            url_ready_at: float | None = None
            while time.monotonic() < deadline:
                self._observe_url(page, on_created)
                self._check_callback()
                saved_marker = _SAVE_MARKER.search(page.locator("body").inner_text())
                if self.last_draft_url is not None:
                    if url_ready_at is None:
                        url_ready_at = time.monotonic()
                    # Save-label wording/timing is only a hint. A separate page
                    # reading the entire saved article is the deciding evidence.
                    if saved_marker or time.monotonic() - url_ready_at >= 2:
                        break
                page.wait_for_timeout(300)
            else:
                raise DraftVerificationError("没有在 60 秒内取得草稿编辑地址，不能确认已保存。")

            self._check_callback()
            assert self.last_draft_url is not None
            verified = self._verify_saved(self.last_draft_url, article, allow_save_delay=True)
            self._check_callback()
            return verified
        except Exception as exc:
            # Navigation events can arrive while the failing operation unwinds.
            self._observe_url(page, on_created)
            location = (
                f"\n待核对草稿：{self.last_draft_url}"
                if self.last_draft_url
                else "\n尚未取得草稿地址；请先检查知乎草稿箱，勿直接重新创建，以免重复。"
            )
            screenshot = self._capture_failure(page)
            error_type = DraftVerificationError if isinstance(exc, DraftVerificationError) else BrowserError
            raise error_type(str(exc) + location + screenshot) from exc
        finally:
            if listener_installed:
                page.remove_listener("framenavigated", on_navigation)

    # -------------------------------------------------------------- 文档导入

    def _set_cover(self, page: "Page", article: ArticleLike) -> bool:
        """把成稿第一张图设为知乎文章封面；已有封面就不动，失败不影响草稿保存。"""
        images = getattr(article, "images", ()) or ()
        if not images:
            return False
        if self._cover_present(page):
            return True
        temp = self.root / "data" / "cover-temp.jpg"
        try:
            temp.parent.mkdir(parents=True, exist_ok=True)
            temp.write_bytes(images[0].data)
            wrapper = self._cover_wrapper(page)
            uploaded = False
            if wrapper is not None:
                wrapper.scroll_into_view_if_needed()
                page.wait_for_timeout(300)
                try:
                    with page.expect_file_chooser(timeout=10_000) as info:
                        wrapper.click(timeout=8_000)
                    info.value.set_files(str(temp))
                    uploaded = True
                except Exception:
                    uploaded = False
            if not uploaded:
                # 知乎的封面控件常常是隐藏的 file input，直接投放文件即可。
                inputs = page.locator('input[type="file"]')
                for index in range(min(inputs.count(), 12)):
                    accept = (inputs.nth(index).get_attribute("accept") or "").lower()
                    if ".jpeg" in accept and ".jpg" in accept:
                        inputs.nth(index).set_input_files(str(temp))
                        uploaded = True
                        break
            if not uploaded:
                return False
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                state = page.evaluate("""() => {
                    const visible = el => !!(el.offsetParent || el.getClientRects().length);
                    const holder = Array.from(document.querySelectorAll('*')).find(el =>
                        visible(el) && /添加封面/.test(el.innerText || '')
                        && (el.innerText || '').length < 200);
                    const image = holder ? holder.querySelector('img') : null;
                    const modal = Array.from(document.querySelectorAll('*')).find(el =>
                        /Modal-inner/i.test(String(el.className || ''))
                        && /确定|完成|确认/.test(el.innerText || ''));
                    return {image: image ? image.src.slice(0, 60) : '',
                            modal: modal ? (modal.innerText || '').slice(0, 80) : ''};
                }""")
                if state["modal"]:
                    for label in ("确定", "完成", "确认"):
                        button = page.get_by_role("button", name=re.compile(label))
                        try:
                            if button.count() and button.first.is_visible():
                                button.first.click(timeout=8_000)
                                page.wait_for_timeout(1_500)
                                return True
                        except Exception:
                            continue
                    return True
                if state["image"]:
                    return True
                page.wait_for_timeout(500)
        except Exception:
            return False
        finally:
            try:
                temp.unlink()
            except OSError:
                pass
        return False

    @staticmethod
    def _cover_present(page: "Page") -> bool:
        """封面位已经有图就算就绪（图片上传是异步的，等一会儿再判断）。"""
        script = """() => {
            const visible = el => !!(el.offsetParent || el.getClientRects().length);
            const holder = Array.from(document.querySelectorAll('*')).find(el =>
                visible(el) && /添加封面/.test(el.innerText || '')
                && (el.innerText || '').length < 200);
            return !!(holder && holder.querySelector('img'));
        }"""
        for _ in range(4):
            try:
                if page.evaluate(script):
                    return True
            except Exception:
                return False
            page.wait_for_timeout(1_000)
        return False

    def _cover_wrapper(self, page: "Page"):
        """找到“添加文章封面”控件；面板收起时先点开“发布设置”。"""
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            wrapper = page.locator("div.UploadPicture-wrapper").first
            try:
                if wrapper.count():
                    return wrapper
            except Exception:
                pass
            try:
                toggle = page.locator("button:has-text('发布设置')").first
                if toggle.count() and toggle.is_visible():
                    toggle.click(timeout=5_000)
                    page.wait_for_timeout(500)
            except Exception:
                pass
            page.wait_for_timeout(500)
        return None

    def _resume_saved(self, article: ArticleLike,
                      on_created: Callable[[str], None] | None) -> str:
        """续用已记录的草稿：内容一致就直接确认；只有标题没写上就补写后再确认。"""
        url = self.last_draft_url
        assert url is not None
        page = self._require_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45_000)
            page.locator(TITLE_SELECTOR).wait_for(state="visible", timeout=20_000)
            page.locator(BODY_SELECTOR).wait_for(state="visible", timeout=20_000)
            title, body = "", ""
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                title, body = self._read_content(page)
                if self._matches((title, body), article):
                    return url
                page.wait_for_timeout(300)
            if not normalize_text(title):
                # 上次导入只差标题（知乎导入不带标题），这里补齐后重新独立回读。
                page.locator(TITLE_SELECTOR).fill(article.title)
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if _SAVE_MARKER.search(page.locator("body").inner_text()):
                        break
                    page.wait_for_timeout(500)
                if getattr(article, "images", ()):
                    self._set_cover(page, article)
                self._observe_url(page, on_created)
                return self._verify_saved(url, article, allow_save_delay=True)
        except Exception as exc:
            screenshot = self._capture_failure(page)
            if isinstance(exc, DraftVerificationError):
                raise
            raise BrowserError(f"续用已有草稿失败：{exc}{screenshot}") from exc
        self._observe_url(page, on_created)
        return self._verify_saved(url, article, allow_save_delay=False)

    def clear_editor(self, page: "Page") -> None:
        """清空编辑器里的临时内容；知乎只有自动保存后才会生成草稿。"""
        body = page.locator(BODY_SELECTOR)
        body.click()
        page.keyboard.press("Control+A")
        page.keyboard.press("Delete")
        page.wait_for_timeout(400)
        title = page.locator(TITLE_SELECTOR)
        title.fill("")
        page.wait_for_timeout(400)

    def _import_document(self, page: "Page", path: Path) -> None:
        """用编辑器自带的“导入 → 导入文档”读入 .docx；图片由知乎自己上传。

        知乎会弹出一个“选择文件”窗口：文件先进云盘列表，再选中、点“请选择文件”。
        """
        if not path.is_file():
            raise BrowserError(f"找不到要导入的 Word 文件：{path}")
        self._open_import_entry(page)
        target = self._find_import_input(page)
        target.set_input_files(str(path))
        self._confirm_import_dialog(page, path)

    def _find_import_input(self, page: "Page"):
        """导入弹窗里的上传控件：accept 里带 .mdown/.mkdn（编辑器自身那个输入框是别的格式）。"""
        deadline = time.monotonic() + 20
        fallback = None
        while time.monotonic() < deadline:
            for scope in (page, *page.frames):
                try:
                    inputs = scope.locator('input[type="file"]')
                    count = min(inputs.count(), 10)
                except Exception:
                    continue
                for index in range(count):
                    element = inputs.nth(index)
                    try:
                        accept = (element.get_attribute("accept") or "").lower()
                    except Exception:
                        continue
                    if any(token in accept for token in ("mdown", "mkdn", "markdown")):
                        return element
                    if fallback is None and accept.startswith(".docx"):
                        fallback = element
            if fallback is not None:
                return fallback
            page.wait_for_timeout(300)
        raise BrowserError("没有找到知乎“导入文档”窗口里的上传控件，可能页面已改版。")

    def _confirm_import_dialog(self, page: "Page", path: Path) -> None:
        """弹窗要求先选中刚上传的文件，再点“请选择文件”。"""
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            confirm = page.get_by_text("请选择文件", exact=True)
            if confirm.count() and confirm.first.is_visible():
                row = page.get_by_text(path.stem, exact=False)
                if row.count():
                    try:
                        row.first.click(timeout=5_000)
                        page.wait_for_timeout(500)
                    except Exception:
                        pass
                try:
                    confirm.first.click(timeout=8_000)
                except Exception as exc:
                    raise BrowserError(f"知乎导入窗口里没能确认文件：{exc}") from exc
                return
            page.wait_for_timeout(300)
        # 有些版式上传后直接开始导入，没有确认按钮。

    def _open_import_entry(self, page: "Page") -> None:
        """点开工具栏的“导入”，再点“导入文档”。页面偶尔需要再试一次。"""
        for attempt in range(3):
            if attempt:
                # 上一篇导入完成后页面状态可能没复位，重新打开一次写文章页。
                try:
                    page.keyboard.press("Escape")
                    page.goto(WRITE_URL, wait_until="domcontentloaded", timeout=45_000)
                    page.locator(TITLE_SELECTOR).wait_for(state="visible", timeout=20_000)
                    page.locator(BODY_SELECTOR).wait_for(state="visible", timeout=20_000)
                    page.wait_for_timeout(2_000)
                except Exception:
                    pass
            else:
                try:
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(200)
                except Exception:
                    pass
            opened = False
            for label in IMPORT_LABELS:
                target = page.get_by_text(label, exact=True)
                try:
                    if target.count() and target.first.is_visible():
                        target.first.click(timeout=10_000)
                        opened = True
                        break
                except Exception:
                    continue
            if not opened:
                if attempt == 2:
                    raise BrowserError("没有找到知乎编辑器的“导入”按钮。")
                continue
            deadline = time.monotonic() + 6
            while time.monotonic() < deadline:
                item = page.locator("button:has-text('导入文档'), [role=button]:has-text('导入文档')").first
                try:
                    if item.count() and item.is_visible():
                        item.click(timeout=10_000)
                        return
                except Exception:
                    pass
                page.wait_for_timeout(250)
            page.wait_for_timeout(1_000)
        raise BrowserError("“导入”菜单里没有找到“导入文档”。")

    @staticmethod
    def _image_count(page: "Page") -> int:
        """正文编辑区里已经就绪的图片数量。"""
        try:
            return int(page.locator(BODY_SELECTOR).evaluate(
                "el => el.querySelectorAll('figure img').length || el.querySelectorAll('img').length"))
        except Exception:
            return 0

    def _wait_for_content(self, page: "Page", article: ArticleLike,
                          on_created: Callable[[str], None] | None, seconds: float) -> bool:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self._observe_url(page, on_created)
            self._check_callback()
            if self._matches(self._read_content(page), article):
                return True
            page.wait_for_timeout(250)
        return False

    def _wait_for_import(self, page: "Page", article: ArticleLike,
                         on_created: Callable[[str], None] | None, seconds: float) -> bool:
        """等导入完成：正文对得上、配图数量到位（标题为空时立即补写）。"""
        expected = len(getattr(article, "images", ()) or ())
        deadline = time.monotonic() + seconds
        progress = (0, 0, 0)
        while time.monotonic() < deadline:
            self._observe_url(page, on_created)
            self._check_callback()
            title, body = self._read_content(page)
            if not normalize_text(title):
                page.locator(TITLE_SELECTOR).fill(article.title)
                self._observe_url(page, on_created)
                self._check_callback()
                print(f'[标题] 已自动填写：{article.title}', flush=True)
            count = self._image_count(page)
            if self._body_matches(body, article) and count >= expected:
                return True
            progress = (len(normalize_text(title)), len(normalize_text(body)), count)
            page.wait_for_timeout(500)
        print(f"导入进度停在：标题 {progress[0]} 字 / 正文 {progress[1]} 字 / 图片 {progress[2]}/{expected} 张",
              flush=True)
        return False

    # -------------------------------------------------------------------- probe

    def dump_editor(self) -> Path:
        """记录编辑器页面结构（工具栏、文件输入、封面入口），便于改版后修复。"""
        page = self._require_page()
        page.goto(WRITE_URL, wait_until="domcontentloaded", timeout=60_000)
        page.locator(TITLE_SELECTOR).wait_for(state="visible", timeout=20_000)
        page.locator(BODY_SELECTOR).wait_for(state="visible", timeout=20_000)
        page.wait_for_timeout(3_000)
        report = {
            "probed_at": datetime.now().isoformat(timespec="seconds"),
            "url": page.url,
            "page": page.evaluate(_PROBE_SCRIPT),
        }
        logs = self.root / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        path = logs / "editor-probe.json"
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return path


_PROBE_SCRIPT = """() => {
    const visible = el => !!(el.offsetParent || el.getClientRects().length);
    const info = el => ({
        tag: el.tagName,
        id: el.id || '',
        class: String(el.className || '').slice(0, 120),
        aria: el.getAttribute('aria-label') || '',
        type: el.getAttribute('type') || '',
        accept: el.getAttribute('accept') || '',
        placeholder: el.getAttribute('placeholder') || '',
        text: (el.innerText || el.value || '').trim().slice(0, 40),
        visible: visible(el),
    });
    const all = Array.from(document.querySelectorAll('*'));
    return {
        buttons: all.filter(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'
                    || el.tagName === 'A' || el.tagName === 'SVG').filter(visible).map(info).slice(0, 120),
        file_inputs: Array.from(document.querySelectorAll('input[type=file]')).map(info),
        image_like: all.filter(el => /image|upload|pic|图片|上传/i.test(
                        (el.className || '') + ' ' + (el.id || '') + ' '
                        + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('data-tooltip') || ''))
                    ).map(info).slice(0, 60),
        editables: all.filter(el => el.isContentEditable).map(info).slice(0, 20),
        textareas: all.filter(el => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT').map(info).slice(0, 40),
    };
}"""
