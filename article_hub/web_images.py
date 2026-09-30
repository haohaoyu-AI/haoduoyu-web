"""全网图片搜索适配器。

搜索端读取 Bing 图片搜索页中结果卡片的 ``m`` JSON 属性；下载端对 URL、DNS
结果和每一次重定向做 SSRF 防护。解析函数不依赖网络，便于用保存的页面做回归测试。
"""

from __future__ import annotations

from html import unescape
from html.parser import HTMLParser
import ipaddress
import json
import socket
import urllib.error
import urllib.parse
import urllib.request

from .hits import Hit


PLATFORM = "全网图片"
SEARCH_URL = "https://www.bing.com/images/search"
ASYNC_URL = "https://www.bing.com/images/async"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_SEARCH_BYTES = 8 * 1024 * 1024


class WebImageError(RuntimeError):
    """搜索响应异常、下载不安全，或远端内容不是图片。"""


class _ResultParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.items: list[dict] = []

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        # Bing 当前把每条结果放在 <a class="iusc" m="{...}"> 中。不要依赖
        # class 或属性顺序，页面小改版时仍能解析。
        for name, value in attrs:
            if name.lower() != "m" or not value:
                continue
            try:
                item = json.loads(unescape(value))
            except (TypeError, ValueError):
                continue
            if isinstance(item, dict):
                self.items.append(item)


def _text(value: object) -> str:
    return " ".join(unescape(str(value or "")).split())


def _number(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def parse_hits(html: str, *, query: str = "") -> list[Hit]:
    """解析 Bing 图片搜索 HTML，丢弃无原图地址和重复结果。"""
    parser = _ResultParser()
    parser.feed(html)
    hits: list[Hit] = []
    seen: set[str] = set()
    for item in parser.items:
        image_url = _text(item.get("murl") or item.get("mediaUrl"))
        parsed = urllib.parse.urlsplit(image_url)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            continue
        image_key = image_url.split("?", 1)[0]
        if image_key in seen:
            continue
        seen.add(image_key)
        page_url = _text(item.get("purl") or item.get("hostPageUrl"))
        title = _text(item.get("t") or item.get("title") or item.get("desc"))
        source = _text(item.get("s") or item.get("source"))
        if not source and page_url:
            source = urllib.parse.urlsplit(page_url).hostname or ""
        hits.append(Hit(
            platform=PLATFORM,
            query=query,
            title=title or query,
            source=source,
            image_url=image_url,
            page_url=page_url,
            width=_number(item.get("ow") or item.get("width")),
            height=_number(item.get("oh") or item.get("height")),
        ))
    return hits


def _content_type(headers: object) -> str:
    getter = getattr(headers, "get_content_type", None)
    if callable(getter):
        return str(getter() or "").lower()
    raw = getattr(headers, "get", lambda *_args: "")("Content-Type", "")
    return str(raw).split(";", 1)[0].strip().lower()


def _charset(headers: object) -> str:
    getter = getattr(headers, "get_content_charset", None)
    if callable(getter):
        return str(getter() or "utf-8")
    raw = str(getattr(headers, "get", lambda *_args: "")("Content-Type", ""))
    for part in raw.split(";")[1:]:
        name, _, value = part.partition("=")
        if name.strip().lower() == "charset" and value.strip():
            return value.strip().strip('"')
    return "utf-8"


def search(keyword: str, *, timeout: float = 25.0, page: int = 0) -> list[Hit]:
    """从 Bing 图片搜索中取得候选图。"""
    if type(page) is not int or not 0 <= page <= 20:
        raise WebImageError("图片搜索页码不合法，已停止请求。")
    async_url = ASYNC_URL + "?" + urllib.parse.urlencode(
        {"q": keyword, "first": 1 + page * 35, "count": 35, "adlt": "off"})
    urls = ((SEARCH_URL + "?" + urllib.parse.urlencode({"q": keyword, "form": "HDRSC2"}),
             async_url) if page == 0 else (async_url,))
    errors = []
    for url in urls:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
                "Accept": "text/html,application/xhtml+xml",
                "Referer": urls[0],
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read(MAX_SEARCH_BYTES + 1)
                if len(body) > MAX_SEARCH_BYTES:
                    raise WebImageError("图片搜索页面过大，已停止读取。")
                charset = _charset(response.headers)
            hits = parse_hits(body.decode(charset, "replace"), query=keyword)
            if hits:
                return hits
        except (urllib.error.URLError, TimeoutError, OSError, WebImageError) as exc:
            errors.append(str(exc))
    if len(errors) == len(urls):
        raise WebImageError(f"全网图片搜索「{keyword}」失败：{errors[-1]}")
    return []


def _validate_public_url(url: str) -> str:
    """返回规范化 URL；拒绝可能访问本机或内网的目标。"""
    try:
        parsed = urllib.parse.urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise WebImageError(f"图片地址无效：{url}") from exc
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise WebImageError("图片地址只允许 http/https。")
    if parsed.username is not None or parsed.password is not None:
        raise WebImageError("图片地址不能包含账号信息。")
    host = parsed.hostname.rstrip(".").lower()
    if host == "localhost" or host.endswith(".localhost"):
        raise WebImageError("拒绝访问本机或私有网络地址。")
    try:
        answers = socket.getaddrinfo(host, port or (443 if parsed.scheme == "https" else 80),
                                     type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise WebImageError(f"图片域名无法解析：{host}") from exc
    if not answers:
        raise WebImageError(f"图片域名没有可用地址：{host}")
    for answer in answers:
        raw_ip = answer[4][0].split("%", 1)[0]
        try:
            ip = ipaddress.ip_address(raw_ip)
        except ValueError as exc:
            raise WebImageError(f"图片域名返回了无效地址：{raw_ip}") from exc
        # is_global 同时排除 private/loopback/link-local/reserved/multicast/unspecified。
        if not ip.is_global:
            raise WebImageError("拒绝访问本机或私有网络地址。")
    return urllib.parse.urlunsplit(parsed)


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """urllib 默认自动跟随重定向；在创建下一跳请求前先做同等校验。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        safe_url = _validate_public_url(urllib.parse.urljoin(req.full_url, newurl))
        return super().redirect_request(req, fp, code, msg, headers, safe_url)


def _build_opener():
    return urllib.request.build_opener(_SafeRedirectHandler())


def download(url: str, *, timeout: float = 30.0,
             max_bytes: int = MAX_IMAGE_BYTES) -> bytes:
    """安全下载图片，限制目标网络、内容类型和响应体大小。"""
    if max_bytes <= 0:
        raise ValueError("max_bytes 必须大于 0")
    safe_url = _validate_public_url(url)
    request = urllib.request.Request(
        safe_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
        },
    )
    try:
        with _build_opener().open(request, timeout=timeout) as response:
            # 再验最终 URL，兼容自定义 opener/handler，并防止漏验的跳转实现。
            _validate_public_url(response.geturl())
            content_type = _content_type(response.headers)
            if not content_type.startswith("image/"):
                raise WebImageError(f"下载目标不是图片（Content-Type: {content_type or '未知'}）。")
            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    if int(content_length) > max_bytes:
                        raise WebImageError("图片文件过大，已停止下载。")
                except ValueError:
                    pass
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise WebImageError("图片文件过大，已停止下载。")
            return body
    except WebImageError:
        raise
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise WebImageError(f"图片下载失败：{exc}") from exc


class WebImageSource:
    """与现有图源一致的 ``search / download / close`` 适配器。"""

    name = PLATFORM

    def search(self, keyword: str) -> list[Hit]:
        return search(keyword, page=0)

    def search_page(self, keyword: str, page: int) -> list[Hit]:
        if page <= 0:
            return self.search(keyword)
        return search(keyword, page=page)

    def download(self, url: str) -> bytes:
        return download(url)

    def close(self) -> None:
        return None


# 名称更明确的别名，方便调用方按具体搜索引擎配置。
BingImageSource = WebImageSource
