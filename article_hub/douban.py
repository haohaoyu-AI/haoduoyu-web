# -*- coding: utf-8 -*-
"""豆瓣电影/电视剧图源：搜电影名拿高清海报和剧照。"""
from __future__ import annotations
import re
import urllib.parse
import urllib.request
import html as html_lib
from .hits import Hit

PLATFORM = "豆瓣"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def _fetch(url: str, timeout: float = 20.0) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def search(keyword: str, *, timeout: float = 20.0) -> list[Hit]:
    """搜豆瓣电影，返回海报/剧照候选。"""
    hits: list[Hit] = []
    seen: set[str] = set()
    # 豆瓣电影搜索：cat=1002 是电影
    url = "https://www.douban.com/search?cat=1002&q=" + urllib.parse.quote(keyword)
    try:
        html = _fetch(url, timeout=timeout)
    except Exception as exc:
        raise RuntimeError(f'豆瓣搜索失败：{type(exc).__name__}: {exc}') from exc

    # Search cards supply only posters. Follow movie links to actual stills.
    decoded = urllib.parse.unquote(html_lib.unescape(html))
    subjects = list(dict.fromkeys(re.findall(r'https://movie\.douban\.com/subject/\d+/', decoded)))[:2]
    for subject in subjects:
        album = subject + 'photos?type=S'
        try:
            album_html = _fetch(album, timeout=timeout)
        except Exception:
            continue  # Search-page posters remain usable if the album is unavailable.
        title = re.search(r'<title>(.*?)</title>', album_html, re.S)
        album_title = html_lib.unescape(title.group(1)).strip() if title else ''
        work = re.split(r'\s*(?:剧照|图片|照片|海报|\(豆瓣\)|（豆瓣）)', album_title)[0].strip()
        # Only verified work albums whose real title appears in the query qualify.
        # Do not use a query as image metadata, or unrelated search thumbnails.
        normalize = lambda value: re.sub(r'\W+', '', value).casefold()
        if len(normalize(work)) < 2 or normalize(work) not in normalize(keyword):
            continue
        for image_url in re.findall(r'<img[^>]+src="(https?://img[^\"]*doubanio[^\"]+)"', album_html):
            host = urllib.parse.urlsplit(image_url).hostname or ''
            if not host.endswith('.doubanio.com') or '/photo/' not in image_url:
                continue
            image_url = image_url.replace('/s/public/', '/l/public/').replace('/m/public/', '/l/public/')
            if image_url in seen:
                continue
            seen.add(image_url)
            hits.append(Hit(platform=PLATFORM, source=PLATFORM, query=keyword,
                            title=album_title, image_url=image_url, page_url=album))

    return hits  # Unattributed search-result posters are deliberately excluded.



def download(url: str, *, timeout: float = 20.0) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Referer": "https://www.douban.com/",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


class DoubanSource:
    name = PLATFORM

    def search(self, keyword: str) -> list[Hit]:
        return search(keyword)

    def download(self, url: str) -> bytes:
        return download(url)

    def close(self) -> None:
        return None
