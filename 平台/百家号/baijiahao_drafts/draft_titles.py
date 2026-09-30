"""Stable temporary titles for manuscripts without an explicit title."""
from dataclasses import replace
from datetime import datetime
from pathlib import Path


def draft_article(article):
    title = (article.title or '').strip()
    inferred = any('未找到明确的文章标题' in w for w in getattr(article, 'warnings', []))
    if title and not inferred:
        return article
    # A stable source timestamp keeps retries tied to the same title. The
    # original article fingerprint and file remain unchanged for queue tracking.
    stamp = datetime.fromtimestamp(Path(article.source).stat().st_mtime)
    title = stamp.strftime('%Y%m%d%H%M%S')
    print(f'[标题] 源稿没有明确标题，使用日期时间临时标题：{title}', flush=True)
    return replace(article, title=title)
