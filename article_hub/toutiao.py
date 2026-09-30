"""今日头条图片搜索：不用登录，直接读搜索页里的卡片数据。

头条的图片搜索结果页把每条结果的完整字段放在
`<script data-druid-card-data-id="...">` 里的 JSON 中，包含标题、来源媒体、
大图地址（large_image_url，一般 960 宽）和原文链接，直接解析即可。
图片地址带签名参数，必须整条照用，自己改尺寸会被 CDN 拒绝（403）。
"""

from __future__ import annotations

import json
from html import unescape
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from .hits import Hit
from dataclasses import replace

PLATFORM = "今日头条"
SEARCH_URL = "https://so.toutiao.com/search"
REFERER = "https://so.toutiao.com/"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
CARD_RE = re.compile(r'<script data-druid-card-data-id="[^"]+"[^>]*>(.*?)</script>', re.S)
_IMAGE_KEYS = ("large_image_url", "other_image_url", "image_url")


class ToutiaoError(RuntimeError):
    """搜索页拿不到或结构变了。"""


def publisher_originals(hit: Hit) -> list[Hit]:
    """Use explicitly advertised originals without rewriting signed CDN URLs."""
    parsed = urllib.parse.urlsplit(hit.page_url)
    if parsed.scheme != 'https' or parsed.hostname != 'm.mp.oeeee.com':
        return []
    request = urllib.request.Request(hit.page_url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=15) as response:
        if urllib.parse.urlsplit(response.geturl()).hostname != parsed.hostname:
            return []
        html = response.read(4_000_000).decode('utf-8', 'replace')
    originals = []
    for url in re.findall(r'\boriginal=[\"\x27](https://p1-mp\.oeeee\.com/[^\"\x27]+)', html):
        url = unescape(url)
        if url not in [row.image_url for row in originals]:
            originals.append(replace(hit, image_url=url, width=0, height=0))
    return originals


def _clean(text: object) -> str:
    value = unescape(str(text or ""))
    value = re.sub(r"</?em>", "", value)
    value = value.replace("\u200b", "").replace("\u3000", " ")
    return re.sub(r"\s+", " ", value).strip()


def _walk(node: object, out: list[dict]) -> None:
    if isinstance(node, dict):
        if "title" in node and any(key in node for key in _IMAGE_KEYS):
            out.append(node)
        for value in node.values():
            _walk(value, out)
    elif isinstance(node, list):
        for value in node:
            _walk(value, out)


def _origin_size(item: dict) -> tuple[int, int]:
    for key in ("image_list", "detail_image_list"):
        values = item.get(key)
        if isinstance(values, list) and values and isinstance(values[0], dict):
            try:
                return (int(values[0].get("origin_width") or 0),
                        int(values[0].get("origin_height") or 0))
            except (TypeError, ValueError):
                return 0, 0
    return 0, 0


def parse_hits(html: str, *, query: str = "") -> list[Hit]:
    """从搜索页 HTML 里取出所有带图的候选结果。"""
    raw_items: list[dict] = []
    for block in CARD_RE.findall(html):
        try:
            payload = json.loads(block)
        except ValueError:
            continue
        _walk(payload, raw_items)
    hits: list[Hit] = []
    seen: set[str] = set()
    for item in raw_items:
        title = _clean(item.get("title"))
        image_url = ""
        for key in _IMAGE_KEYS:
            value = _clean(item.get(key))
            if value.startswith("http"):
                image_url = value
                break
        if not title or not image_url:
            continue
        key = image_url.split("?")[0]
        if key in seen:
            continue
        seen.add(key)
        width, height = _origin_size(item)
        source = _clean(item.get("source") or item.get("media_name") or item.get("pgc_user_name"))
        page_url = _clean(item.get("share_url") or item.get("article_url")
                          or item.get("open_url") or item.get("source_url"))
        hits.append(Hit(PLATFORM, query, title, source, image_url, page_url,
                        width, height, _clean(item.get("abstract"))))
    return hits


def search(keyword: str, *, timeout: float = 25.0, retries: int = 2,
           pause: float = 1.2) -> list[Hit]:
    """按关键词搜图；失败会重试，仍然失败就抛出 ToutiaoError。"""
    params = urllib.parse.urlencode(
        {"dvpf": "pc", "keyword": keyword, "pd": "image", "source": "input"}
    )
    request = urllib.request.Request(
        f"{SEARCH_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Referer": REFERER,
                 "Accept-Language": "zh-CN,zh;q=0.9"},
    )
    last_error: Exception | None = None
    for attempt in range(max(1, retries)):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                html = response.read().decode("utf-8", "ignore")
            hits = parse_hits(html, query=keyword)
            expanded = []
            pages = {}
            for hit in hits:
                if hit.page_url not in pages:
                    try:
                        pages[hit.page_url] = publisher_originals(hit)
                    except (OSError, ValueError):
                        pages[hit.page_url] = []
                    if pages[hit.page_url]:
                        expanded.extend(pages[hit.page_url])
                        continue
                if not pages[hit.page_url]:
                    expanded.append(hit)
            return expanded
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt + 1 < max(1, retries):
                time.sleep(pause * (attempt + 1))
    raise ToutiaoError(f"头条搜索「{keyword}」失败：{last_error}")


def download(url: str, *, timeout: float = 30.0) -> bytes:
    """下载一张头条图床的图，必须带 Referer，否则 403。"""
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Referer": REFERER,
                      "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


class ToutiaoSource:
    """统一成一个「图源」：sourcing 直接调用，测试里可以替换。"""

    name = PLATFORM

    def search(self, keyword: str) -> list[Hit]:
        return search(keyword)

    def download(self, url: str) -> bytes:
        return download(url)

    def close(self) -> None:
        return None
