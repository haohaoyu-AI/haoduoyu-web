"""小红书图源：用本项目的专用 Edge 配置，登录一次以后按词搜图。

小红书要求登录才给看搜索结果，而且对自动化比较敏感，所以这里：
1. 用一个独立的浏览器配置（data/小红书配置），和日常 Edge 互不干扰；
2. 先运行「登录小红书」让用户手动登录一次，之后复用登录状态；
3. 搜索、下载都走这个已登录的浏览器；遇到风控就明确报错，跳过小红书继续用头条。
"""

from __future__ import annotations

import time
import sqlite3
from contextlib import closing
import urllib.parse

from . import config
from .hits import Hit

PLATFORM = "小红书"
HOME_URL = "https://www.xiaohongshu.com/explore"
SEARCH_URL = "https://www.xiaohongshu.com/search_result?keyword={kw}&source=web_explore_feed"
REFERER = "https://www.xiaohongshu.com/"
NOTE_SELECTOR = "section.note-item"
COLLECT_JS = """
els => els.map(el => {
    const img = el.querySelector('img');
    const link = el.querySelector('a[href*="/explore/"], a[href*="/search_result/"]');
    const titleEl = el.querySelector('.title') || el.querySelector('span');
    const authorEl = el.querySelector('.author, .name');
    return {
        src: img ? (img.currentSrc || img.src || '') : '',
        width: img ? img.naturalWidth : 0,
        height: img ? img.naturalHeight : 0,
        title: titleEl ? titleEl.textContent.trim() : '',
        author: authorEl ? authorEl.textContent.trim() : '',
        href: link ? link.href : ''
    };
})
"""


class XiaohongshuError(RuntimeError):
    """没登录、被风控，或者页面结构变了。"""


def profile_dir():
    """专用浏览器配置目录；放在 data 下，随项目一起备份。"""
    return config.DATA / "小红书配置"


def saved_login_status() -> dict:
    """只读 Cookie 元数据，不读取或解密凭据；本地保存不等于服务端验证。"""
    found = False
    for relative in ("Default/Network/Cookies", "Default/Cookies"):
        path = profile_dir() / relative
        if not path.exists():
            continue
        found = True
        try:
            with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=0.2)) as db:
                rows = db.execute("SELECT host_key, expires_utc FROM cookies WHERE name = ?", ('web_session',)).fetchall()
            for domain, expiry in rows:
                if domain.lstrip('.') == 'xiaohongshu.com' or domain.endswith('.xiaohongshu.com'):
                    if not expiry or expiry / 1_000_000 - 11644473600 > time.time():
                        return {'status': 'saved', 'logged_in': None, 'message': '已保存登录状态，配图时自动复用；有效性以平台验证为准'}
        except (sqlite3.Error, OSError, ValueError):
            return {'status': 'unknown', 'logged_in': None, 'message': '浏览器配置正在使用或暂不可读，不能判定为未登录'}
    return {'status': 'missing', 'logged_in': False,
            'message': '未找到有效的本地登录记录，请打开登录窗口确认' if found else '尚无本地登录记录，请先登录一次'}


class XiaohongshuSource:
    """对外和 ToutiaoSource 一样：search / download / close。"""

    name = PLATFORM

    def __init__(self, *, headless: bool = False, wait_ms: int = 20_000, hint=print):
        self._headless = headless
        self._wait_ms = wait_ms
        self._hint = hint
        self._playwright = None
        self._context = None
        self._page = None
        self._search_cache = {}
        self._last_search = 0.0
        self._blocked = None

    # ---------- 浏览器生命周期 ----------
    def open(self) -> None:
        if self._context is not None:
            return
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:  # pragma: no cover - 依赖缺失
            raise XiaohongshuError(
                "没有安装 Playwright，无法搜小红书。运行 python -m pip install playwright 后重试。"
            ) from exc
        profile = profile_dir()
        profile.mkdir(parents=True, exist_ok=True)
        self._playwright = sync_playwright().start()
        try:
            self._context = self._playwright.chromium.launch_persistent_context(
                str(profile), channel="msedge", headless=self._headless, no_viewport=True,
            )
        except Exception as exc:  # pragma: no cover - 环境问题
            self._playwright.stop()
            self._playwright = None
            raise XiaohongshuError(
                "无法启动专用 Edge。确认已安装 Microsoft Edge，且没有别的程序在用 "
                f"data/小红书配置。原始错误：{exc}"
            ) from exc
        self._context.set_default_timeout(self._wait_ms)
        self._page = self._context.pages[0] if self._context.pages else self._context.new_page()

    def close(self) -> None:
        if self._context is not None:
            try:
                self._context.close()
            except Exception:  # pragma: no cover - 关闭失败不影响结果
                pass
        if self._playwright is not None:
            try:
                self._playwright.stop()
            except Exception:  # pragma: no cover
                pass
        self._context = self._page = self._playwright = None

    def __enter__(self) -> "XiaohongshuSource":
        self.open()
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    # ---------- 登录 ----------
    def logged_in(self) -> bool:
        if self._context is None:
            return False
        for cookie in self._context.cookies():
            domain = cookie.get('domain', '').lstrip('.')
            if (cookie.get("name") == "web_session" and cookie.get("value")
                    and (domain == 'xiaohongshu.com' or domain.endswith('.xiaohongshu.com'))
                    and (cookie.get('expires', -1) <= 0 or cookie['expires'] > time.time())):
                return True
        return False

    def login(self, wait_seconds: int = 600) -> bool:
        """打开窗口让用户扫码登录，登录成功返回 True。"""
        self.open()
        page = self._page
        page.goto(HOME_URL, wait_until="domcontentloaded")
        self._hint("请在弹出的 Edge 窗口里扫码或短信登录小红书，登录成功后这里会自动继续。")
        self._hint("如果已登录，系统会自动识别并关闭窗口；请等待完成提示，不要提前关闭。")
        deadline = time.monotonic() + wait_seconds
        while time.monotonic() < deadline:
            page.wait_for_timeout(2000)
            if self.logged_in():
                self._hint("检测到登录成功，登录状态已保存在 data/小红书配置。")
                return True
        self._hint("等待登录超时，本次没有保存登录状态；可以重新运行登录命令。")
        return False

    # ---------- 搜图 ----------
    def search(self, keyword: str) -> list[Hit]:
        keyword = ' '.join(keyword.split())
        if self._blocked:
            raise XiaohongshuError(self._blocked)
        if keyword in self._search_cache:
            return list(self._search_cache[keyword])
        self.open()
        if not self.logged_in():
            raise XiaohongshuError("小红书没有登录，先运行「07-登录小红书.cmd」扫码登录一次。")
        page = self._page
        delay = max(0, 4 - (time.monotonic() - self._last_search))
        if delay:
            page.wait_for_timeout(int(delay * 1000))
        self._last_search = time.monotonic()
        try:
            for attempt in range(2):
                try:
                    page.goto(SEARCH_URL.format(kw=urllib.parse.quote(keyword)), wait_until="domcontentloaded")
                    self._check_challenge()
                    page.wait_for_selector(NOTE_SELECTOR, timeout=self._wait_ms)
                    self._check_challenge()
                    break
                except XiaohongshuError:
                    raise
                except Exception:
                    self._check_challenge()
                    if attempt:
                        raise
                    self._hint('[提示] 小红书页面加载未完成，稍候重试一次。')
                    page.wait_for_timeout(4000)
        except XiaohongshuError:
            raise
        except Exception as exc:
            title = ""
            try:
                title = page.title()
            except Exception:  # pragma: no cover - 页面已崩
                pass
            if "website-login/error" in page.url or "安全限制" in title:
                raise XiaohongshuError(
                    "小红书提示「IP 存在风险」触发风控，本次跳过小红书，可稍后或换网络重试。"
                ) from exc
            if "登录" in title and "搜索" not in title:
                raise XiaohongshuError("小红书要求重新登录，请先运行「07-登录小红书.cmd」。") from exc
            raise XiaohongshuError(f"小红书搜索页没有出现笔记卡片（标题：{title}）。") from exc
        for _ in range(2):  # 多滚两屏，多拿几张
            page.mouse.wheel(0, 1800)
            page.wait_for_timeout(1200)
        raw = page.eval_on_selector_all(NOTE_SELECTOR, COLLECT_JS)
        hits: list[Hit] = []
        seen: set[str] = set()
        for item in raw:
            src = str(item.get("src") or "")
            if not src.startswith("http") or "xhscdn" not in src:
                continue
            key = src.split("?")[0]
            if key in seen:
                continue
            seen.add(key)
            title = str(item.get("title") or "").strip()
            # 无标题时不能用搜索词冒充标题，否则任何画面都会被判为相关。
            if not title:
                continue
            hits.append(Hit(
                platform=PLATFORM,
                query=keyword,
                title=title,
                source=str(item.get("author") or "").strip() or "小红书用户",
                image_url=src,
                page_url=str(item.get("href") or ""),
                width=int(item.get("width") or 0),
                height=int(item.get("height") or 0),
            ))
        self._search_cache[keyword] = list(hits)
        return hits

    def _check_challenge(self):
        title = self._page.title()
        url = self._page.url
        if any(word in title for word in ('安全验证', '安全限制', '访问验证')) or 'website-login/error' in url:
            self._blocked = '小红书触发安全验证，本轮停止该图源；请稍后在设置中打开登录窗口手动验证，其他图源继续。'
            raise XiaohongshuError(self._blocked)

    def download(self, url: str) -> bytes:
        self.open()
        response = self._context.request.get(
            url, headers={"Referer": REFERER, "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"}
        )
        if not response.ok:
            raise XiaohongshuError(f"小红书图片下载失败：HTTP {response.status}")
        return response.body()
