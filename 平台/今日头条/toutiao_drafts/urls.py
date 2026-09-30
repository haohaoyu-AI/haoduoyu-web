"""今日头条号地址常量与校验；队列和浏览器共用同一份规则。

地址以 2026-09 的头条号后台为准；页面改版后先运行 `06-查看页面结构.cmd`
（probe 命令）把现场结构记到 logs/editor-probe.json，再按记录修这里的选择器。
"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

EDITOR_URL = "https://mp.toutiao.com/profile_v4/graphic/publish"
# 内容管理 → 文章 → 草稿标签；文章列表行内链接形如 /profile_v4/graphic/publish?pgc_id=<id>
DRAFT_BOX_URL = "https://mp.toutiao.com/profile_v4/graphic/articles?tab=draft"
HOME_URL = "https://mp.toutiao.com/profile_v4/index"

_PUBLISH_PATH = re.compile(r"^/profile_v4/graphic/(?:publish|articles)/?$")
_ID_PARAMS = ("pgc_id", "article_id", "item_id", "id")
_ARTICLE_ID = re.compile(r"\d{6,}")


class BrowserError(RuntimeError):
    """A browser operation stopped without claiming that a draft was saved."""


class UrlError(BrowserError, ValueError):
    """The address is not a Toutiao draft editing address."""


class DraftVerificationError(BrowserError):
    """A draft could not be independently read back with identical content."""


def build_draft_url(article_id: str) -> str:
    return f"{EDITOR_URL}?pgc_id={article_id}"


def article_id_of(value: str) -> str | None:
    """Return the article id of a Toutiao draft editing address, else None."""
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "mp.toutiao.com"
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or not _PUBLISH_PATH.fullmatch(parsed.path)
    ):
        return None
    query = parse_qs(parsed.query)
    for name in _ID_PARAMS:
        candidate = (query.get(name) or [""])[0]
        if _ARTICLE_ID.fullmatch(candidate):
            return candidate
    return None


def canonical_draft_url(value: str) -> str:
    """Accept only a Toutiao article editing URL, never an arbitrary destination.

    头条的草稿列表没有可直接复制的带 id 编辑地址，所以这里允许不带 id 的发文页地址；
    真正的「这篇存进去了」由草稿箱回读确认，不靠地址里的 id。
    """
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "mp.toutiao.com"
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or not _PUBLISH_PATH.fullmatch(parsed.path)
    ):
        raise UrlError(f"不是受支持的今日头条草稿编辑地址：{value}")
    article_id = article_id_of(value)
    return build_draft_url(article_id) if article_id else EDITOR_URL
