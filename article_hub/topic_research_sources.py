"""Read-only evidence adapters for Creator Buddy topic research.

Creator Buddy's global-content-search routes platform requests to several
external tools.  The local app uses its existing sources and a bounded public
Bilibili endpoint instead of assuming those tools are installed on Windows.
Upstream: https://github.com/SpaceZephyr/creator-buddy (MIT, inspected edf46c5).
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from . import topics, xiaohongshu

SOURCES = ("今日头条", "微博", "哔哩哔哩", "小红书")
USER_AGENT = topics.USER_AGENT


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _public_url(value: str) -> str:
    url = urllib.parse.urlsplit(str(value or ""))
    if url.scheme not in {"http", "https"} or not url.netloc:
        return ""
    # xsec_token and similar session parameters belong to the retrieval layer.
    query = [(k, v) for k, v in urllib.parse.parse_qsl(url.query)
             if k.lower() not in {"xsec_token", "token", "access_token", "auth_key", "session"}]
    return urllib.parse.urlunsplit((url.scheme, url.netloc, url.path,
                                    urllib.parse.urlencode(query), ""))


def _row(platform: str, title: str, url: str, *, backend: str,
         origin: str, author: str = "", published_at=None, summary: str = "",
         metrics: dict | None = None, rank=None, query: str = "") -> dict:
    return {"platform": platform, "backend": backend, "origin": origin,
            "title": html.unescape(re.sub(r"<[^>]+>", "", str(title or ""))).strip()[:180],
            "url": _public_url(url), "author": str(author or "").strip()[:90],
            "published_at": published_at, "fetched_at": _now(),
            "summary": str(summary or "").strip()[:1200],
            "material_level": "摘要" if summary else "仅标题",
            "metrics": metrics or {}, "rank": rank, "query": query,
            "snapshot": False}


def source_status() -> list[dict]:
    login = xiaohongshu.saved_login_status()
    return [
        {"name": "今日头条", "state": "ready", "backend": "公开热榜与站内搜索",
         "message": "可尝试读取；是否畅通以本次请求为准"},
        {"name": "微博", "state": "ready", "backend": "公开热搜",
         "message": "可尝试读取；是否畅通以本次请求为准"},
        {"name": "哔哩哔哩", "state": "ready", "backend": "公开热门与视频详情",
         "message": "公开热门可尝试读取；关键词搜索可能限流，以本次请求为准"},
        {"name": "小红书", "state": "ready" if login["status"] == "saved" else "login_required",
         "backend": "已有 Edge 登录会话 · 笔记卡片", "message": login["message"]},
        {"name": "公众号", "state": "unavailable", "backend": "未连接",
         "message": "上游第三方脚本不能安全地直接复用；尚无已验证的数据源"},
        {"name": "抖音", "state": "unavailable", "backend": "未连接",
         "message": "需要单独配置可用的搜索后端"},
    ]


def _json_get(url: str, *, referer: str = "https://www.bilibili.com/", timeout=12) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                               "Referer": referer, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status}")
            payload = response.read(2_000_001)
    except urllib.error.HTTPError as exc:
        if exc.code in {412, 429}:
            raise RuntimeError("平台限制了本次公开接口访问") from exc
        raise RuntimeError(f"HTTP {exc.code}") from exc
    if len(payload) > 2_000_000:
        raise RuntimeError("平台响应过大")
    data = json.loads(payload)
    if data.get("code", 0) != 0:
        raise RuntimeError(f"平台接口返回 {data.get('code')}")
    return data


def _bili_search(query: str, *, limit: int) -> list[dict]:
    url = ("https://api.bilibili.com/x/web-interface/search/type?search_type=video"
           "&keyword=" + urllib.parse.quote(query) + "&page=1&page_size=" + str(min(limit, 30)))
    data = _json_get(url)
    rows = []
    for item in (data.get("data") or {}).get("result") or []:
        bvid = str(item.get("bvid") or "")
        if not re.fullmatch(r"BV[A-Za-z0-9]{10}", bvid):
            continue
        published = item.get("pubdate") or item.get("senddate")
        try:
            published = datetime.fromtimestamp(int(published), timezone.utc).isoformat(timespec="seconds")
        except (TypeError, ValueError, OverflowError):
            published = None
        metrics = {"播放": item.get("play"), "弹幕": item.get("video_review")}
        rows.append(_row("哔哩哔哩", item.get("title"), f"https://www.bilibili.com/video/{bvid}",
                         backend="公开搜索", origin="关键词搜索", author=item.get("author", ""),
                         published_at=published, summary=item.get("description", ""),
                         metrics=metrics, query=query))
    return [row for row in rows if row["title"] and row["url"]][:limit]


def enrich_bili(row: dict) -> dict:
    bvid = re.search(r"/video/(BV[A-Za-z0-9]{10})", row.get("url", ""))
    if not bvid:
        return row
    data = _json_get("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid.group(1))
    item = data.get("data") or {}
    result = dict(row)
    result["summary"] = str(item.get("desc") or result["summary"])[:1200]
    result["material_level"] = "视频简介" if result["summary"] else "仅标题"
    stats = item.get("stat") or {}
    result["metrics"] = {"播放": stats.get("view"), "点赞": stats.get("like"),
                         "收藏": stats.get("favorite"), "评论": stats.get("reply")}
    result["fetched_at"] = _now()
    return result


def _bili_popular(limit: int) -> list[dict]:
    rows = []
    for page in range(1, min(2, (limit + 19) // 20) + 1):
        data = _json_get(f"https://api.bilibili.com/x/web-interface/popular?pn={page}&ps=20")
        for item in (data.get("data") or {}).get("list") or []:
            bvid = str(item.get("bvid") or "")
            if not re.fullmatch(r"BV[A-Za-z0-9]{10}", bvid):
                continue
            published = item.get("pubdate")
            try:
                published = datetime.fromtimestamp(int(published), timezone.utc).isoformat(timespec="seconds")
            except (TypeError, ValueError, OverflowError):
                published = None
            stats = item.get("stat") or {}
            rows.append(_row("哔哩哔哩", item.get("title"),
                             f"https://www.bilibili.com/video/{bvid}",
                             backend="公开热门", origin="热门视频",
                             author=(item.get("owner") or {}).get("name", ""),
                             published_at=published, summary=item.get("desc", ""),
                             metrics={"播放": stats.get("view"), "点赞": stats.get("like"),
                                      "收藏": stats.get("favorite"), "评论": stats.get("reply")},
                             rank=len(rows) + 1))
        if len(rows) >= limit:
            break
    return rows[:limit]


def fetch(platform: str, *, queries: list[str], limit: int = 40,
          cancelled=lambda: False, hint=lambda message: None) -> list[dict]:
    """Fetch actual source material. Errors are passed to the orchestrator."""
    if cancelled():
        return []
    if platform == "今日头条":
        board = topics.fetch_hot_board(limit=limit, timeout=12)
        rows = [_row(platform, item["标题"], item.get("链接", ""), backend="公开热榜",
                     origin="热榜", metrics={"热度": item.get("热度") or None},
                     rank=item.get("排名")) for item in board]
        for query in queries[:2]:
            if cancelled():
                break
            hint(f"正在搜索今日头条：{query}")
            try:
                samples = topics.article_samples(query, limit=6, timeout=12,
                                                 benchmark_name="")
                rows.extend(_row(platform, item.get("标题"), item.get("链接", ""),
                                 backend="站内搜索", origin="关键词搜索",
                                 author=item.get("账号", ""), published_at=item.get("时间"),
                                 metrics={"阅读": item.get("阅读"), "评论": item.get("评论")},
                                 query=query) for item in samples)
            except Exception as exc:
                hint(f"今日头条关键词搜索未完成：{type(exc).__name__}")
        return [row for row in rows if row["title"]]
    if platform == "微博":
        board = topics.fetch_weibo_board(limit=limit, timeout=12)
        return [_row(platform, item["标题"], item.get("链接", ""), backend="公开热搜",
                     origin="热榜", metrics={"热度": item.get("热度") or None},
                     rank=item.get("排名")) for item in board]
    if platform == "哔哩哔哩":
        rows = _bili_popular(limit)
        warning = ""
        for query in queries[:2]:
            if cancelled():
                break
            hint(f"正在搜索哔哩哔哩：{query}")
            try:
                rows.extend(_bili_search(query, limit=min(limit, 20)))
            except Exception as exc:
                warning = f"关键词搜索未完成：{str(exc)[:80]}；已保留实际取得的热门视频"
                hint("B站" + warning)
                break
        if warning:
            for row in rows:
                row["adapter_warning"] = warning
        return rows[:min(60, limit + 20)]
    if platform == "小红书":
        if xiaohongshu.saved_login_status()["status"] != "saved":
            raise RuntimeError("请先在设置中登录小红书")
        rows = []
        with xiaohongshu.XiaohongshuSource(headless=True, wait_ms=12_000, hint=hint) as source:
            for query in queries[:2]:
                if cancelled():
                    break
                hint(f"正在搜索小红书：{query}")
                for hit in source.search(query)[:limit]:
                    rows.append(_row(platform, hit.title, hit.page_url,
                                     backend="已有 Edge 登录会话", origin="关键词搜索",
                                     author=hit.source, query=query))
        return [row for row in rows if row["title"] and row["url"]][:limit]
    raise ValueError("未连接的数据来源")
