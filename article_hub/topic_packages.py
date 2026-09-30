"""Stable topic content packages used before a Word manuscript exists.

New topic packages live in ``未排版文章/<topic_id>/``.  They contain the
writing brief and the exact image-search plan returned by the same model call.
No placeholder document is created: a real Word file is attached explicitly
later and is only read by the local layout pipeline.
"""

from __future__ import annotations

import json
import hashlib
import os
import re
import uuid
from datetime import datetime
from pathlib import Path

from . import config


PACKAGE_FILE = "选题内容包.json"
IMPORT_FILE = "配图清单导入.json"
OUTPUT_IDENTITY_FILE = "选题归属.json"
SCHEMA_VERSION = 1
TOPIC_ID_RE = re.compile(r"^TP-\d{8}-[0-9a-f]{8}$")
PURPOSES = {"cover", "body"}
KEYWORD_TYPES = {"core", "scene", "background"}
SCENE_TERMS = {"训练", "比赛", "采访", "领奖", "活动", "发布会", "舞台",
               "剧照", "海报", "展示", "使用", "生产", "服务",
               "声明", "公告", "新闻报道", "公开资料"}
INFO_MATERIAL_TERMS = {"声明", "公告", "新闻报道", "公开资料"}
_ABSTRACT_QUERY_WORDS = ("意境", "感觉", "氛围感", "象征", "抽象", "体现主题")
_FORBIDDEN_IMAGE_TERMS = (
    "热度", "流量", "关注度", "话题度", "爆笑", "震惊", "感动", "炸裂",
    "值得关注", "引发热议", "冲上热搜", "回应", "透露", "发问", "发声", "喊话",
    "网友", "现场", "片段", "互动", "赛道", "梗",
)
_UNCONFIRMED_MARKERS = ("待核实", "待确认", "可能", "例如", "包括哪些", "未明确", "尚不明确", "不明")
def _normalize_query(value: str) -> str:
    """Normalize spacing/punctuation without changing the named object."""
    value = re.sub(r"[\s，。！？,.!?、；;：:（）()《》【】\[\]“”\"'‘’]+", " ", value)
    return value.strip()


def _grounding_key(value: str) -> str:
    return re.sub(r"[\W_]+", "", value).casefold()


def _has_confirmed_occurrence(query: str, source: str) -> bool:
    """Do not promote an object that appears only beside an uncertainty cue."""
    query_key = _grounding_key(query)
    for clause in re.split(r"[，,。；;！？!?\r\n]+", source):
        clause_key = _grounding_key(clause)
        start = clause_key.find(query_key)
        while start >= 0:
            end = start + len(query_key)
            uncertain_nearby = False
            for marker in _UNCONFIRMED_MARKERS:
                marker_key = _grounding_key(marker)
                marker_start = clause_key.find(marker_key)
                while marker_start >= 0:
                    marker_end = marker_start + len(marker_key)
                    distance = max(0, max(start - marker_end, marker_start - end))
                    if distance <= 12:
                        uncertain_nearby = True
                        break
                    marker_start = clause_key.find(marker_key, marker_start + 1)
                if uncertain_nearby:
                    break
            if not uncertain_nearby:
                return True
            start = clause_key.find(query_key, start + 1)
    return False


def _warning(query, reason: str, *, removed: bool = True) -> dict:
    text = query if isinstance(query, str) else ""
    return {"query": text.strip()[:100], "reason": reason[:200], "removed": removed}


def new_topic_id(when: datetime | None = None) -> str:
    """Return a new opaque ID; titles never participate in package identity."""
    when = when or datetime.now()
    config.UNFORMATTED.mkdir(parents=True, exist_ok=True)
    for _ in range(20):
        value = f"TP-{when:%Y%m%d}-{uuid.uuid4().hex[:8]}"
        if not (config.UNFORMATTED / value).exists():
            return value
    raise OSError("无法分配新的选题编号，请重试")


def _text(value, field: str, *, limit: int, minimum: int = 1,
          multiline: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field}必须是文本")
    text = value.strip()
    allowed = "\t\n\r" if multiline else "\t"
    if (not minimum <= len(text) <= limit
            or any(ord(char) < 32 and char not in allowed for char in text)
            or (not multiline and any(char in text for char in "\r\n"))):
        raise ValueError(f"{field}为空、过长或含控制字符")
    return text


def _validate_writing_parts(data: dict) -> dict:
    """Validate the article prompt independently of the image keyword list."""
    if not isinstance(data, dict):
        raise ValueError("模型结果不是对象")
    angle = _text(data.get("angle"), "写作角度", limit=500, minimum=2)
    prompt = _text(data.get("prompt"), "写文提示词", limit=8000, minimum=30,
                   multiline=True)

    raw_outline = data.get("outline")
    # New four-line briefs deliberately leave article structure to the expert
    # writing team.  Keep the field for schema compatibility; old packages may
    # still carry their former 3—7 section outline.
    if (not isinstance(raw_outline, list)
            or (raw_outline and not 3 <= len(raw_outline) <= 7)):
        raise ValueError("文章大纲必须为空，或包含 3—7 个小节")
    outline = []
    section_ids: set[str] = set()
    for index, item in enumerate(raw_outline, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"大纲第 {index} 节格式错误")
        section_id = _text(item.get("section_id"), f"大纲第 {index} 节编号", limit=40)
        if not re.fullmatch(r"[A-Za-z0-9_-]+", section_id) or section_id in section_ids:
            raise ValueError("大纲小节编号必须唯一，且只能使用字母、数字、下划线或短横线")
        heading = _text(item.get("heading"), f"大纲第 {index} 节标题", limit=100, minimum=2)
        points = item.get("points")
        if not isinstance(points, list) or not 1 <= len(points) <= 8:
            raise ValueError(f"大纲「{heading}」缺少小节要点")
        clean_points = [_text(point, f"大纲「{heading}」要点", limit=300, minimum=2)
                        for point in points]
        section_ids.add(section_id)
        outline.append({"section_id": section_id, "heading": heading, "points": clean_points})
    return {"angle": angle, "outline": outline, "prompt": prompt}


def _filter_generated_plan(raw_plan, *, section_ids: set[str], keyword_source: str) -> tuple[list[dict], list[dict]]:
    """Keep source-grounded core terms and safe, explicitly optional expansions."""
    warnings: list[dict] = []
    if not isinstance(raw_plan, list):
        return [], [_warning("", "图片关键词字段缺失或不是列表")]
    source_key = _grounding_key(keyword_source)
    if not source_key:
        warnings.append(_warning("", "缺少原始热门话题文本，无法核验关键词"))
    plan: list[dict] = []
    seen_queries: set[str] = set()
    seen_ids: set[str] = set()
    seen_orders: set[int] = set()
    core_queries: set[str] = set()
    extension_count = 0
    # Model output is bounded, but cap work on an unexpectedly large list too.
    for index, item in enumerate(raw_plan[:100], start=1):
        shown_query = item.get("query") if isinstance(item, dict) else ""
        if not isinstance(item, dict):
            warnings.append(_warning(shown_query, f"第 {index} 项不是对象"))
            continue
        query_value = item.get("query")
        if not isinstance(query_value, str):
            warnings.append(_warning("", f"第 {index} 项搜图词不是文本"))
            continue
        query = _normalize_query(query_value)
        if (not 2 <= len(query) <= 100
                or any(ord(char) < 32 for char in query)):
            warnings.append(_warning(query, f"第 {index} 项搜图词为空、过短、过长或含控制字符"))
            continue
        if any(term in query for term in _FORBIDDEN_IMAGE_TERMS):
            warnings.append(_warning(query, "包含禁止的抽象、情绪、评论、动作或泛化词"))
            continue
        key = _grounding_key(query)
        if key in seen_queries:
            warnings.append(_warning(query, "与前面的搜图词重复"))
            continue
        keyword_type = item.get("keyword_type", item.get("type", "core"))
        if not isinstance(keyword_type, str) or keyword_type not in KEYWORD_TYPES:
            warnings.append(_warning(query, "关键词类型只能是 core、scene 或 background"))
            continue
        subject_query = item.get("subject_query", "")
        scene_term = item.get("scene_term", "")
        if not isinstance(subject_query, str) or not isinstance(scene_term, str):
            warnings.append(_warning(query, "主体关联或场景类型格式错误"))
            continue
        subject_query = _normalize_query(subject_query)
        scene_term = scene_term.strip()
        if keyword_type == "core":
            if source_key and (key not in source_key or not _has_confirmed_occurrence(query, keyword_source)):
                warnings.append(_warning(query, "核心对象不在原始话题明确内容中，或只出现在待核实表述里"))
                continue
            if not source_key:
                continue
            if len(core_queries) >= 5:
                warnings.append(_warning(query, "核心关键词超过 5 个上限"))
                continue
            enabled = True
            confirmed = False
        elif keyword_type == "scene":
            subject_key = _grounding_key(subject_query)
            expected = _normalize_query(subject_query + " " + scene_term)
            if (not subject_key or subject_key not in core_queries
                    or scene_term not in SCENE_TERMS
                    or _grounding_key(query) != _grounding_key(expected)):
                warnings.append(_warning(query, "主体素材词必须由已确认核心词加一个通用素材方向组成"))
                continue
            enabled = False
            confirmed = False
        else:
            # Background terms are suggestions only. Even a model-provided
            # enabled flag is ignored until a user explicitly confirms it.
            enabled = False
            confirmed = False

        position_id = item.get("position_id", f"image-{len(plan) + 1}")
        if (not isinstance(position_id, str) or not position_id.strip()
                or len(position_id.strip()) > 40
                or not re.fullmatch(r"[A-Za-z0-9_-]+", position_id.strip())
                or position_id.strip() in seen_ids):
            warnings.append(_warning(query, "配图位置编号格式错误或重复"))
            continue
        # Image keywords are search subjects, not cover/body assignments. Ignore
        # historical or model supplied placement labels in the new workflow.
        section_id = item.get("section_id", "")
        if not isinstance(section_id, str):
            warnings.append(_warning(query, "关联小节编号不是文本"))
            continue
        section_id = section_id.strip()
        if section_id and section_id not in section_ids:
            warnings.append(_warning(query, "关联小节编号不存在"))
            continue
        order = item.get("order", index - 1)
        if type(order) is not int or order < 0 or order in seen_orders:
            warnings.append(_warning(query, "图片顺序格式错误或重复"))
            continue
        scene = item.get("scene", "")
        if not isinstance(scene, str):
            warnings.append(_warning(query, "画面说明格式错误"))
            continue
        excludes = item.get("exclude", [])
        if (not isinstance(excludes, list) or len(excludes) > 12
                or any(not isinstance(value, str) or not 2 <= len(value.strip()) <= 120
                       or any(ord(char) < 32 for char in value) for value in excludes)):
            warnings.append(_warning(query, "排除项格式错误"))
            continue
        if keyword_type != "core" and extension_count >= 3:
            warnings.append(_warning(query, "扩展建议超过 3 个上限"))
            continue
        if len(plan) >= 8:
            warnings.append(_warning(query, "核心词和扩展建议合计超过 8 个上限"))
            continue
        clean_id = position_id.strip()
        seen_queries.add(key)
        seen_ids.add(clean_id)
        seen_orders.add(order)
        if keyword_type == "core":
            core_queries.add(key)
        extension_count += keyword_type != "core"
        plan.append({"position_id": clean_id, "purpose": "body",
                     "section_id": section_id, "order": len(plan), "query": query,
                     "scene": scene.strip(), "exclude": [value.strip() for value in excludes],
                     "keyword_type": keyword_type,
                     "subject_query": subject_query if keyword_type == "scene" else "",
                     "scene_term": scene_term if keyword_type == "scene" else "",
                     "enabled": enabled, "user_confirmed": confirmed})
    if len(raw_plan) > 100:
        warnings.append(_warning("", "图片清单过长，仅检查前 100 项"))
    return plan, warnings


def _validate_saved_plan(raw_plan, *, section_ids: set[str], keyword_source: str = "") -> list[dict]:
    if not isinstance(raw_plan, list) or len(raw_plan) > 8:
        raise ValueError("配图清单最多包含 8 个核心词与扩展建议")
    plan = []
    position_ids: set[str] = set()
    orders: set[int] = set()
    queries: set[str] = set()
    core_queries: set[str] = {
        _grounding_key(_normalize_query(item.get("query", "")))
        for item in raw_plan if isinstance(item, dict)
        and item.get("keyword_type", item.get("type", "core")) == "core"
        and isinstance(item.get("query"), str)
        and (not keyword_source or
             item.get("user_confirmed") is True or
             (_grounding_key(_normalize_query(item["query"])) in _grounding_key(keyword_source)
              and _has_confirmed_occurrence(_normalize_query(item["query"]), keyword_source)))
    }
    core_count = extension_count = active_count = active_core_count = 0
    for index, item in enumerate(raw_plan, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"配图清单第 {index} 项格式错误")
        position_id = _text(item.get("position_id", f"image-{index}"),
                             f"配图第 {index} 项编号", limit=40)
        if not re.fullmatch(r"[A-Za-z0-9_-]+", position_id) or position_id in position_ids:
            raise ValueError("配图位置编号必须唯一，且只能使用字母、数字、下划线或短横线")
        purpose = item.get("purpose", "body")
        if not isinstance(purpose, str) or purpose not in PURPOSES:
            raise ValueError(f"配图「{position_id}」用途只能是 cover 或 body")
        order = item.get("order", index - 1)
        if type(order) is not int or order < 0 or order >= len(raw_plan) or order in orders:
            raise ValueError("配图顺序必须是从 0 开始且不重复的整数")
        section_id = item.get("section_id", "")
        if not isinstance(section_id, str):
            raise ValueError(f"配图「{position_id}」的小节编号格式错误")
        section_id = section_id.strip()
        if section_id and section_id not in section_ids:
            raise ValueError(f"配图「{position_id}」引用了不存在的大纲小节")
        query = _text(item.get("query"), f"配图「{position_id}」搜图词", limit=100, minimum=2)
        query = _normalize_query(query)
        if any(term in query for term in _FORBIDDEN_IMAGE_TERMS):
            raise ValueError(f"配图「{position_id}」搜图词含禁止词")
        if query.casefold() in queries:
            raise ValueError("配图清单中不能重复同一条搜图词")
        keyword_type = item.get("keyword_type", item.get("type", "core"))
        if not isinstance(keyword_type, str) or keyword_type not in KEYWORD_TYPES:
            raise ValueError(f"配图「{position_id}」关键词类型错误")
        enabled = item.get("enabled", keyword_type == "core")
        user_confirmed = item.get("user_confirmed", False)
        if type(enabled) is not bool or type(user_confirmed) is not bool:
            raise ValueError(f"配图「{position_id}」启用或确认状态格式错误")
        subject_query = item.get("subject_query", "")
        scene_term = item.get("scene_term", "")
        if not isinstance(subject_query, str) or not isinstance(scene_term, str):
            raise ValueError(f"配图「{position_id}」主体关联或场景类型格式错误")
        subject_query = _normalize_query(subject_query)
        scene_term = scene_term.strip()
        if keyword_type == "core":
            core_count += 1
            active_core_count += enabled
            source_key = _grounding_key(keyword_source)
            if keyword_source and not user_confirmed and (not source_key or _grounding_key(query) not in source_key
                                   or not _has_confirmed_occurrence(query, keyword_source)):
                raise ValueError(f"核心关键词「{query}」不在原始话题的已确认内容中")
            core_queries.add(_grounding_key(query))
        else:
            extension_count += 1
            if enabled and not user_confirmed:
                raise ValueError(f"扩展关键词「{query}」尚未由用户确认，不能启用搜图")
            if keyword_type == "scene":
                expected = _normalize_query(subject_query + " " + scene_term)
                subject_key = _grounding_key(subject_query)
                if (not any(subject_key and subject_key in core_key for core_key in core_queries)
                        or scene_term not in SCENE_TERMS
                        or _grounding_key(query) != _grounding_key(expected)):
                    raise ValueError(f"主体场景词「{query}」没有关联有效核心词或场景类型")
            elif keyword_type == "background" and (subject_query or scene_term):
                raise ValueError(f"背景词「{query}」不能绑定人物或事件场景")
        scene = item.get("scene", "")
        if not isinstance(scene, str):
            raise ValueError(f"配图「{position_id}」画面说明格式错误")
        scene = scene.strip()
        excludes = item.get("exclude")
        if excludes is None:
            excludes = []
        if not isinstance(excludes, list) or len(excludes) > 12:
            raise ValueError(f"配图「{position_id}」排除项格式错误")
        clean_excludes = [_text(value, f"配图「{position_id}」排除项", limit=120, minimum=2)
                          for value in excludes]
        position_ids.add(position_id)
        orders.add(order)
        queries.add(query.casefold())
        active_count += enabled
        # Keep accepting the former marker when reading saved packages, but
        # normalize every new-flow image to an ordinary image position.
        plan.append({"position_id": position_id, "purpose": "body", "section_id": section_id,
                     "order": order, "query": query, "scene": scene,
                     "exclude": clean_excludes, "keyword_type": keyword_type,
                     "subject_query": subject_query if keyword_type == "scene" else "",
                     "scene_term": scene_term if keyword_type == "scene" else "",
                     "enabled": enabled, "user_confirmed": user_confirmed})
    if not 1 <= core_count <= 5:
        raise ValueError("核心关键词必须保留 1—5 个")
    if extension_count > 3:
        raise ValueError("扩展关键词建议不能超过 3 个")
    if orders != set(range(len(raw_plan))):
        raise ValueError("配图顺序须从 0 连续排列")
    if active_count == 0:
        raise ValueError("请至少启用并确认一个图片搜索关键词")
    if active_core_count == 0:
        raise ValueError("至少保留并启用一个核心关键词；扩展词不能替代核心对象")
    plan.sort(key=lambda item: item["order"])
    return plan


def validate_generated_parts(data: dict, *, prompt_generated: bool = False,
                             keyword_source: str | None = None) -> dict:
    """Validate the article strictly and treat generated keywords independently."""
    article = _validate_writing_parts(data)
    if prompt_generated:
        source = str(keyword_source or "")
        plan, warnings = _filter_generated_plan(
            data.get("image_plan"), section_ids={item["section_id"] for item in article["outline"]},
            keyword_source=source)
    else:
        plan = _validate_saved_plan(data.get("image_plan"),
                                    section_ids={item["section_id"] for item in article["outline"]},
                                    keyword_source=str(keyword_source or ""))
        warnings = []
    return {**article, "image_plan": plan, "image_plan_warnings": warnings}


def build(*, topic_id: str, title: str, original_topic: str, generated: dict,
          source: str = "", created_at: datetime | None = None,
          keyword_source: str | None = None) -> dict:
    if not TOPIC_ID_RE.fullmatch(topic_id or ""):
        raise ValueError("选题编号格式错误")
    title = _text(title, "建议标题", limit=120, minimum=1)
    original_topic = _text(original_topic, "原始选题", limit=180, minimum=1)
    source_text = _text(keyword_source or original_topic, "配图关键词来源", limit=1000)
    parts = validate_generated_parts(generated, prompt_generated=True,
                                     keyword_source=source_text)
    reported_warnings = _clean_warnings(generated.get("image_plan_warnings", []))
    parts["image_plan_warnings"] = reported_warnings + parts["image_plan_warnings"]
    now = created_at or datetime.now()
    return {
        "schema_version": SCHEMA_VERSION,
        "status": "ready" if any(item.get("enabled", True) for item in parts["image_plan"]) else "needs_keywords",
        "topic_id": topic_id,
        "title": title,
        "original_topic": original_topic,
        "source": str(source or "")[:1000],
        "image_keyword_source": source_text,
        "created_at": now.isoformat(timespec="seconds"),
        "writing_prompt": parts["prompt"],
        "angle": parts["angle"],
        "outline": parts["outline"],
        "image_plan": parts["image_plan"],
        "keyword_version": 1,
        "image_plan_warnings": parts["image_plan_warnings"],
    }


def folder_for(topic_id: str) -> Path:
    if not TOPIC_ID_RE.fullmatch(topic_id or ""):
        raise ValueError("选题编号格式错误")
    root = config.UNFORMATTED.resolve()
    folder = (root / topic_id).resolve()
    if folder.parent != root:
        raise ValueError("选题内容包目录不合法")
    return folder


def package_identity(folder: Path) -> bool:
    """Return whether a path belongs to the stable-ID workflow.

    The JSON marker is deliberately not the only signal.  If that file is
    missing or damaged, a ``TP-*`` package must fail closed instead of being
    reclassified as a legacy Word draft and sent through full-text analysis.
    """
    folder = Path(folder)
    if TOPIC_ID_RE.fullmatch(folder.name):
        try:
            return folder.resolve().parent == config.UNFORMATTED.resolve()
        except OSError:
            return False
    if folder.name == "原始素材" or re.fullmatch(r"原始素材-\d+", folder.name):
        try:
            if output_identity(folder.parent):
                return True
            return (TOPIC_ID_RE.fullmatch(folder.parent.name) is not None
                    and folder.parent.resolve().parent == config.FORMATTED.resolve())
        except OSError:
            return False
    return False


def output_identity(folder: Path) -> dict | None:
    """Read the stable content-package identity for a new title-named output folder."""
    folder = Path(folder)
    try:
        root = config.FORMATTED.resolve()
        resolved = folder.resolve()
        marker_path = resolved / OUTPUT_IDENTITY_FILE
        if (resolved.parent != root or folder.is_symlink() or not resolved.is_dir()
                or marker_path.is_symlink()):
            return None
        value = json.loads(marker_path.read_text(encoding='utf-8'))
    except (OSError, ValueError, TypeError):
        return None
    if (not isinstance(value, dict) or value.get('schema_version') != 1
            or not isinstance(value.get('topic_id'), str)
            or not TOPIC_ID_RE.fullmatch(value['topic_id'])
            or not isinstance(value.get('title'), str)):
        return None
    return value


def formatted_folder_for(topic_id: str) -> Path | None:
    """Resolve a stable package ID to its title-named output folder."""
    if not isinstance(topic_id, str) or not TOPIC_ID_RE.fullmatch(topic_id):
        return None
    root = config.FORMATTED.resolve()
    if not root.is_dir() or root.is_symlink():
        return None
    for folder in root.iterdir():
        if folder.is_symlink() or not folder.is_dir():
            continue
        identity = output_identity(folder)
        if identity and identity['topic_id'] == topic_id:
            return folder.resolve()
    return None


def is_package(folder: Path) -> bool:
    return Path(folder, PACKAGE_FILE).is_file() or package_identity(folder)


def _validate_identity(payload: dict, expected_id: str | None = None) -> tuple[str, str, str]:
    if (not isinstance(payload, dict)
            or type(payload.get("schema_version")) is not int
            or payload.get("schema_version") != SCHEMA_VERSION):
        raise ValueError("选题内容包版本不受支持")
    topic_id = payload.get("topic_id")
    if not isinstance(topic_id, str) or not TOPIC_ID_RE.fullmatch(topic_id):
        raise ValueError("选题内容包缺少有效编号")
    if expected_id is not None and topic_id != expected_id:
        raise ValueError("选题内容包编号与目录不一致")
    title = _text(payload.get("title"), "内容包标题", limit=120)
    original = _text(payload.get("original_topic"), "内容包原始选题", limit=180)
    return topic_id, title, original


def _clean_warnings(value) -> list[dict]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 100:
        raise ValueError("图片关键词校验说明格式错误")
    result = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("图片关键词校验说明格式错误")
        query = _text(item.get("query", ""), "无效图片关键词", limit=100, minimum=0)
        reason = _text(item.get("reason"), "关键词移除原因", limit=200)
        removed = item.get("removed", True)
        if type(removed) is not bool:
            raise ValueError("关键词移除状态格式错误")
        result.append({"query": query, "reason": reason, "removed": removed})
    return result


def validate_pending(payload: dict, *, expected_id: str | None = None) -> dict:
    topic_id, title, original = _validate_identity(payload, expected_id)
    if payload.get("status") != "needs_keywords":
        raise ValueError("选题内容包状态不是待调整关键词")
    article = _validate_writing_parts({
        "angle": payload.get("angle"), "outline": payload.get("outline"),
        "prompt": payload.get("writing_prompt"),
    })
    warnings = _clean_warnings(payload.get("image_plan_warnings"))
    if not warnings:
        warnings = [_warning("", "没有可用的图片关键词，请手动调整")]
    source = payload.get("image_keyword_source", original)
    source = _text(source, "配图关键词来源", limit=1000)
    plan, warnings = _filter_generated_plan(payload.get("image_plan", []),
                                            section_ids={item["section_id"] for item in article["outline"]},
                                            keyword_source=source)
    if any(item.get("enabled") for item in plan):
        raise ValueError("待调整关键词的内容包不能含已启用的搜图词")
    version = payload.get("keyword_version", 1)
    if type(version) is not int or version < 1:
        raise ValueError("关键词版本格式错误")
    return {**payload, "topic_id": topic_id, "title": title,
            "original_topic": original, "image_keyword_source": source,
            "writing_prompt": article["prompt"], "angle": article["angle"],
            "outline": article["outline"], "image_plan": plan,
            "keyword_version": version,
            "image_plan_warnings": _clean_warnings(payload.get("image_plan_warnings")) + warnings}


def validate(payload: dict, *, expected_id: str | None = None) -> dict:
    topic_id, title, original = _validate_identity(payload, expected_id)
    if payload.get("status") != "ready":
        raise ValueError("选题内容包尚未生成可用的配图清单")
    source = payload.get("image_keyword_source", original)
    source = _text(source, "配图关键词来源", limit=1000)
    generated = validate_generated_parts({
        "angle": payload.get("angle"), "outline": payload.get("outline"),
        "prompt": payload.get("writing_prompt"), "image_plan": payload.get("image_plan"),
    }, keyword_source=source)
    warnings = _clean_warnings(payload.get("image_plan_warnings"))
    version = payload.get("keyword_version", 1)
    if type(version) is not int or version < 1:
        raise ValueError("关键词版本格式错误")
    return {**payload, "title": title, "original_topic": original,
            "topic_id": topic_id, "image_keyword_source": source,
            "writing_prompt": generated["prompt"], "angle": generated["angle"],
            "outline": generated["outline"], "image_plan": generated["image_plan"],
            "keyword_version": version, "image_plan_warnings": warnings}


def _read_package(folder: Path) -> tuple[dict, str]:
    folder = Path(folder)
    path = folder / PACKAGE_FILE
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        if package_identity(folder):
            raise ValueError("选题内容包文件缺失，已停止处理；不会退回全文分析") from exc
        raise ValueError("这个目录没有选题配图计划；旧稿请显式使用原配图流程") from exc
    except (OSError, ValueError) as exc:
        raise ValueError(f"选题内容包无法读取：{exc}") from exc
    # A package starts at ``未排版文章/<topic_id>``.  After local layout the
    # untouched source is archived at
    # ``已排版文章/<topic_id>/原始素材[-N]``; keep validating it against the
    # same stable ID instead of mistaking the archive directory name for an
    # article identity.
    expected_id = folder.name
    if folder.name == "原始素材" or re.fullmatch(r"原始素材-\d+", folder.name):
        identity = output_identity(folder.parent)
        if identity:
            expected_id = identity['topic_id']
        else:
            expected_id = folder.parent.name
    return payload, expected_id


def load_any(folder: Path) -> dict:
    """Read either a searchable package or a writing-ready keyword draft."""
    payload, expected_id = _read_package(folder)
    if isinstance(payload, dict) and payload.get("status") == "needs_keywords":
        return validate_pending(payload, expected_id=expected_id)
    return validate(payload, expected_id=expected_id)


def load(folder: Path) -> dict:
    """Read only an executable image plan; pending keyword packages fail closed."""
    payload = load_any(folder)
    if payload.get("status") != "ready":
        raise ValueError("图片关键词需要调整并确认后才能搜图")
    return payload


def _atomic_write(path: Path, payload: dict) -> None:
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    data = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def is_imported(folder: Path) -> bool:
    """Whether the user explicitly imported this plan into image layout."""
    marker = Path(folder) / IMPORT_FILE
    return marker.is_file() and not marker.is_symlink()


def is_topic_image_export(folder: Path) -> bool:
    """Identify title-named image exports without mistaking them for Word drafts."""
    marker = Path(folder) / "配图文件夹信息.json"
    if not marker.is_file() or marker.is_symlink():
        return False
    try:
        value = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return (isinstance(value, dict)
            and value.get("kind") == "topic-image-export"
            and isinstance(value.get("topic_id"), str)
            and bool(TOPIC_ID_RE.fullmatch(value["topic_id"]))
            and isinstance(value.get("title"), str)
            and isinstance(value.get("images"), list))


def mark_imported(topic_id: str) -> dict:
    """Explicitly add a validated topic package to the image-layout board."""
    folder = folder_for(topic_id)
    package = load(folder)
    marker = {"topic_id": package["topic_id"],
              "imported_at": datetime.now().isoformat(timespec="seconds")}
    _atomic_write(folder / IMPORT_FILE, marker)
    return {"topic_id": package["topic_id"], "title": package["title"],
            "image_count": len(searchable_plan(package))}


def with_confirmed_keywords(payload: dict, values) -> dict:
    """Save explicitly selected terms while retaining IDs for unchanged searches."""
    current = validate_pending(payload) if payload.get("status") == "needs_keywords" else validate(payload)
    if not isinstance(values, (list, tuple)) or not 1 <= len(values) <= 8:
        raise ValueError("请确认 1—8 个核心词与扩展建议")
    plan = []
    seen: set[str] = set()
    old_ids = {(_grounding_key(item["query"]), item.get("keyword_type", "core")): item["position_id"]
               for item in current.get("image_plan", [])}
    old_core_queries = [_normalize_query(item["query"])
                        for item in current.get("image_plan", [])
                        if item.get("keyword_type", "core") == "core"]
    active_count = core_count = extension_count = active_core_count = 0
    core_queries: list[str] = []
    for value in values:
        if isinstance(value, str):
            core_queries.append(_normalize_query(value))
        elif (isinstance(value, dict)
              and value.get("keyword_type", value.get("type", "core")) == "core"
              and isinstance(value.get("query"), str)):
            core_queries.append(_normalize_query(value["query"]))
    for index, value in enumerate(values, start=1):
        item = {"query": value, "keyword_type": "core", "enabled": True} if isinstance(value, str) else value
        if not isinstance(item, dict):
            raise ValueError(f"第 {index} 个图片关键词格式错误")
        query = _text(item.get("query"), f"第 {index} 个图片关键词", limit=100, minimum=2)
        query = _normalize_query(query)
        if len(query) < 2 or any(term in query for term in _FORBIDDEN_IMAGE_TERMS):
            raise ValueError(f"图片关键词「{query}」为空、过短或含禁止词")
        keyword_type = item.get("keyword_type", item.get("type", "core"))
        if not isinstance(keyword_type, str) or keyword_type not in KEYWORD_TYPES:
            raise ValueError(f"图片关键词「{query}」类型无效")
        enabled = item.get("enabled", keyword_type == "core")
        if type(enabled) is not bool:
            raise ValueError(f"图片关键词「{query}」启用状态格式错误")
        key = _grounding_key(query)
        if key in seen:
            raise ValueError("图片关键词不能重复")
        seen.add(key)
        subject_query = item.get("subject_query", "")
        scene_term = item.get("scene_term", "")
        if not isinstance(subject_query, str) or not isinstance(scene_term, str):
            raise ValueError(f"图片关键词「{query}」主体或场景格式错误")
        subject_query = _normalize_query(subject_query)
        scene_term = scene_term.strip()
        if keyword_type == "core":
            core_count += 1
            active_core_count += enabled
            subject_query = ""
            scene_term = ""
        elif keyword_type == "scene":
            if not subject_query:
                for core in sorted(set(core_queries + old_core_queries), key=len, reverse=True):
                    matching_scene = next((term for term in SCENE_TERMS
                                           if _grounding_key(query) == _grounding_key(
                                               _normalize_query(core + " " + term))), "")
                    if matching_scene:
                        subject_query, scene_term = core, scene_term or matching_scene
                        break
            subject_key = _grounding_key(subject_query)
            available_core_keys = {_grounding_key(core) for core in core_queries + old_core_queries}
            if (not any(subject_key and subject_key in core_key for core_key in available_core_keys)
                    or scene_term not in SCENE_TERMS
                    or _grounding_key(query) != _grounding_key(_normalize_query(subject_query + " " + scene_term))):
                    raise ValueError(f"主体素材词「{query}」必须是一个已确认核心词加通用方向，例如“人物 训练”或“人物 声明”")
        else:
            if subject_query or scene_term:
                raise ValueError(f"背景词「{query}」不能绑定人物或事件场景")
        if keyword_type != "core":
            extension_count += 1
        active_count += enabled
        old_id = old_ids.get((_grounding_key(query), keyword_type))
        position_id = old_id or ("kw-" + hashlib.sha256((keyword_type + "\0" + query.casefold()).encode("utf-8")).hexdigest()[:16])
        if any(row["position_id"] == position_id for row in plan):
            position_id = f"{position_id}-{index}"
        plan.append({"position_id": position_id, "purpose": "body",
                     "section_id": "", "order": len(plan), "query": query,
                     "scene": "", "exclude": [], "keyword_type": keyword_type,
                     "subject_query": subject_query if keyword_type == "scene" else "",
                     "scene_term": scene_term if keyword_type == "scene" else "",
                     "enabled": enabled,
                     "user_confirmed": True})
    if not 1 <= core_count <= 5 or extension_count > 3:
        raise ValueError("请保留 1—5 个核心词；扩展建议最多 3 个")
    if active_count == 0:
        raise ValueError("请至少启用一个搜索词；未启用的背景建议不会参与搜图")
    if active_core_count == 0:
        raise ValueError("至少保留并启用一个核心词，避免只按扩展背景词搜图")
    updated = validate({**current, "status": "ready", "image_plan": plan,
                        "keyword_version": int(current.get("keyword_version", 1)) + 1,
                        "image_plan_warnings": [], "image_plan_user_confirmed": True})
    return updated


def searchable_plan(payload: dict) -> list[dict]:
    """Return enabled terms only; legacy entries without flags remain searchable."""
    return [item for item in payload.get("image_plan", [])
            if item.get("enabled", item.get("keyword_type", "core") == "core")]


def markdown_plan(payload: dict) -> str:
    package = validate_pending(payload) if payload.get("status") == "needs_keywords" else validate(payload)
    plan = package.get("image_plan", [])
    core = [item["query"] for item in plan if item.get("keyword_type", "core") == "core"]
    scenes_on = [item["query"] for item in plan if item.get("keyword_type") == "scene" and item.get("enabled")]
    scenes_off = [item["query"] for item in plan if item.get("keyword_type") == "scene" and not item.get("enabled")]
    backgrounds_on = [item["query"] for item in plan if item.get("keyword_type") == "background" and item.get("enabled")]
    backgrounds_off = [item["query"] for item in plan if item.get("keyword_type") == "background" and not item.get("enabled")]
    if not core and not scenes_on and not scenes_off and not backgrounds_on and not backgrounds_off:
        warnings = _markdown_warnings(package.get("image_plan_warnings", []))
        return "关键词：图片关键词需要调整" + ("\n" + warnings if warnings else "")
    lines = ["关键词：" + "｜".join(core)] if core else ["关键词：图片关键词需要调整"]
    if scenes_on:
        lines.append("主体场景词（已启用）：" + "｜".join(scenes_on))
    if scenes_off:
        lines.append("主体场景建议（默认关闭）：" + "｜".join(scenes_off))
    if backgrounds_on:
        lines.append("背景词（已确认启用）：" + "｜".join(backgrounds_on))
    if backgrounds_off:
        lines.append("可选背景词（默认关闭）：" + "｜".join(backgrounds_off))
    warnings = _markdown_warnings(package.get("image_plan_warnings", []))
    if warnings:
        lines.append(warnings)
    return "\n".join(lines)


def commit(payload: dict) -> Path:
    """Publish a newly prepared package without overwriting any existing topic."""
    clean = validate_pending(payload) if payload.get("status") == "needs_keywords" else validate(payload)
    target = folder_for(clean["topic_id"])
    config.UNFORMATTED.mkdir(parents=True, exist_ok=True)
    stage = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    try:
        stage.mkdir()
        _atomic_write(stage / PACKAGE_FILE, clean)
        os.replace(stage, target)
    except Exception:
        if stage.is_dir():
            for child in stage.iterdir():
                if child.is_file():
                    child.unlink(missing_ok=True)
            stage.rmdir()
        raise
    return target


def rollback_new(topic_id: str) -> None:
    """Remove only a just-created, still-empty-of-user-work package."""
    folder = folder_for(topic_id)
    if not folder.is_dir():
        return
    allowed = {PACKAGE_FILE}
    children = list(folder.iterdir())
    if any(not child.is_file() or child.name not in allowed for child in children):
        raise OSError("内容包已经包含其他文件，不能自动回滚")
    for child in children:
        child.unlink()
    folder.rmdir()


def _markdown_warnings(warnings: list[dict]) -> str:
    removed = [item for item in warnings if item.get("removed")]
    if not removed:
        return ""
    return "已移除的关键词：" + "；".join(
        f"{item.get('query') or '（未命名）'}（{item['reason']}）" for item in removed)


def synthetic_document(folder: Path, package_override: dict | None = None):
    """Build in-memory relevance context from the topic and plan, never a fake Word."""
    from .docxio import Block, SourceDocument

    package = validate(package_override) if package_override is not None else load(folder)
    blocks = [Block("p", f"原始热门话题：{package['original_topic']}")]
    labels = {"core": "核心对象", "scene": "主体场景素材", "background": "用户确认的背景素材"}
    for item in searchable_plan(package):
        label = labels.get(item.get("keyword_type", "core"), "素材")
        blocks.append(Block("p", f"{label}：{item['query']}"))
    return SourceDocument(Path(folder) / PACKAGE_FILE, package["title"], blocks, [])


def imported_word(folder: Path) -> Path | None:
    files = sorted(path for path in Path(folder).glob("*.docx")
                   if path.is_file() and not path.name.startswith("~"))
    if len(files) > 1:
        raise ValueError("这个选题内容包里有多份 Word，请只保留一份")
    return files[0] if files else None


def _export_word_files(topic_id: str):
    """Read only direct Word children from the export folder bound to this ID."""
    from . import image_review
    folder = image_review._find_topic_export(topic_id)
    if folder is None:
        return None, [], []
    root = config.UNFORMATTED.resolve()
    resolved = folder.resolve()
    if resolved.parent != root or folder.is_symlink() or not is_topic_image_export(folder):
        raise ValueError('选题图片文件夹关联不安全，已停止读取')
    marker = json.loads((folder / '配图文件夹信息.json').read_text(encoding='utf-8'))
    if marker.get('topic_id') != topic_id:
        raise ValueError('图片文件夹编号与选题不一致')
    words = sorted((path for path in folder.iterdir()
                    if path.is_file() and not path.is_symlink()
                    and path.suffix.lower() == '.docx'
                    and not path.name.startswith(('~$', '.'))
                    and path.name != '原文.docx'
                    and not path.name.casefold().endswith(('_排版定稿.docx', '-排版定稿.docx'))),
                   key=lambda path: path.name.casefold())
    legacy = sorted((path for path in folder.iterdir()
                     if path.is_file() and not path.is_symlink()
                     and path.suffix.lower() == '.doc'
                     and not path.name.startswith(('~$', '.'))),
                    key=lambda path: path.name.casefold())
    return folder, words, legacy


def export_word_status(topic_id: str) -> dict:
    folder, words, legacy = _export_word_files(topic_id)
    return {'folder':str(folder) if folder else '', 'folder_name':folder.name if folder else '',
            'docx_names':[path.name for path in words], 'doc_count':len(words),
            'legacy_doc_count':len(legacy)}


def import_word_from_export(topic_id: str, *, filename: str | None = None) -> dict:
    """Bind the explicitly located title-folder Word to its marked package ID."""
    package_folder = folder_for(topic_id)
    load(package_folder)
    if not is_imported(package_folder):
        raise ValueError('请先在配图页明确导入本选题配图清单')
    export, words, legacy = _export_word_files(topic_id)
    existing = imported_word(package_folder)
    if len(words) > 1 and not filename:
        raise ValueError('对应标题文件夹里有多份 .docx，请在本篇卡片选择要排版的 Word')
    if not words:
        if existing is not None:
            return {'topic_id':topic_id, 'filename':existing.name,
                    'source':'内容包中已绑定的 Word', 'already_imported':True}
        if legacy:
            raise ValueError('检测到旧版 .doc 文件，请先用 Word 另存为 .docx')
        if export is None:
            raise ValueError('本篇图片文件夹还未创建；先保留至少一张图片以生成标题文件夹')
        raise ValueError('标题图片文件夹里没有 .docx；请把对应文章 Word 放入该文件夹')
    if filename:
        if Path(filename).name != filename or filename.startswith(('~$', '.')):
            raise ValueError('所选 Word 文件名不合法')
        source = next((path for path in words if path.name == filename), None)
        if source is None:
            raise ValueError('所选 Word 已不在本篇标题文件夹中，请刷新后重新选择')
    else:
        source = words[0]
    if existing is not None:
        import hashlib
        if hashlib.sha256(existing.read_bytes()).digest() == hashlib.sha256(source.read_bytes()).digest():
            return {'topic_id':topic_id, 'filename':existing.name,
                    'source':str(source), 'already_imported':True}
        raise ValueError('本篇已绑定另一份 Word。为保护原稿，请先确认内容包里的源稿')
    raw = source.read_bytes()
    result = import_word(topic_id, source.name, raw)
    result.update({'source':str(source), 'already_imported':False})
    return result


def import_word(topic_id: str, filename: str, raw: bytes) -> dict:
    """Attach a user-selected Word to this exact package after local validation."""
    folder = folder_for(topic_id)
    package = load(folder)
    if imported_word(folder) is not None:
        raise ValueError("这个选题已经导入过 Word；为避免覆盖原稿，本次未写入")
    if not isinstance(raw, (bytes, bytearray)) or not raw:
        raise ValueError("Word 文件为空")
    if len(raw) > 30 * 1024 * 1024:
        raise ValueError("Word 文件超过 30 MB")
    name = str(filename or "").strip()
    if (not name or Path(name).name != name or Path(name).suffix.lower() != ".docx"
            or len(name) > 160 or re.search(r'[<>:"/\\|?*\x00-\x1f]', name)):
        raise ValueError("请选择文件名正常的 .docx Word 稿")
    target = folder / name
    temporary = folder / f".{uuid.uuid4().hex}.docx"
    try:
        with temporary.open("xb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        from .docxio import read_document
        document = read_document(temporary)
        if not any(block.kind == "p" and block.text.strip() for block in document.blocks):
            raise ValueError("Word 里没有可排版的正文")
        os.replace(temporary, target)
        updated = dict(package)
        updated["word"] = {"filename": name, "imported_at": datetime.now().isoformat(timespec="seconds")}
        try:
            _atomic_write(folder / PACKAGE_FILE, updated)
        except Exception:
            target.unlink(missing_ok=True)
            raise
    finally:
        temporary.unlink(missing_ok=True)
    return {"topic_id": topic_id, "filename": name, "title": document.title,
            "paragraphs": sum(block.kind == "p" for block in document.blocks)}
