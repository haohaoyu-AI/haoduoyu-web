"""各图源共用的「一条候选图」。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Hit:
    """一条候选图：从哪个平台、按什么词、搜到什么图。"""

    platform: str
    query: str
    title: str
    source: str
    image_url: str
    page_url: str
    width: int = 0
    height: int = 0
    abstract: str = ""
    semantic_approved: bool = False  # Model approved this title for this query/section only.

    cover_approved: bool = False  # Title-level main-subject eligibility, not visual verification.

    @property
    def image_key(self) -> str:
        """去掉签名参数后的图片地址，用来判断是不是同一张图。"""
        return self.image_url.split("?")[0]

    @property
    def landscape(self) -> bool:
        return self.width >= self.height > 0
