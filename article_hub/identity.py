"""Pure, read-only analysis for the article identity migration."""

from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from collections import defaultdict
from typing import Iterable


ARTICLE_ID_FIELD = "文章ID"
ARTICLE_ID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "haoduoyu.local/article-id/v1")
_SHA256_RE = re.compile(r"[0-9a-fA-F]{64}\Z")


def _has_unsafe_control(value: str) -> bool:
    return any(unicodedata.category(character).startswith("C") for character in value)


def _canonical_topic(value) -> tuple[str | None, str | None]:
    """Return a conservative Windows-relative-path key and an issue kind."""
    if value is None:
        return None, "缺失主题"
    if not isinstance(value, str):
        return None, "非法主题"
    if not value.strip():
        return None, "缺失主题"
    if _has_unsafe_control(value):
        return None, "非法主题"

    normalized = unicodedata.normalize("NFKC", value).replace("\\", "/")
    if _has_unsafe_control(normalized):
        return None, "非法主题"
    # Topics are persistent identifiers, not necessarily live filenames: old
    # data legitimately contains titles, URLs, ':' and '?'.  Slash and Win32
    # trailing-dot/space rules are used only to find equivalent identifiers.
    normalized = re.sub(r"/+", "/", normalized).strip("/")
    if not normalized:
        return None, "缺失主题"

    segments = normalized.split("/")
    canonical: list[str] = []
    for segment in segments:
        if not segment or segment in {".", ".."}:
            return None, "可疑主题路径"
        # Win32 silently trims these at every path boundary. Normalize them so
        # two legacy spellings collide, but do not reject a unique old topic.
        segment = segment.rstrip(" .")
        if not segment or segment in {".", ".."}:
            return None, "可疑主题路径"
        canonical.append(segment.casefold())
    return "/".join(canonical), None


def _normalized_fingerprint(value) -> tuple[str | None, str | None]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, "缺失指纹"
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        return None, "非法指纹"
    return value.lower(), None


def _normalized_title(value) -> tuple[str | None, str | None]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, "缺失标题"
    if not isinstance(value, str) or _has_unsafe_control(value):
        return None, "非法标题"
    normalized = unicodedata.normalize("NFKC", value)
    key = re.sub(r"\s+", "", normalized).casefold()
    if not key:
        return None, "缺失标题"
    return key, None


def proposed_article_id(topic: str, fingerprint: str) -> str:
    """Return a deterministic UUIDv5 proposal for one validated legacy row."""
    topic_key, topic_issue = _canonical_topic(topic)
    fingerprint_key, fingerprint_issue = _normalized_fingerprint(fingerprint)
    if topic_issue or fingerprint_issue or topic_key is None or fingerprint_key is None:
        raise ValueError("生成建议文章 ID 需要规范主题和 64 位 SHA-256 指纹")
    return str(uuid.uuid5(ARTICLE_ID_NAMESPACE, topic_key + "\0" + fingerprint_key))


def valid_article_id(value) -> bool:
    """Accept only the canonical lower-case spelling of an existing UUID."""
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        return False
    return str(parsed) == value


def _opaque_reference(value) -> str:
    payload = str(value).encode("utf-8", errors="replace")
    return "#" + hashlib.sha256(payload).hexdigest()[:12]


def _safe_report_text(value, *, limit: int = 80) -> str:
    text = unicodedata.normalize("NFKC", str(value))
    text = "".join(character if not unicodedata.category(character).startswith("C") else "?"
                   for character in text)
    return text[:limit]


def analyze_identity_migration(ledger: dict, scanned: Iterable[dict] = ()) -> dict:
    """Return a migration dry-run report without mutating either input."""
    records = ledger.get("文章") if isinstance(ledger, dict) else None
    if not isinstance(records, dict):
        raise ValueError("台账缺少对象字段“文章”")

    entries: list[dict] = []
    issues: list[dict] = []
    blocked: set[int] = set()

    def labels_for(indices: Iterable[int]) -> list[str]:
        return sorted({entries[index]["label"] for index in indices})

    def add_issue(kind: str, *, indices: Iterable[int] = (), labels: Iterable[str] = (),
                  detail: str) -> None:
        index_set = set(indices)
        blocked.update(index_set)
        issue_labels = sorted(set(labels_for(index_set)) | {str(label) for label in labels})
        issues.append({"类型": kind, "主题": issue_labels, "说明": detail})

    topic_groups: dict[str, list[int]] = defaultdict(list)
    for index, (topic, record) in enumerate(records.items()):
        topic_key, topic_issue = _canonical_topic(topic)
        label = topic if isinstance(topic, str) else f"非法台账主题-{index + 1}"
        entry = {
            "topic": topic,
            "label": label,
            "topic_key": topic_key,
            "record": record,
            "fingerprint": None,
            "title_key": None,
            "article_id": None,
            "id_missing": False,
        }
        entries.append(entry)
        if topic_issue:
            add_issue(topic_issue, indices=[index], detail="主题为空、类型错误或包含不安全路径段")
        elif topic_key is not None:
            topic_groups[topic_key].append(index)

    for group in topic_groups.values():
        if len(group) > 1:
            add_issue("重复主题", indices=group,
                      detail="多个主题在 Unicode/Windows 路径语义下指向同一位置")

    invalid_records = [index for index, entry in enumerate(entries)
                       if not isinstance(entry["record"], dict)]
    if invalid_records:
        add_issue("无效记录", indices=invalid_records, detail="文章记录必须是对象")

    fingerprint_groups: dict[str, list[int]] = defaultdict(list)
    title_groups: dict[str, list[int]] = defaultdict(list)
    id_groups: dict[str, list[int]] = defaultdict(list)
    field_issues: dict[str, list[int]] = defaultdict(list)
    missing_ids = 0

    for index, entry in enumerate(entries):
        record = entry["record"]
        if not isinstance(record, dict):
            continue

        fingerprint, fingerprint_issue = _normalized_fingerprint(record.get("指纹"))
        if fingerprint_issue:
            field_issues[fingerprint_issue].append(index)
        else:
            entry["fingerprint"] = fingerprint
            fingerprint_groups[fingerprint].append(index)

        title_key, title_issue = _normalized_title(record.get("标题"))
        if title_issue:
            field_issues[title_issue].append(index)
        else:
            entry["title_key"] = title_key
            title_groups[title_key].append(index)

        article_id = record.get(ARTICLE_ID_FIELD)
        if article_id in (None, ""):
            entry["id_missing"] = True
            missing_ids += 1
        elif not valid_article_id(article_id):
            field_issues["非法文章ID"].append(index)
        else:
            entry["article_id"] = article_id
            id_groups[article_id].append(index)

    field_details = {
        "缺失指纹": "缺少 64 位 SHA-256 指纹，不能提出稳定 ID",
        "非法指纹": "指纹必须是恰好 64 位的十六进制 SHA-256",
        "缺失标题": "文章缺少非空标题",
        "非法标题": "标题必须是无控制字符的文本",
        "非法文章ID": "已有文章 ID 必须是规范的小写 UUID",
    }
    for kind, indices in field_issues.items():
        add_issue(kind, indices=indices, detail=field_details[kind])

    for kind, groups, detail in (
        ("重复指纹", fingerprint_groups, "多个主题共享同一内容指纹"),
        ("重复标题", title_groups, "多个主题的 Unicode 规范化标题相同"),
        ("重复文章ID", id_groups, "同一文章 ID 被多个台账记录使用"),
    ):
        for group in groups.values():
            if len(group) > 1:
                add_issue(kind, indices=group, detail=detail)

    try:
        scan_items = list(scanned)
    except Exception:
        scan_items = []
        add_issue("无效扫描集合", detail="当前成稿扫描结果不可迭代")

    scan_entries: list[dict] = []
    scan_topic_groups: dict[str, list[int]] = defaultdict(list)
    scan_fingerprint_groups: dict[str, list[int]] = defaultdict(list)
    ledger_by_topic = topic_groups

    for scan_index, item in enumerate(scan_items):
        fallback = f"扫描记录-{scan_index + 1}"
        if not isinstance(item, dict):
            add_issue("无效扫描记录", labels=[fallback], detail="扫描记录必须是对象")
            continue
        topic = item.get("主题")
        topic_key, topic_issue = _canonical_topic(topic)
        label = topic if isinstance(topic, str) and topic else fallback
        fingerprint, fingerprint_issue = _normalized_fingerprint(item.get("指纹"))
        scan_entry = {
            "label": label,
            "topic_key": topic_key,
            "fingerprint": fingerprint,
        }
        scan_entry_index = len(scan_entries)
        scan_entries.append(scan_entry)

        matching = ledger_by_topic.get(topic_key, []) if topic_key is not None else []
        if topic_issue:
            add_issue("扫描" + topic_issue, labels=[fallback],
                      detail="扫描主题为空、类型错误或包含不安全路径段")
        else:
            scan_topic_groups[topic_key].append(scan_entry_index)
        if fingerprint_issue:
            add_issue("扫描" + fingerprint_issue, indices=matching, labels=[label],
                      detail="扫描指纹必须是 64 位十六进制 SHA-256")
        else:
            scan_fingerprint_groups[fingerprint].append(scan_entry_index)

    for group in scan_topic_groups.values():
        if len(group) <= 1:
            continue
        labels = [scan_entries[index]["label"] for index in group]
        topic_key = scan_entries[group[0]]["topic_key"]
        add_issue("扫描重复主题", indices=ledger_by_topic.get(topic_key, []), labels=labels,
                  detail="多个扫描记录在 Windows 路径语义下是同一主题")

    for group in scan_fingerprint_groups.values():
        if len(group) <= 1:
            continue
        labels = [scan_entries[index]["label"] for index in group]
        matching: list[int] = []
        for scan_index in group:
            matching.extend(ledger_by_topic.get(scan_entries[scan_index]["topic_key"], []))
        add_issue("扫描重复指纹", indices=matching, labels=labels,
                  detail="多个扫描主题共享同一内容指纹")

    valid_scan_by_topic = scan_topic_groups
    ledger_topic_keys = set(ledger_by_topic)
    scan_topic_keys = set(valid_scan_by_topic)
    ledger_not_scanned = [
        entries[index]["label"]
        for key in sorted(ledger_topic_keys - scan_topic_keys)
        for index in ledger_by_topic[key]
    ]
    scanned_not_ledger = [
        scan_entries[index]["label"]
        for key in sorted(scan_topic_keys - ledger_topic_keys)
        for index in valid_scan_by_topic[key]
    ]

    fingerprint_mismatches: list[str] = []
    for key in sorted(ledger_topic_keys & scan_topic_keys):
        ledger_group = ledger_by_topic[key]
        scan_group = valid_scan_by_topic[key]
        if len(ledger_group) != 1 or len(scan_group) != 1:
            continue
        ledger_index = ledger_group[0]
        scan_entry = scan_entries[scan_group[0]]
        ledger_fingerprint = entries[ledger_index]["fingerprint"]
        scan_fingerprint = scan_entry["fingerprint"]
        if ledger_fingerprint is None or scan_fingerprint is None:
            continue
        if ledger_fingerprint != scan_fingerprint:
            fingerprint_mismatches.append(entries[ledger_index]["label"])
            add_issue("扫描指纹不一致", indices=[ledger_index],
                      detail="当前成稿与台账指纹不同，不能自动迁移")

    proposals: dict[str, str] = {}
    already_migrated = 0
    for index, entry in enumerate(entries):
        if index in blocked or not isinstance(entry["record"], dict):
            continue
        if entry["article_id"] is not None:
            already_migrated += 1
            continue
        if not entry["id_missing"]:
            continue
        topic = entry["topic"]
        fingerprint = entry["fingerprint"]
        if isinstance(topic, str) and fingerprint is not None:
            proposals[topic] = proposed_article_id(topic, fingerprint)

    return {
        "记录数": len(records),
        "缺失ID": missing_ids,
        "可迁移": len(proposals),
        "有歧义": len(blocked),
        "阻断数": len(issues),
        "已迁移": already_migrated,
        "建议ID": proposals,
        "歧义项": issues,
        "扫描核对": {
            "当前成稿数": len(scan_items),
            "有效扫描数": sum(
                1 for entry in scan_entries
                if entry["topic_key"] is not None and entry["fingerprint"] is not None
            ),
            "历史记录未在当前成稿中": sorted(ledger_not_scanned),
            "当前成稿未在台账中": sorted(scanned_not_ledger),
            "指纹不一致": sorted(fingerprint_mismatches),
        },
    }


def render_identity_report(report: dict) -> str:
    """Render counts and opaque references, never topics or proposed UUIDs."""
    lines = [
        "文章身份只读检查（未写入台账）",
        f"记录 {int(report.get('记录数', 0))}；缺失 ID {int(report.get('缺失ID', 0))}；"
        f"可迁移 {int(report.get('可迁移', 0))}；有歧义 {int(report.get('有歧义', 0))}；"
        f"阻断 {int(report.get('阻断数', 0))}；已迁移 {int(report.get('已迁移', 0))}",
    ]
    for issue in report.get("歧义项", []):
        topics = list(issue.get("主题") or [])
        references = sorted({_opaque_reference(topic) for topic in topics})
        shown = "、".join(references[:5])
        if len(references) > 5:
            shown += f"、另 {len(references) - 5} 项"
        suffix = f"；编号 {shown}" if shown else ""
        lines.append(
            f"[待处理] {_safe_report_text(issue.get('类型', '未知问题'), limit=30)}："
            f"{len(topics)} 项{suffix}（{_safe_report_text(issue.get('说明', ''), limit=100)}）"
        )
    scan = report.get("扫描核对", {})
    lines.append(
        f"当前成稿 {int(scan.get('当前成稿数', 0))}；"
        f"仅历史台账 {len(scan.get('历史记录未在当前成稿中', []))}；"
        f"仅当前成稿 {len(scan.get('当前成稿未在台账中', []))}；"
        f"指纹不一致 {len(scan.get('指纹不一致', []))}"
    )
    return "\n".join(lines)
