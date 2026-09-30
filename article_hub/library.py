"""总库台账：记录每篇稿子的排版、调取和发文状态。"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
import unicodedata
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from html import escape
from pathlib import Path

from . import config, topic_packages
from .docxio import read_document
from .manuscripts import manuscript_files, embedded_image_count
from .storage import (
    LedgerError,
    ledger_file_lock,
    load_ledger_file,
    save_ledger_file,
    validate_ledger,
)

LEDGER = config.DATA / "库.json"
ARCHIVE_MARKER = ".分发归档.json"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def normalise(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip()


def title_key(value: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKC", value).casefold() if ch.isalnum())


def _article_id_key(value) -> str:
    """Return one strict UUID key, or an empty string for an invalid ID."""
    if not isinstance(value, str) or not value:
        return ""
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        return ""
    if str(parsed) != value.lower():
        return ""
    return str(parsed)


def fingerprint(title: str, text: str) -> str:
    canonical = normalise(title) + "\n" + normalise(text)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def dispatched_platforms(record: dict) -> list[str]:
    """这篇稿子到过哪些平台：调取过的和已经有发文回执的都算，按配置顺序排。"""
    sent = record.get("已发", {}) or {}
    names = list(record.get("分发", {}) or {})
    names += [name for name in sent if name not in names]
    return config.ordered_platforms(names)


def platform_completion(record: dict, platform: str) -> str:
    """Only confirmed receipts or actual publication complete image review."""
    receipt = (record.get("已发") or {}).get(platform) or {}
    published = (record.get("发布") or {}).get(platform) or {}
    if published.get("实际") or receipt.get("已公开") or receipt.get("状态") == "published":
        return "已发布"
    if receipt.get("状态") in {"saved_to_draft", "verified", "archived"}:
        return "草稿箱"
    return ""


def image_work_complete(record: dict) -> bool:
    platforms = set(record.get("已发") or {}) | set(record.get("发布") or {})
    return any(platform_completion(record, name) for name in platforms)


def display_title(record: dict) -> str:
    """总库里显示的标题：文章A（知乎头条）。"""
    return config.title_with_platforms(str(record.get("标题", "")), dispatched_platforms(record))


FileVersion = tuple[int, int, int, str]


def _stable_file_version(path: Path) -> FileVersion:
    """Return identity, size and digest only when the path stayed stable."""
    before = path.stat()
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    after = path.stat()
    before_state = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
    after_state = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
    if before_state != after_state:
        raise OSError(f"文件核对期间发生变化：{path}")
    return int(after.st_dev), int(after.st_ino), int(after.st_size), digest.hexdigest()


def _file_signature(path: Path) -> tuple[int, str]:
    version = _stable_file_version(path)
    return version[2], version[3]


def _tree_manifest(root: Path) -> dict[str, tuple]:
    """Return a content manifest used to verify a copied article package."""
    manifest: dict[str, tuple] = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if path.is_dir():
            manifest[relative] = ("directory",)
        elif path.is_file():
            manifest[relative] = ("file", *_file_signature(path))
    return manifest


def _archive_records() -> dict[Path, Path]:
    """Map source folders to committed archive copies.

    A marker lives inside the committed copy, so this remains reliable even
    when Windows prevents us from adding a marker to the locked source folder.
    """
    archive_root = config.ROOT / "已分发归档"
    records: dict[Path, Path] = {}
    if not archive_root.is_dir():
        return records
    for marker in archive_root.rglob(ARCHIVE_MARKER):
        try:
            relative = marker.relative_to(archive_root)
            # Copy stages are hidden folders and are not committed archives.
            if any(part.startswith(".") for part in relative.parts[:-1]):
                continue
            payload = json.loads(marker.read_text(encoding="utf-8"))
            if not payload.get("源目录待清理"):
                continue
            source = Path(str(payload["源目录"])).resolve()
        except (KeyError, OSError, TypeError, ValueError):
            continue
        records[source] = marker.parent
    return records


def _inside_archived_source(path: Path, archived_sources: dict[Path, Path]) -> bool:
    resolved = path.resolve()
    formatted = config.FORMATTED.resolve()
    for parent in (path.parent, *path.parents):
        try:
            current = parent.resolve()
        except OSError:
            continue
        if (parent / ARCHIVE_MARKER).is_file():
            return True
        if current == formatted:
            break
    for source, archive in archived_sources.items():
        if not resolved.is_relative_to(source):
            continue
        archived_file = archive / resolved.relative_to(source)
        if not archived_file.is_file():
            return False
        try:
            return _file_signature(path) == _file_signature(archived_file)
        except OSError:
            # An unreadable file in a pending-cleanup directory is most likely
            # the same open document that prevented cleanup; do not resend it.
            return True
    return False


@dataclass(frozen=True)
class ArchiveResult:
    topic: str
    target: Path
    cleanup_pending: bool = False
    warning: str = ""


def _next_archive_target(archive_root: Path, relative: Path) -> Path:
    target = archive_root / relative
    if not target.exists():
        return target
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate = target.with_name(f"{target.name}_{stamp}")
    index = 2
    while candidate.exists():
        candidate = target.with_name(f"{target.name}_{stamp}_{index}")
        index += 1
    return candidate


def _write_archive_marker(folder: Path, payload: dict) -> None:
    marker = folder / ARCHIVE_MARKER
    temporary = folder / f"{ARCHIVE_MARKER}.tmp"
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(marker)


def cleanup_dispatched_unformatted_duplicates(archive_folders=None) -> dict:
    """Move unformatted copies of already-dispatched source DOCX files to recovery.

    A match requires the source DOCX bytes to match a source DOCX kept inside a
    committed distribution archive. The whole unformatted folder is moved, so
    extra images or review state remain recoverable instead of being discarded.
    With no explicit folders, only archives whose formatted source was already
    cleaned are considered; the dispatch path may pass its newly committed copy.
    """
    archive_root = (config.ROOT / "已分发归档").resolve()
    if archive_folders is None:
        folders = []
        for marker in archive_root.rglob(ARCHIVE_MARKER) if archive_root.is_dir() else ():
            try:
                if marker.is_symlink() or not marker.is_file():
                    continue
                payload = json.loads(marker.read_text(encoding="utf-8"))
                if payload.get("源目录待清理") is False:
                    folders.append(marker.parent)
            except (OSError, TypeError, ValueError):
                continue
    else:
        folders = list(archive_folders)

    source_signatures: dict[tuple[int, str], Path] = {}
    for folder in folders:
        try:
            archive = Path(folder).resolve()
            if (archive == archive_root or not archive.is_relative_to(archive_root)
                    or archive.is_symlink() or not archive.is_dir()):
                continue
            marker = archive / ARCHIVE_MARKER
            if marker.is_symlink() or not marker.is_file():
                continue
            payload = json.loads(marker.read_text(encoding="utf-8"))
            if payload.get("源目录待清理") not in (True, False):
                continue
            for raw in archive.iterdir():
                if (not raw.is_dir() or raw.is_symlink()
                        or not (raw.name == "原始素材" or re.fullmatch(r"原始素材-\d+", raw.name))):
                    continue
                for docx in raw.glob("*.docx"):
                    if docx.is_file() and not docx.is_symlink() and not docx.name.startswith("~"):
                        source_signatures.setdefault(_file_signature(docx), docx)
        except (OSError, TypeError, ValueError):
            continue

    unformatted = config.UNFORMATTED.resolve()
    if not source_signatures or not unformatted.is_dir():
        return {"moved": [], "failed": [], "backup": ""}

    backup = None
    moved = []
    failed = []
    for candidate in unformatted.iterdir():
        try:
            if (candidate.name.startswith(".") or candidate.is_symlink()
                    or not candidate.is_dir() or candidate.resolve().parent != unformatted
                    or topic_packages.is_package(candidate)):
                continue
            docs = [path for path in candidate.glob("*.docx")
                    if path.is_file() and not path.is_symlink() and not path.name.startswith("~")]
            if len(docs) != 1:
                continue
            signature = _file_signature(docs[0])
            archived_docx = source_signatures.get(signature)
            if not archived_docx or _file_signature(docs[0]) != signature:
                continue

            if backup is None:
                backup = (config.DATA / "分发后未排版恢复" /
                          f"{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:8]}")
                backup.mkdir(parents=True, exist_ok=False)
            destination = backup / candidate.name
            if destination.exists():
                destination = backup / f"{candidate.name}-{uuid.uuid4().hex[:8]}"
            candidate.rename(destination)
            moved.append({
                "目录": candidate.name,
                "恢复目录": str(destination),
                "归档原稿": str(archived_docx),
                "原稿SHA256": signature[1],
            })
        except OSError as exc:
            failed.append(f"{candidate.name}：{str(exc)[:160]}")

    if backup is not None and moved:
        try:
            (backup / "恢复清单.json").write_text(
                json.dumps({"清理时间": _now(), "文章": moved}, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        except OSError as exc:
            failed.append(f"恢复清单写入失败：{str(exc)[:160]}")
    elif backup is not None:
        try:
            backup.rmdir()
        except OSError:
            pass
        backup = None
    return {"moved": moved, "failed": failed, "backup": str(backup or "")}


def archive_dispatched_topic(topic: str) -> ArchiveResult:
    """Commit a verified archive copy, then make a best-effort source cleanup.

    Open Word documents can prevent deleting their containing folder on
    Windows. The archive is already complete at that point, so a cleanup lock
    is returned as a warning and markers keep the residue out of later sends.
    """
    formatted = config.FORMATTED.resolve()
    mapped = topic_packages.formatted_folder_for(topic)
    source = (mapped or (config.FORMATTED / topic)).resolve()
    if source == formatted or not source.is_relative_to(formatted):
        raise ValueError("归档目录不在已排版文章中")
    if source.is_symlink() or not source.is_dir():
        raise FileNotFoundError(f"找不到待归档文章目录：{topic}")

    archive_root = config.ROOT / "已分发归档"
    relative = source.relative_to(formatted)
    target = _next_archive_target(archive_root, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = target.parent / f".{target.name}.归档中-{uuid.uuid4().hex}"
    committed = False
    try:
        shutil.copytree(source, stage)
        if _tree_manifest(source) != _tree_manifest(stage):
            raise OSError("归档副本校验失败，源目录已保留")
        marker_payload = {
            "主题": topic,
            "源目录": str(source),
            "归档目录": str(target.resolve()),
            "归档时间": _now(),
            "源目录待清理": True,
        }
        _write_archive_marker(stage, marker_payload)
        stage.replace(target)
        committed = True
    finally:
        if not committed and stage.exists():
            shutil.rmtree(stage, ignore_errors=True)

    cleanup_error = ""
    try:
        shutil.rmtree(source)
    except OSError as exc:
        cleanup_error = str(exc)
    cleanup_pending = source.exists()
    marker_payload["源目录待清理"] = cleanup_pending
    try:
        _write_archive_marker(target, marker_payload)
    except OSError:
        # The committed marker already records a pending cleanup, which is the
        # conservative state needed to prevent a duplicate send.
        pass

    notes = []
    if cleanup_pending:
        note = f"{topic}已分发并归档，源目录待清理；不会重复分发"
        if cleanup_error:
            note += f"（{cleanup_error[:120]}）"
        notes.append(note)
        try:
            _write_archive_marker(source, marker_payload)
        except OSError:
            pass

    residual = cleanup_dispatched_unformatted_duplicates([target])
    if residual["moved"]:
        notes.append(
            f"已把 {len(residual['moved'])} 份与已分发原稿一致的未排版副本移入恢复备份：{residual['backup']}"
        )
    if residual["failed"]:
        notes.append("未能移动的未排版副本：" + "；".join(residual["failed"]))
    return ArchiveResult(topic, target, cleanup_pending, "；".join(notes))


def _new_ledger() -> dict:
    return {"更新": _now(), "文章": {}}


def _load_ledger_unlocked() -> dict:
    config.ensure_directories()
    return load_ledger_file(LEDGER, missing=_new_ledger())


def load_ledger() -> dict:
    """Load a valid ledger; an existing damaged file is never treated as empty."""
    config.ensure_directories()
    with ledger_file_lock(LEDGER):
        return _load_ledger_unlocked()


def _semantic_ledger(data: dict) -> str:
    content = {key: value for key, value in data.items() if key != "更新"}
    return json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _save_ledger_unlocked(data: dict) -> bool:
    """Persist a semantic mutation; timestamp-only churn is a no-op."""
    validate_ledger(data, path=LEDGER)
    if LEDGER.exists():
        current = load_ledger_file(LEDGER, missing=_new_ledger())
        if _semantic_ledger(current) == _semantic_ledger(data):
            if "更新" in current:
                data["更新"] = current["更新"]
            else:
                data.pop("更新", None)
            return False
    data["更新"] = _now()
    save_ledger_file(LEDGER, data)
    return True


def save_ledger(data: dict) -> None:
    config.ensure_directories()
    with ledger_file_lock(LEDGER):
        _save_ledger_unlocked(data)


@contextmanager
def ledger_transaction(*, refresh: bool = False, sync: bool = False) -> Iterator[dict]:
    """Yield the latest ledger under one complete read-modify-write lock.

    ``sync=True`` includes the formatted-file refresh performed by the normal
    receipt sync. A normal exit atomically commits; an exception leaves the
    primary and backup untouched. Code inside the context must mutate the
    yielded object directly and must not call the public load/save functions.
    """
    config.ensure_directories()
    with ledger_file_lock(LEDGER):
        data = _load_ledger_unlocked()
        if refresh or sync:
            _merge_formatted_unlocked(data)
        if sync:
            _sync_receipts_into_unlocked(data)
        try:
            yield data
        except BaseException:
            raise
        else:
            _save_ledger_unlocked(data)


def scan_formatted() -> list[dict]:
    """扫描已排版文章文件夹，返回每篇成稿的信息（不依赖台账）。"""
    articles: list[dict] = []
    if not config.FORMATTED.exists():
        return articles
    archived_sources = _archive_records()
    for docx in manuscript_files(config.FORMATTED):
        if docx.suffix.lower() != '.docx':
            continue
        if _inside_archived_source(docx, archived_sources):
            continue
        # Generated packages retain their source Word files for future review.
        # Those archives are never additional finished manuscripts to send.
        if any((parent.name == '原始素材' or re.fullmatch(r'原始素材-\d+', parent.name))
               and (parent.parent / '配图清单.json').is_file()
               for parent in docx.parents if parent != config.FORMATTED):
            continue
        topic_dir = docx.parent
        manifest_path = topic_dir / "配图清单.json"
        manifest: dict = {}
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                manifest = {}
        title = str(manifest.get("标题") or docx.stem)
        if not manifest.get('标题'):
            try:
                title = read_document(docx).title
            except Exception:
                pass
        relative = docx.relative_to(config.FORMATTED)
        topic = relative.with_suffix('').as_posix()
        if manifest and topic_dir != config.FORMATTED:
            topic = topic_dir.relative_to(config.FORMATTED).as_posix()
        identity = topic_packages.output_identity(topic_dir)
        if identity:
            topic = identity['topic_id']
        articles.append({
            "主题": topic,
            "标题": title,
            "文件夹": topic_dir,
            "成稿": docx,
            "封面": str(manifest.get("封面", "")),
            "配图数": embedded_image_count(docx) or sum(1 for item in manifest.get("配图", []) if item.get("角色") != "未使用"),
            "源文件": str(manifest.get("源文件", "")),
        })
    return articles


def _merge_formatted_unlocked(data: dict, articles: list[dict] | None = None) -> dict:
    """Merge disk manuscripts into an already-loaded ledger."""
    articles = scan_formatted() if articles is None else articles
    for item in articles:
        if item['主题'] in data.get('忽略扫描主题', []):
            continue
        record = data["文章"].setdefault(item["主题"], {})
        record.setdefault("分发", {})
        record.setdefault("已发", {})
        record["主题"] = item["主题"]
        record["标题"] = item["标题"]
        record["成稿"] = str(item["成稿"])
        record["封面"] = item["封面"]
        record["配图数"] = item["配图数"]
        record["分发平台"] = dispatched_platforms(record)
        try:
            document = read_document(item["成稿"])
            text = "\n\n".join(block.text for block in document.blocks if block.kind in {"h2", "h3", "p"})
            record["指纹"] = fingerprint(document.title, text)
            record["正文字数"] = len(text)
        except Exception:
            pass
    return data


def _refresh_ledger_unlocked() -> dict:
    data = _load_ledger_unlocked()
    _merge_formatted_unlocked(data)
    _save_ledger_unlocked(data)
    return data


def refresh_ledger() -> dict:
    """把扫描到的成稿并入台账，保留已有的分发/发文记录。"""
    config.ensure_directories()
    with ledger_file_lock(LEDGER):
        return _refresh_ledger_unlocked()


def _sync_receipts_into_unlocked(data: dict) -> dict:
    platforms = config.load_platforms()
    title_candidates: dict[str, list[dict]] = {}
    id_candidates: dict[str, list[dict]] = {}
    for record in data["文章"].values():
        title = title_key(str(record.get("标题", "")))
        if title:
            title_candidates.setdefault(title, []).append(record)
        article_id = _article_id_key(record.get("文章ID"))
        if article_id:
            id_candidates.setdefault(article_id, []).append(record)
    # A title-only receipt cannot safely choose between two articles. Leave an
    # ambiguous receipt unattached rather than silently assigning it to the
    # last record in dictionary order.
    by_title = {key: records[0] for key, records in title_candidates.items() if len(records) == 1}
    by_id = {key: records[0] for key, records in id_candidates.items() if len(records) == 1}
    for name, paths in platforms.items():
        receipts = paths["receipts"]
        if not receipts.is_dir():
            continue
        for path in sorted(receipts.glob("*.json")):
            try:
                receipt = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if not isinstance(receipt, dict) or receipt.get("platform") not in {name, None}:
                continue
            if "article_id" in receipt:
                # An ID-bearing receipt is never downgraded to title matching:
                # invalid, unknown and duplicate IDs all fail closed.
                record = by_id.get(_article_id_key(receipt.get("article_id")))
            else:
                record = by_title.get(title_key(str(receipt.get("title", ""))))
            if record is None:
                continue
            entry = record.setdefault("已发", {}).setdefault(name, {})
            entry.update({
                "时间": str(receipt.get("verified_at", "")),
                "草稿地址": str(receipt.get("draft_url", "")),
                "状态": str(receipt.get("status", "")),
                "回执": path.name,
                "已公开": bool(receipt.get("publicly_published", False)),
            })
    for record in data["文章"].values():
        record["分发平台"] = dispatched_platforms(record)
    return data


def _current_ledger_unlocked() -> dict:
    data = _load_ledger_unlocked()
    _merge_formatted_unlocked(data)
    return _sync_receipts_into_unlocked(data)


def sync_receipts(data: dict | None = None) -> dict:
    """读取各平台 data 目录里的发文回执，回填「已发」状态。"""
    config.ensure_directories()
    with ledger_file_lock(LEDGER):
        current = _current_ledger_unlocked() if data is None else _sync_receipts_into_unlocked(data)
        _save_ledger_unlocked(current)
        return current


class TitleCollisionError(ValueError):
    """Two different topics would stage to the same title-derived filename."""


def assert_no_title_collisions(data: dict, articles: list[dict] | None = None) -> None:
    """Reject title-derived staging when distinct topics normalize alike."""
    staged_keys = None
    if articles is not None:
        staged_keys = {title_key(str(item.get("标题", ""))) for item in articles}
    titles = {
        str(topic): str(record.get("标题", ""))
        for topic, record in data.get("文章", {}).items()
        if isinstance(record, dict)
    }
    for item in articles or ():
        titles[str(item.get("主题", ""))] = str(item.get("标题", ""))
    groups: dict[str, list[tuple[str, str]]] = {}
    for topic, title in titles.items():
        key = title_key(title)
        if key:
            groups.setdefault(key, []).append((topic, title))
    collisions = [
        members for key, members in groups.items()
        if (staged_keys is None or key in staged_keys)
        and len({topic for topic, _ in members}) > 1
    ]
    if not collisions:
        return
    details = []
    for members in collisions[:5]:
        label = members[0][1]
        topics = "、".join(topic for topic, _title in members)
        details.append(f"《{label}》对应多个主题：{topics}")
    suffix = "；另有更多冲突" if len(collisions) > 5 else ""
    raise TitleCollisionError(
        "检测到规范化标题冲突，已停止分发，未写入待发目录：" + "；".join(details) + suffix
    )


@dataclass
class DispatchResult:
    platform: str
    copied: list[tuple[str, Path]]
    skipped: list[tuple[str, str]]
    # Keep ``copied`` stable for existing callers while carrying the ledger
    # topic that uniquely identifies each copy made in this dispatch round.
    copied_topics: list[tuple[str, str, Path]] = field(default_factory=list)


def _pending_temporary(target: Path) -> Path:
    return target.with_name(f".{target.name}.{uuid.uuid4().hex}.分发中.tmp")


def _same_file_version(path: Path, expected: FileVersion) -> bool:
    try:
        return _stable_file_version(path) == expected
    except (FileNotFoundError, OSError):
        return False


def _unlink_if_version(path: Path, expected: FileVersion) -> bool:
    """Remove a path only while it is still the exact staged file."""
    if not _same_file_version(path, expected):
        return False
    path.unlink()
    return True


def _discard_partial_temporary(path: Path, identity: tuple[int, int] | None) -> None:
    """Best-effort cleanup that cannot delete a replacement at the temp name."""
    if identity is None:
        return
    try:
        version = _stable_file_version(path)
        if version[:2] == identity:
            _unlink_if_version(path, version)
    except (FileNotFoundError, OSError):
        pass


def _write_pending_temporary(source: Path, target: Path) -> tuple[Path, FileVersion]:
    """Write and verify a complete same-directory candidate, never the target."""
    temporary = _pending_temporary(target)
    identity: tuple[int, int] | None = None
    try:
        with source.open("rb") as input_stream, temporary.open("xb") as output_stream:
            opened = os.fstat(output_stream.fileno())
            identity = int(opened.st_dev), int(opened.st_ino)
            shutil.copyfileobj(input_stream, output_stream)
            output_stream.flush()
            os.fsync(output_stream.fileno())
        shutil.copystat(source, temporary)
        version = _stable_file_version(temporary)
        if version[:2] != identity:
            raise OSError("分发临时文件被其他进程替换")
        return temporary, version
    except BaseException:
        _discard_partial_temporary(temporary, identity)
        raise


def _install_new_pending(source: Path, target: Path,
                         source_signature: tuple[int, str]) -> FileVersion:
    temporary, staged = _write_pending_temporary(source, target)
    linked = False
    try:
        if staged[2:] != source_signature:
            raise OSError("成稿在复制期间发生变化，待发文件未安装")
        # A hard-link install is atomic and, unlike os.replace, never overwrites
        # a target that appeared after the initial existence check.
        os.link(temporary, target)
        linked = True
        installed = _stable_file_version(target)
        if installed != staged:
            raise OSError("待发文件安装期间被其他进程替换")
        return installed
    except BaseException:
        if linked:
            try:
                _unlink_if_version(target, staged)
            except OSError:
                pass
        raise
    finally:
        try:
            _unlink_if_version(temporary, staged)
        except OSError:
            pass


def _install_overwritten_pending(source: Path, target: Path, backup: Path,
                                  original: FileVersion,
                                  source_signature: tuple[int, str]) -> FileVersion:
    """Atomically replace an unchanged target, retaining its verified backup."""
    shutil.copy2(target, backup)
    backup_version = _stable_file_version(backup)
    if backup_version[2:] != original[2:] or not _same_file_version(target, original):
        raise OSError("待发文件在备份期间发生变化，已停止覆盖")

    temporary, staged = _write_pending_temporary(source, target)
    try:
        if staged[2:] != source_signature:
            raise OSError("成稿在复制期间发生变化，待发文件未覆盖")
        if not _same_file_version(target, original):
            raise OSError("待发文件在覆盖前被其他进程修改，已保留新版本")
        os.replace(temporary, target)
        installed = _stable_file_version(target)
        if installed != staged:
            raise OSError("待发文件覆盖后又被其他进程修改")
        return installed
    finally:
        try:
            _unlink_if_version(temporary, staged)
        except OSError:
            pass


def _restore_overwritten_pending(target: Path, installed: FileVersion,
                                  backup: Path) -> None:
    """Restore the backup atomically only if our installed version remains."""
    if not _same_file_version(target, installed):
        return
    temporary, staged = _write_pending_temporary(backup, target)
    try:
        if not _same_file_version(target, installed):
            return
        os.replace(temporary, target)
        restored = _stable_file_version(target)
        if restored[2:] != staged[2:]:
            raise OSError("旧待发文件恢复后校验失败")
    finally:
        try:
            _unlink_if_version(temporary, staged)
        except OSError:
            pass


def _rollback_pending_changes(
    changes: list[tuple[Path, FileVersion, Path | None]],
) -> None:
    """Undo only files that remain the exact objects installed this round."""
    failures: list[str] = []
    for target, installed, backup in reversed(changes):
        try:
            if backup is None:
                _unlink_if_version(target, installed)
            else:
                _restore_overwritten_pending(target, installed, backup)
        except OSError as exc:
            failures.append(f"{target.name}：{exc}")
    if failures:
        raise OSError("待发文件回滚失败：" + "；".join(failures))


def dispatch(platform: str, *, only: str | None = None, overwrite: bool = False) -> DispatchResult:
    from .image_review import assert_ready_for_dispatch
    platforms = config.load_platforms()
    if platform not in platforms:
        raise ValueError(f"未知的平台：{platform}；目前支持：{'、'.join(platforms)}")
    paths = platforms[platform]
    config.ensure_directories()
    with ledger_file_lock(LEDGER):
        data = _load_ledger_unlocked()
        articles = scan_formatted()
        _merge_formatted_unlocked(data, articles)
        selected = [item for item in articles if not only or item["主题"] == only]
        # This happens before even creating the pending folder: no ambiguous
        # title-derived filename is allowed to touch platform staging.
        assert_no_title_collisions(data, selected)
        _sync_receipts_into_unlocked(data)

        pending = paths["pending"]
        pending.mkdir(parents=True, exist_ok=True)
        copied: list[tuple[str, Path]] = []
        copied_topics: list[tuple[str, str, Path]] = []
        skipped: list[tuple[str, str]] = []
        changes: list[tuple[Path, FileVersion, Path | None]] = []
        with tempfile.TemporaryDirectory(prefix="分发回滚-", dir=config.DATA) as temporary:
            rollback_dir = Path(temporary)
            try:
                for item in selected:
                    topic, title = item["主题"], item["标题"]
                    record = data["文章"].setdefault(topic, {})
                    if not int(item.get("配图数") or 0):
                        skipped.append((title, "还没配图，跳过（分发只发配好图文的稿子）"))
                        continue
                    try:
                        assert_ready_for_dispatch(item['成稿'])
                    except (ValueError, OSError) as exc:
                        skipped.append((title, str(exc)))
                        continue
                    source = Path(item["成稿"])
                    target = pending / f"{title}.docx"
                    source_signature = _file_signature(source)
                    if target.exists():
                        try:
                            original = _stable_file_version(target)
                            same_version = original[2:] == source_signature
                        except OSError as exc:
                            skipped.append((title, f"无法核对已有待发文件，已保留原文件：{exc}"))
                            continue
                        if not same_version and not overwrite:
                            skipped.append((title, "待发目录已有同名不同版本，已保留原文件；确认后可使用覆盖选项"))
                            continue
                        if not same_version:
                            backup = rollback_dir / f"{len(changes):04d}.bak"
                            installed = _install_overwritten_pending(
                                source, target, backup, original, source_signature
                            )
                            changes.append((target, installed, backup))
                    else:
                        try:
                            installed = _install_new_pending(source, target, source_signature)
                        except FileExistsError:
                            skipped.append((title, "待发目录刚新增同名文件，已保留该文件，请重试"))
                            continue
                        changes.append((target, installed, None))
                    record.setdefault("分发", {})[platform] = {
                        "时间": _now(),
                        "文件": str(target),
                        "成稿": str(source),
                        "标题": title,
                    }
                    record["分发平台"] = dispatched_platforms(record)
                    copied.append((title, target))
                    copied_topics.append((topic, title, target))
                _save_ledger_unlocked(data)
            except BaseException as exc:
                try:
                    _rollback_pending_changes(changes)
                except OSError as rollback_error:
                    raise RuntimeError(
                        f"台账未提交，待发文件自动恢复也失败：{rollback_error}"
                    ) from exc
                raise
        return DispatchResult(platform, copied, skipped, copied_topics)


def status_rows() -> list[dict]:
    data = sync_receipts()
    rows: list[dict] = []
    pending_topics = set()
    if config.UNFORMATTED.exists():
        for path in config.UNFORMATTED.iterdir():
            if not path.is_dir() or path.is_symlink():
                continue
            if topic_packages.is_package(path):
                try:
                    if topic_packages.imported_word(path) is None:
                        # A topic brief is not an unformatted article until a
                        # real Word manuscript has been attached to it.
                        continue
                except ValueError:
                    pass
            pending_topics.add(path.name)
    for topic in sorted(pending_topics):
        if topic not in data["文章"]:
            rows.append({"主题": topic, "标题": "（尚未排版）", "状态": "未排版", "分发": {}, "已发": {}})
    for topic, record in data["文章"].items():
        rows.append({
            "主题": topic,
            "标题": record.get("标题", ""),
            "显示标题": display_title(record),
            "状态": "已排版",
            "分发": record.get("分发", {}),
            "已发": record.get("已发", {}),
            "分发平台": dispatched_platforms(record),
            "配图数": record.get("配图数", 0),
            "成稿": record.get("成稿", ""),
        })
    return rows


def _iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M")


DATE_FORMATS = ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M")
WEEKDAYS = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")


def read_time(value) -> datetime | None:
    """读台账里存的时间；读不出来就当作还没排期。"""
    text = str(value or "").strip()
    if not text:
        return None
    for pattern in DATE_FORMATS:
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue
    return None


def _default_clock(default_time: str) -> tuple[int, int]:
    head, _, tail = str(default_time or "20:00").partition(":")
    if head.strip().isdigit() and tail.strip().isdigit():
        return int(head), int(tail)
    return 20, 0


def parse_when(value, *, default_time: str = "20:00", now: datetime | None = None) -> datetime:
    """把「2026-09-16 20:00」「09-16 20:00」「20:00」「空」解析成时间点。"""
    moment = now or datetime.now()
    text = str(value or "").strip().replace("/", "-").replace("T", " ").replace("：", ":")
    if not text:
        return moment.replace(second=0, microsecond=0)
    hour, minute = _default_clock(default_time)
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%m-%d %H:%M",
                    "%H:%M:%S", "%H:%M", "%m-%d"):
        try:
            parsed = datetime.strptime(text, pattern)
        except ValueError:
            continue
        if pattern in ("%H:%M", "%H:%M:%S"):
            return moment.replace(hour=parsed.hour, minute=parsed.minute, second=0, microsecond=0)
        if pattern == "%m-%d":
            return moment.replace(month=parsed.month, day=parsed.day, hour=hour,
                                  minute=minute, second=0, microsecond=0)
        if pattern == "%m-%d %H:%M":
            return moment.replace(month=parsed.month, day=parsed.day, hour=parsed.hour,
                                  minute=parsed.minute, second=0, microsecond=0)
        if pattern == "%Y-%m-%d":
            return parsed.replace(hour=hour, minute=minute)
        return parsed.replace(second=0, microsecond=0)
    raise ValueError(f"看不懂的时间「{value}」；可以写 2026-09-16 20:00、09-16 20:00 或 20:00。")


def format_when(moment: datetime | None) -> str:
    return "—" if moment is None else moment.strftime("%m-%d %H:%M")


def publish_entry(record: dict, platform: str) -> dict:
    entry = (record.get("发布", {}) or {}).get(platform)
    return entry if isinstance(entry, dict) else {}


def schedule_entries(data: dict | None = None, *, now: datetime | None = None) -> list[dict]:
    """把每篇稿子的计划/实际发布时间摊平成一张按时间排序的表。"""
    data = sync_receipts() if data is None else data
    rules = config.load_publish_rules()
    first = rules["首发平台"]
    moment = now or datetime.now()
    entries: list[dict] = []
    for topic, record in data["文章"].items():
        title = str(record.get("标题", ""))
        head = publish_entry(record, first)
        head_plan, head_actual = read_time(head.get("计划")), read_time(head.get("实际"))
        if head_plan is None and head_actual is None:
            entries.append({"主题": topic, "标题": title, "平台": first, "首发": True,
                            "计划": None, "实际": None, "时间": None, "状态": "未排期"})
            continue
        for platform in config.PLATFORM_ORDER:
            entry = publish_entry(record, platform)
            plan, actual = read_time(entry.get("计划")), read_time(entry.get("实际"))
            is_first = platform == first
            if plan is None and actual is None and not is_first:
                continue
            if actual is not None:
                status = "已发"
            elif plan is None:
                status = "没排期"
            elif not is_first and head_actual is None:
                status = "等首发"
            elif plan <= moment:
                status = "该发了"
            else:
                status = "等到点"
            entries.append({"主题": topic, "标题": title, "平台": platform, "首发": is_first,
                            "计划": plan, "实际": actual, "时间": actual or plan, "状态": status})
    order = {name: index for index, name in enumerate(config.PLATFORM_ORDER)}
    entries.sort(key=lambda item: (item["时间"] is None, item["时间"] or moment,
                                   item["主题"], order.get(item["平台"], len(order))))
    return entries


def schedule_todo(entries: list[dict]) -> tuple[list[str], list[str]]:
    """(到点该发的「平台《标题》」，还没排期的标题)。"""
    due = [f'{item["平台"]}《{item["标题"]}》' for item in entries if item["状态"] == "该发了"]
    unscheduled = [item["标题"] for item in entries if item["状态"] == "未排期"]
    return due, unscheduled


def find_article(data: dict, topic: str) -> tuple[str, dict]:
    """按主题名或标题找一篇稿子。"""
    if topic in data["文章"]:
        return topic, data["文章"][topic]
    wanted = title_key(topic)
    for name, record in data["文章"].items():
        if title_key(str(record.get("标题", ""))) == wanted:
            return name, record
    raise ValueError(f"台账里没有「{topic}」这篇；先排版，或者核对一下主题名（可看 04-查看总库状态）。")


def _next_slots(data: dict, count: int, *, rules: dict, now: datetime,
                start: datetime | None = None) -> list[datetime]:
    """从今天（或下一个空闲日）的发布时间开始，一天排一篇首发。"""
    first = rules["首发平台"]
    if start is None:
        hour, minute = _default_clock(rules["发布时间"])
        start = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if start <= now:
            start += timedelta(days=1)
    taken: list[datetime] = []
    for record in data["文章"].values():
        entry = publish_entry(record, first)
        for key in ("计划", "实际"):
            moment = read_time(entry.get(key))
            if moment is not None:
                taken.append(moment)
    slots: list[datetime] = []
    candidate = start
    while len(slots) < count:
        if not any(abs((candidate - moment).total_seconds()) < 60 for moment in taken):
            slots.append(candidate)
        candidate += timedelta(days=1)
    return slots


def _plan_schedule_unlocked(*, only: str | None = None, first_time=None, start_after=None,
                            reset: bool = False, now: datetime | None = None) -> dict:
    """排期：首发平台按「一天一篇」占位，其他平台隔「间隔小时」小时。"""
    data = _current_ledger_unlocked()
    rules = config.load_publish_rules()
    first = rules["首发平台"]
    moment = now or datetime.now()
    if reset:
        # 重排：只清「计划」，已经登记的实际发布时间不动。
        for record in data["文章"].values():
            for entry in (record.get("发布", {}) or {}).values():
                if isinstance(entry, dict) and not read_time(entry.get("实际")):
                    entry.pop("计划", None)
    start = (parse_when(start_after, default_time=rules["发布时间"], now=moment)
             if start_after else None)
    if only:
        name, record = find_article(data, only)
        slot = (parse_when(first_time, default_time=rules["发布时间"], now=moment)
                if first_time else _next_slots(data, 1, rules=rules, now=moment, start=start)[0])
        targets = [(name, record, slot)]
    else:
        pending: list[tuple[float, str, dict]] = []
        for name, record in data["文章"].items():
            head = publish_entry(record, first)
            if read_time(head.get("计划")) or read_time(head.get("实际")):
                continue
            docx = Path(str(record.get("成稿", "")))
            stamp = docx.stat().st_mtime if str(docx) and docx.exists() else 0.0
            pending.append((stamp, name, record))
        pending.sort(key=lambda item: (item[0], item[1]))
        slots = _next_slots(data, len(pending), rules=rules, now=moment, start=start)
        targets = [(name, record, slot) for (_stamp, name, record), slot in zip(pending, slots)]
    planned: list[dict] = []
    for name, record, slot in targets:
        entry = record.setdefault("发布", {})
        entry.setdefault(first, {})["计划"] = _iso(slot)
        later: list[tuple[str, datetime | None]] = []
        for platform in config.PLATFORM_ORDER:
            if platform == first:
                continue
            other = entry.setdefault(platform, {})
            if read_time(other.get("实际")):
                continue
            target = slot + timedelta(hours=config.publish_delay_hours(platform, rules))
            current = read_time(other.get("计划"))
            if current is None or target > current:
                other["计划"] = _iso(target)
            later.append((platform, read_time(other.get("计划"))))
        planned.append({"主题": name, "标题": record.get("标题", ""),
                        "首发": slot, "后续": later})
    _save_ledger_unlocked(data)
    return {"规则": rules, "排期": planned}


def plan_schedule(*, only: str | None = None, first_time=None, start_after=None,
                  reset: bool = False, now: datetime | None = None) -> dict:
    config.ensure_directories()
    with ledger_file_lock(LEDGER):
        return _plan_schedule_unlocked(only=only, first_time=first_time, start_after=start_after,
                                       reset=reset, now=now)


def _record_publish_unlocked(topic: str, platform: str, when=None, *,
                             now: datetime | None = None) -> dict:
    """登记实际发布时间；首发平台登记后，其他平台的计划往后顺延。"""
    if platform not in config.PLATFORM_ORDER:
        raise ValueError(f"未知的平台：{platform}；目前支持：{'、'.join(config.PLATFORM_ORDER)}")
    data = _current_ledger_unlocked()
    rules = config.load_publish_rules()
    name, record = find_article(data, topic)
    moment = now or datetime.now()
    published = parse_when(when, default_time=rules["发布时间"], now=moment)
    entry = record.setdefault("发布", {}).setdefault(platform, {})
    entry["实际"] = _iso(published)
    result = {"主题": name, "标题": record.get("标题", ""), "平台": platform,
              "时间": published, "后续": []}
    if platform == rules["首发平台"]:
        for other in config.PLATFORM_ORDER:
            if other == rules["首发平台"]:
                continue
            other_entry = record["发布"].setdefault(other, {})
            if read_time(other_entry.get("实际")):
                continue
            target = published + timedelta(hours=config.publish_delay_hours(other, rules))
            current = read_time(other_entry.get("计划"))
            if current is None or target > current:
                other_entry["计划"] = _iso(target)
            result["后续"].append((other, read_time(other_entry.get("计划"))))
    _save_ledger_unlocked(data)
    return result


def record_publish(topic: str, platform: str, when=None, *,
                   now: datetime | None = None) -> dict:
    config.ensure_directories()
    with ledger_file_lock(LEDGER):
        return _record_publish_unlocked(topic, platform, when, now=now)


def write_schedule_page(entries: list[dict] | None = None, *,
                        now: datetime | None = None) -> Path:
    """发文时间表的网页版，放在 预览\\发布时间表.html。"""
    config.PREVIEW.mkdir(parents=True, exist_ok=True)
    rules = config.load_publish_rules()
    moment = now or datetime.now()
    entries = schedule_entries(now=moment) if entries is None else entries
    colours = {"已发": "#0f7b3f", "该发了": "#b4530a", "等到点": "#1767b9",
               "等首发": "#6b7280", "未排期": "#b91c1c", "没排期": "#6b7280"}
    rows = []
    for item in entries:
        if item["实际"] is not None:
            when = format_when(item["实际"]) + " 已发"
        elif item["计划"] is not None:
            when = format_when(item["计划"]) + " " + WEEKDAYS[item["计划"].weekday()]
        else:
            when = "—"
        platform = item["平台"] + ("（首发）" if item["首发"] else "")
        rows.append(
            f'<tr><td class="w">{escape(when)}</td><td>{escape(platform)}</td>'
            f'<td>{escape(item["标题"])}</td>'
            f'<td style="color:{colours.get(item["状态"], "#20252b")}">{escape(item["状态"])}</td></tr>'
        )
    due, unscheduled = schedule_todo(entries)
    tip = []
    if due:
        tip.append("到点该发：" + "、".join(due))
    if unscheduled:
        tip.append(f"还没排期 {len(unscheduled)} 篇，双击 13-给新稿排期.cmd")
    later = [f'{name} 等 {hours} 小时' for name, hours in rules["间隔小时"].items()
             if name != rules["首发平台"]]
    page = (
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>发文时间表</title><style>"
        "body{max-width:960px;margin:40px auto;padding:0 24px;font:17px/1.7 system-ui;color:#20252b}"
        "table{border-collapse:collapse;width:100%}th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:left}"
        "th{font-size:14px;color:#64748b;font-weight:600}.w{white-space:nowrap;font-variant-numeric:tabular-nums}"
        "h1{font-size:24px}p{color:#475569}small{color:#94a3b8}"
        "</style><body><h1>发文时间表</h1>"
        f'<p>首发规则：先发<b>{escape(rules["首发平台"])}</b>；' +
        ("之后 " + "、".join(escape(item) for item in later) + "再发；" if later else "") +
        f'每天 {escape(rules["发布时间"])} 发。表里是计划，实际以「已发」为准。</p>'
        + (f'<p>{escape("；".join(tip))}</p>' if tip else "")
        + '<table><thead><tr><th>时间</th><th>平台</th><th>文章</th><th>状态</th></tr></thead><tbody>'
        + "".join(rows) + "</tbody></table>"
        f'<p><small>生成时间 {moment.strftime("%Y-%m-%d %H:%M")}；'
        "规则在 data\\发布规则.json，台账在 data\\库.json。</small></p>"
        "</body></html>"
    )
    path = config.PREVIEW / "发布时间表.html"
    path.write_text(page, encoding="utf-8")
    return path


def write_index(rows: list[dict]) -> Path:
    config.PREVIEW.mkdir(parents=True, exist_ok=True)
    items = []
    for row in rows:
        if row["状态"] == "未排版":
            items.append(
                f'<li><b>{escape(row["主题"])}</b>'
                f'<small>还没排版：把 Word 和图片放进 未排版文章\\{escape(row["主题"])} 后运行排版</small></li>'
            )
            continue
        folder = config.FORMATTED / row["主题"]
        preview = folder / "预览.html"
        shown = row.get("显示标题") or row["标题"]
        link = f'<a href="{preview.as_uri()}">{escape(shown)}</a>' if preview.exists() else escape(shown)
        marks = []
        if row.get("分发平台"):
            marks.append("已分发 " + "、".join(row["分发平台"]))
        marks.append(f'配图 {row.get("配图数", 0)} 张')
        for name in config.PLATFORM_ORDER:
            if name in row["已发"]:
                marks.append(f'{name} 已入草稿箱')
            elif name in row["分发"]:
                marks.append(f'{name} 待发')
            else:
                marks.append(f'{name} 未调取')
        items.append(
            f"<li>{link}<small>{escape(row['主题'])} · " + " · ".join(marks) + "</small></li>"
        )
    page = (
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>文章总库预览</title><style>"
        "body{max-width:860px;margin:48px auto;padding:0 24px;font:18px/1.8 system-ui;color:#20252b}"
        "li{margin:18px 0}a{color:#1767b9;text-decoration:none;font-weight:600}"
        "small{display:block;color:#64748b;font-size:14px}"
        "</style><body><h1>文章总库</h1>"
        '<p>这里列出已排版成稿和各平台进度。发文时间表见'
        ' <a href="发布时间表.html">发布时间表</a>。</p><ol>'
        + "".join(items) + "</ol></body></html>"
    )
    path = config.PREVIEW / "index.html"
    path.write_text(page, encoding="utf-8")
    return path
