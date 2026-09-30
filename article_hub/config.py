"""路径与平台配置。所有路径都可在 data/平台设置.json 中修改。"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
UNFORMATTED = ROOT / "未排版文章"
FORMATTED = ROOT / "已排版文章"
PREVIEW = ROOT / "预览"
DATA = ROOT / "data"
SETTINGS = DATA / "平台设置.json"
PUBLISH_RULES = DATA / "发布规则.json"

DEFAULT_PLATFORMS = {
    "今日头条": {
        "root": str(ROOT / '平台' / '今日头条'),
        "pending": "待发文章",
        "sent": "已发文章",
        "receipts": "data",
    },
    "知乎": {
        "root": str(ROOT / '平台' / '知乎'),
        "pending": "待发文章",
        "sent": "已发文章",
        "receipts": "data",
    },
    "百家号": {
        "root": str(ROOT / '平台' / '百家号'),
        "pending": "待发文章",
        "sent": "已发文章",
        "receipts": "data",
    },
}

# 分发顺序：状态页、标题后缀都按这个顺序显示。
PLATFORM_ORDER = ("知乎", "今日头条", "百家号")

# 标题后缀里的简称，例如「文章A（知乎头条）」「文章B（头条）」。
PLATFORM_SHORT = {"知乎": "知乎", "今日头条": "头条", "百家号": "百家号"}

# 发文时间表的默认规则：一篇稿子先发头条，其他平台隔一段时间再发。
DEFAULT_PUBLISH_RULES = {
    "首发平台": "今日头条",
    "发布时间": "20:00",
    "间隔小时": {"今日头条": 0, "知乎": 24, "百家号": 24},
    "说明": "一篇稿子由首发平台先发，其他平台至少等「间隔小时」小时再发。改这个文件就能改规则。",
}


def ordered_platforms(names) -> list[str]:
    """把平台名按 PLATFORM_ORDER 排好；配置里没有的平台排在后面，不丢。"""
    names = list(names)
    return ([name for name in PLATFORM_ORDER if name in names]
            + [name for name in names if name not in PLATFORM_ORDER])


def platform_marks(names) -> str:
    """平台简称拼起来，例如「知乎头条」；没有就返回空串。"""
    return "".join(PLATFORM_SHORT.get(name, name) for name in ordered_platforms(names))


def title_with_platforms(title: str, names) -> str:
    """标题后面缀上已经分发到的平台，例如「文章A（头条）」。"""
    marks = platform_marks(names)
    return f"{title}（{marks}）" if title and marks else title


def load_publish_rules() -> dict:
    """读取发文规则；文件不存在时写一份默认值，方便用户改。"""
    ensure_directories()
    if not PUBLISH_RULES.exists():
        PUBLISH_RULES.write_text(
            json.dumps(DEFAULT_PUBLISH_RULES, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    try:
        raw = json.loads(PUBLISH_RULES.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    rules = {
        "首发平台": str(raw.get("首发平台") or DEFAULT_PUBLISH_RULES["首发平台"]),
        "发布时间": str(raw.get("发布时间") or DEFAULT_PUBLISH_RULES["发布时间"]),
        "间隔小时": dict(DEFAULT_PUBLISH_RULES["间隔小时"]),
    }
    for name, hours in (raw.get("间隔小时") or {}).items():
        try:
            rules["间隔小时"][str(name)] = int(hours)
        except (TypeError, ValueError):
            continue
    if rules["首发平台"] not in PLATFORM_ORDER:
        rules["首发平台"] = DEFAULT_PUBLISH_RULES["首发平台"]
    return rules


def publish_delay_hours(platform: str, rules: dict | None = None) -> int:
    """这个平台比首发晚多少小时发。"""
    rules = rules or load_publish_rules()
    try:
        return int((rules.get("间隔小时") or {}).get(platform, 24))
    except (TypeError, ValueError):
        return 24


def ensure_directories() -> None:
    for directory in (UNFORMATTED, FORMATTED, PREVIEW, DATA):
        directory.mkdir(parents=True, exist_ok=True)


def load_platforms() -> dict[str, dict[str, Path]]:
    """读取平台目录配置；文件不存在时写入默认值，方便用户改动路径。"""
    ensure_directories()
    if not SETTINGS.exists():
        SETTINGS.write_text(
            json.dumps(DEFAULT_PLATFORMS, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    raw = json.loads(SETTINGS.read_text(encoding="utf-8"))
    platforms: dict[str, dict[str, Path]] = {}
    for name, item in raw.items():
        root = Path(item["root"]).expanduser()
        platforms[name] = {
            "root": root,
            "pending": root / item.get("pending", "待发文章"),
            "sent": root / item.get("sent", "已发文章"),
            "receipts": root / item.get("receipts", "data"),
        }
    return platforms
