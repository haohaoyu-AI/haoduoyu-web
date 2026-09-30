"""百家号地址常量与校验；队列和浏览器共用同一份规则。"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

EDITOR_URL = "https://baijiahao.baidu.com/builder/rc/edit?type=news"
# 2026-09 实测："作品管理"列表页就是草稿箱/作品列表，行内链接形如
# /builder/preview/s?id=<article_id>。
DRAFT_BOX_URL = "https://baijiahao.baidu.com/builder/rc/content"
HOME_URL = "https://baijiahao.baidu.com/builder/rc/home"

_EDIT_PATH = re.compile(r"^/builder/rc/edit/?$")
_ARTICLE_ID = re.compile(r"\d{6,}")


class BrowserError(RuntimeError):
    """A browser operation stopped without claiming that a draft was saved."""


class UrlError(BrowserError, ValueError):
    """The address is not a Baijiahao draft editing address."""


class DraftVerificationError(BrowserError):
    """A draft could not be independently read back with identical content."""


def build_draft_url(article_id: str) -> str:
    return f"https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id={article_id}"


def article_id_of(value: str) -> str | None:
    """Return the article id of a Baijiahao draft editing address, else None."""
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "baijiahao.baidu.com"
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or not _EDIT_PATH.fullmatch(parsed.path)
    ):
        return None
    candidate = (parse_qs(parsed.query).get("article_id") or [""])[0]
    return candidate if _ARTICLE_ID.fullmatch(candidate) else None


def canonical_draft_url(value: str) -> str:
    """Accept only a Baijiahao article editing URL, never an arbitrary destination."""
    article_id = article_id_of(value)
    if article_id is None:
        raise UrlError(f"不是受支持的百家号草稿编辑地址：{value}")
    return build_draft_url(article_id)
