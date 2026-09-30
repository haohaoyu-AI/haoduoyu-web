"""Local image review; selections never delete original images."""
import hashlib
import json
import os
import re
import shutil
import time as _time
import uuid
from datetime import datetime
from functools import lru_cache, wraps
from pathlib import Path

from . import config, library, topic_packages
from .imageops import IMAGE_SUFFIXES
from .storage import ledger_file_lock

SELECTION_FILE = '选图确认.json'
REVIEW_FILE = '图片审阅.json'
EXPORT_STATUS_FILE = '配图自动保存.json'
REVIEW_STATES = {'approved', 'rejected', 'pending'}
_REPLACE_RETRY_DELAYS = (0.025, 0.05, 0.1, 0.2)


def _image_paths(folder: Path) -> list[Path]:
    return [p for p in sorted(folder.iterdir()) if p.is_file() and not p.is_symlink()
            and p.suffix.lower() in IMAGE_SUFFIXES]


def _write_json(path: Path, data: dict) -> None:
    """Durably replace one JSON file without sharing a temporary filename."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    temporary = path.parent / f'.{path.name}.{uuid.uuid4().hex}.tmp'
    try:
        with temporary.open('xb') as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        for delay in (*_REPLACE_RETRY_DELAYS, None):
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if delay is None:
                    raise
                _time.sleep(delay)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def _state_lock_target(path: Path) -> Path:
    """Keep persistent lock files out of article/source directories."""
    identity = os.path.normcase(str(Path(path).resolve())).encode('utf-8')
    return config.DATA / '状态锁' / hashlib.sha256(identity).hexdigest()


def _article_lock_target(topic) -> Path:
    """Map both topic spellings to one opaque, per-article lock target."""
    if isinstance(topic, str):
        name = topic.removeprefix('成稿:')
    else:
        name = repr(topic)
    # Use the prospective unformatted path only as the hash input so
    # ``文章`` and ``成稿:文章`` serialize against the same OS lock. The title
    # itself never appears in the persistent lock filename.
    identity = os.path.normcase(str((config.UNFORMATTED / name).resolve())).encode('utf-8')
    digest = hashlib.sha256(identity).hexdigest()
    return config.DATA / '状态锁' / f'article-{digest}'


def _article_transaction(function):
    """Hold one non-recursive OS lock around a complete article file transaction."""
    @wraps(function)
    def locked(topic, *args, **kwargs):
        with ledger_file_lock(_article_lock_target(topic)):
            return function(topic, *args, **kwargs)
    return locked


def _write_status(path: Path, report: dict) -> None:
    """Serialize a complete progress snapshot with the shared state-file lock."""
    with ledger_file_lock(_state_lock_target(path)):
        _write_json(path, report)


def _read_status(path: Path) -> tuple[float, dict]:
    """Read one progress snapshot under the same lock used by every writer."""
    path = Path(path)
    with ledger_file_lock(_state_lock_target(path)):
        modified = path.stat().st_mtime
        report = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(report, dict):
        raise ValueError('配图进度记录格式错误')
    return modified, report


def _save_review_unlocked(topic: str, folder: Path, states: dict, cover,
                          selection_positions: dict | None = None) -> dict:
    """Merge and persist review state; caller owns the per-topic file lock."""
    current = load_review(folder)
    merged = dict(current['states'])
    for name, state in states.items():
        if not isinstance(name, str) or not isinstance(state, str) or state not in REVIEW_STATES:
            raise ValueError('图片审阅状态不合法')
        if image_path(topic, name).name != name or name not in merged:
            raise ValueError('请使用本篇文章的图片文件名')
        merged[name] = state
    package_workflow = topic_packages.is_package(folder)
    if package_workflow:
        # New topic packages have no cover slot. Preserve an existing valid
        # legacy value for compatibility, but never create or move one.
        cover = current['cover'] if merged.get(current['cover']) == 'approved' else ''
    else:
        if cover is None:
            cover = current['cover'] if merged.get(current['cover']) == 'approved' else ''
        elif not isinstance(cover, str) or (cover and merged.get(cover) != 'approved'):
            raise ValueError('封面必须是已通过的图片')
        if not cover:
            cover = next((name for name, state in merged.items() if state == 'approved'), '')
    changed = merged != current['states'] or cover != current['cover']
    review = {'states': merged, 'cover': cover,
              'revision': current['revision'] + (1 if changed or not (folder / REVIEW_FILE).exists() else 0),
              'needs_layout': current['needs_layout'] or changed}
    selected = _approved_names(review, folder)
    positions = (selection_positions if selection_positions is not None else
                 {name: value for name, value in load_positions(folder).items() if name in selected})
    _write_json(folder / REVIEW_FILE, review)
    _write_json(folder / SELECTION_FILE, {'保留图片': selected, '图片位置': positions})
    return review


def load_review(folder: Path) -> dict:
    """Return current review state without treating legacy selections as approval."""
    names = [path.name for path in _image_paths(folder)]
    path = folder / REVIEW_FILE
    if not path.exists():
        return {'states': {name: 'pending' for name in names}, 'cover': '',
                'revision': 0, 'needs_layout': True}
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or not isinstance(data.get('states'), dict):
        raise ValueError('图片审阅记录格式错误，请重新审阅')
    states = data['states']
    if any(not isinstance(name, str) or not isinstance(state, str) or state not in REVIEW_STATES
           for name, state in states.items()):
        raise ValueError('图片审阅状态不合法')
    revision = data.get('revision', 0)
    if type(revision) is not int or revision < 0 or type(data.get('needs_layout')) is not bool:
        raise ValueError('图片审阅版本格式错误')
    cover = data.get('cover', '')
    if not isinstance(cover, str):
        raise ValueError('封面图片格式错误')
    current = {name: states.get(name, 'pending') for name in names}
    if current.get(cover) != 'approved':
        cover = ''
    return {'states': current, 'cover': cover, 'revision': revision,
            'needs_layout': data['needs_layout'] or set(current) != set(states)}


def _approved_names(review: dict, folder: Path | None = None) -> list[str]:
    approved = [name for name, state in review['states'].items() if state == 'approved']
    if folder is not None:
        try:
            manifest = json.loads((Path(folder) / '配图清单.json').read_text(encoding='utf-8'))
            order = {item.get('原始文件名'): item.get('计划顺序', item.get('顺序', 10_000))
                     for item in manifest.get('配图', []) if isinstance(item, dict)}
            approved.sort(key=lambda name: (order.get(name, 10_000), name.casefold()))
        except (OSError, ValueError, TypeError):
            pass
    cover = review.get('cover')
    if folder is not None and topic_packages.is_package(Path(folder)):
        return approved
    return ([cover] + [name for name in approved if name != cover]) if cover in approved else approved


def assert_ready_for_dispatch(finished: Path) -> None:
    """Protect reviewed articles using their actual output path, not their title.

    Historical manuscripts without an explicit review record keep working. For
    generated packages, the newest source archive is the active review source;
    older archived review files do not veto a newer completed version.
    """
    finished = Path(finished).resolve()
    root = config.FORMATTED.resolve()
    if not finished.is_relative_to(root) or finished.parent == root:
        return  # Loose manual files have no unambiguous per-article source folder.
    folder = finished.parent
    sources = []
    if folder.is_dir():
        archives = [p for p in folder.iterdir() if p.is_dir() and not p.is_symlink()
                    and (p.name == '原始素材' or p.name.startswith('原始素材-')
                         and p.name.removeprefix('原始素材-').isdigit())]
        if archives:
            sources.append(max(archives, key=lambda p: int(p.name.split('-')[-1]) if '-' in p.name else 1))
        else:
            sources.append(folder)
    # A replacement source may be under review while the previous output is
    # intentionally retained. Pair it by package path, never by display title.
    if (folder / '配图清单.json').is_file():
        pending = (config.UNFORMATTED / folder.relative_to(root)).resolve()
        if pending.is_relative_to(config.UNFORMATTED.resolve()) and pending.is_dir() and not pending.is_symlink():
            sources.append(pending)
    for source in sources:
        if not (source / REVIEW_FILE).is_file():
            continue
        review = load_review(source)
        package_source = topic_packages.is_package(source)
        if 'pending' in review['states'].values() and not package_source:
            raise ValueError('图片尚未全部审阅，请先打钩或打叉，再生成成稿后发送')
        approved = _approved_names(review, source)
        if not approved:
            raise ValueError('尚无通过审阅的图片，请先选图并生成成稿后发送')
        if review['needs_layout']:
            raise ValueError('配图审阅已修改，请先用已通过图片重新生成成稿，避免发送旧版')


def save_review(topic: str, states: dict, cover=None) -> dict:
    """Persist explicit decisions; missing keys keep their previous state."""
    ensure_editable(topic)
    if not isinstance(states, dict):
        raise ValueError('图片审阅状态必须是对象')
    folder = topic_path(topic)
    # Keep the full read/merge/write sequence under one process and OS lock.
    # _write_json deliberately does not lock again: Windows byte locks are not
    # safely re-entrant even though the in-process RLock is.
    with ledger_file_lock(_state_lock_target(folder / REVIEW_FILE)):
        result = _save_review_unlocked(topic, folder, states, cover)
    if topic_packages.is_package(folder):
        result['export_sync'] = sync_topic_package_export(topic)
    return result


def save_candidate_review(topic: str, names: list[str], *, replace_image: str = '') -> dict:
    """Install new candidates as pending and retire a replaced image atomically.

    Image files and the manifest are committed by ``image_actions`` around this
    state write.  Keeping the review transition in one locked merge prevents a
    successful candidate from being paired with a stale approval decision.
    """
    ensure_editable(topic)
    if not names or not all(isinstance(name, str) and name for name in names):
        raise ValueError('请提供新的候选图片')
    folder = topic_path(topic)
    states = {name: 'pending' for name in names}
    if replace_image:
        states[replace_image] = 'rejected'
    with ledger_file_lock(_state_lock_target(folder / REVIEW_FILE)):
        return _save_review_unlocked(
            topic, folder, states, None,
        )


def workflow_phase(review: dict, *, target: int, formatted: bool = False) -> str:
    """Return the one stable image-workflow phase consumed by callers/UI.

    ``target`` is the article's suggested plan.  It never gates finalization:
    the user may keep however many pictures they like, as long as at least one
    is approved and no candidate is still undecided.
    """
    states = review.get('states', {})
    approved = sum(state == 'approved' for state in states.values())
    pending = sum(state == 'pending' for state in states.values())
    if formatted and not review.get('needs_layout', True):
        return 'finalized'
    if pending:
        return 'review'
    if approved:
        return 'ready'
    return 'needs_images'


def topic_path(topic: str) -> Path:
    if not isinstance(topic, str) or not topic:
        raise ValueError('文章目录不合法')
    if topic.startswith('成稿:'):
        name = topic[3:]
        root = config.FORMATTED.resolve()
        mapped = topic_packages.formatted_folder_for(name) if topic_packages.TOPIC_ID_RE.fullmatch(name) else None
        folder = mapped or (root / name).resolve()
        if folder.parent != root or not folder.is_dir():
            raise ValueError('成稿目录不存在')
        archives = [p for p in folder.glob('原始素材*') if p.is_dir() and not p.is_symlink() and
                    (p.name == '原始素材' or p.name.removeprefix('原始素材-').isdigit())]
        if not archives:
            raise ValueError('没有可供调整的原始素材')
        return max(archives, key=lambda p: int(p.name.split('-')[-1]) if '-' in p.name else 1)
    root = config.UNFORMATTED.resolve()
    path = (root / topic).resolve()
    if path.parent != root or not path.is_dir():
        raise ValueError('文章目录不存在或不在未排版文章内')
    return path


def source_document(folder):
    folder = Path(folder)
    if topic_packages.is_package(folder):
        topic_packages.load(folder)  # package identity never degrades to legacy Word analysis
        return topic_packages.synthetic_document(folder)
    files = [p for p in folder.glob('*.docx') if not p.name.startswith('~')]
    if len(files) != 1:
        raise ValueError('需要一份源稿才能调整图片位置')
    stat = files[0].stat()
    return _read_source_document(str(files[0]), stat.st_mtime_ns, stat.st_size)


def target_count(folder: Path) -> int:
    """Return the persisted per-article plan, or derive it from the source."""
    from . import sourcing
    folder = Path(folder)
    if topic_packages.is_package(folder):
        return max(1, len(topic_packages.searchable_plan(topic_packages.load(folder))))
    try:
        manifest = json.loads((folder / sourcing.MANIFEST_FILE).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        manifest = {}
    return sourcing.resolved_target_count(source_document(folder), manifest)


@lru_cache(maxsize=32)
def _read_source_document(path, modified, size):
    from .docxio import read_document
    return read_document(Path(path))


def load_positions(folder):
    path = folder / SELECTION_FILE
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding='utf-8'))
    positions = data.get('图片位置', {})
    if not isinstance(positions, dict):
        raise ValueError('图片位置格式错误')
    return positions


def image_path(topic: str, name: str) -> Path:
    if not isinstance(name, str) or not name or '/' in name or '\\' in name:
        raise ValueError('图片文件名不合法')
    root = topic_path(topic)
    path = (root / name).resolve()
    if path.parent != root or path.suffix.lower() not in IMAGE_SUFFIXES or not path.is_file() or (root / name).is_symlink():
        raise ValueError('图片不存在或路径不合法')
    return path


def load_selection(folder: Path):
    if (folder / REVIEW_FILE).exists():
        return _approved_names(load_review(folder), folder)
    path = folder / SELECTION_FILE
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding='utf-8'))
    names = data.get('保留图片')
    if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
        raise ValueError('选图确认文件格式错误，请重新确认图片')
    return names


def ensure_editable(topic: str) -> None:
    name = topic.removeprefix('成稿:')
    record = library.load_ledger()['文章'].get(name, {})
    if library.image_work_complete(record):
        raise ValueError('这篇文章已进入草稿箱或已发布，配图排版已完成，无需再次调整。')


def save_selection(topic: str, names: list[str], positions=None) -> Path | None:
    ensure_editable(topic)
    if not isinstance(names, list) or not names or not all(isinstance(n, str) for n in names):
        raise ValueError('请至少保留一张图片')
    if len(names) != len(set(names)):
        raise ValueError('图片不能重复')
    folder = topic_path(topic)
    if topic_packages.is_package(folder):
        current = load_review(folder)
        if any(current['states'].get(name) != 'approved' for name in names):
            raise ValueError('新版选题图片必须先逐张点击保留，再由系统自动同步；待选状态不会被改写')
        # Do not turn unlisted pending candidates into rejected decisions.
        result = sync_topic_package_export(topic)
        if not result.get('ok'):
            raise ValueError(result.get('error') or '标题文件夹同步失败')
        return Path(result['folder_path']) if result.get('folder_path') else None
    for name in names:
        if image_path(topic, name).name != name:
            raise ValueError('请使用图片文件名')
    if positions is None:
        positions = {name: value for name, value in load_positions(folder).items() if name in names}
    if not isinstance(positions, dict):
        raise ValueError('图片位置格式错误')
    if positions:
        document = source_document(folder)
        for name, position in positions.items():
            if name not in names or type(position) is not int or not 0 <= position < len(document.blocks) or document.blocks[position].kind != 'p':
                raise ValueError('图片必须放在所选正文段落后')
        if len(set(positions.values())) != len(positions):
            raise ValueError('多张图片不能堆在同一段正文后')
    states = {p.name: 'approved' if p.name in names else 'rejected'
              for p in _image_paths(folder)}
    # Do not call save_review while holding this lock: the OS-level portion is
    # intentionally acquired once per transaction.
    with ledger_file_lock(_state_lock_target(folder / REVIEW_FILE)):
        saved = _save_review_unlocked(topic, folder, states,
                                      None if topic_packages.is_package(folder) else names[0],
                                      positions)
    if topic_packages.is_package(folder):
        # The caller may send names in any order. Keep the original plan/display
        # order authoritative for exports, and never prioritize a historic cover.
        return export_topic_package_images(topic, _approved_names(saved, folder))


def export_topic_package_images(topic: str, names: list[str]) -> Path:
    """Synchronize approved images into this package's stable title directory."""
    folder = topic_path(topic)
    with ledger_file_lock(_state_lock_target(folder / REVIEW_FILE)):
        return _export_topic_package_images_unlocked(topic, names)


def _clean_topic_title(title: str) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', title).strip(' .')
    value = re.sub(r'\s+', ' ', value)[:80].rstrip(' .') or '未命名选题'
    if value.upper() in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)),
                         *(f'LPT{i}' for i in range(1, 10))}:
        value = '_' + value
    return value


def _formatted_topic_destination(topic_id: str, title: str) -> Path:
    """Reserve a stable title folder, or a deterministic safe collision suffix."""
    root = config.FORMATTED.resolve()
    existing = topic_packages.formatted_folder_for(topic_id)
    if existing is not None:
        return existing
    # Keep already-created TP-named output folders usable without renaming them.
    legacy = root / topic_id
    if legacy.is_dir() and not legacy.is_symlink():
        return legacy
    base = _clean_topic_title(title)
    suffix = ''
    index = 1
    while True:
        if suffix:
            target_name = base[:max(1, 80 - len(suffix))].rstrip(' .') + suffix
        else:
            target_name = base
        target = root / target_name
        if target.exists():
            identity = topic_packages.output_identity(target)
            if identity and identity.get('topic_id') == topic_id:
                return target
            suffix = f'（{topic_id[-8:]}）' if index == 1 else f'（{topic_id[-8:]}-{index}）'
            index += 1
            continue
        if target.resolve().parent != root:
            raise ValueError('文章标题过长或目录路径不安全，无法创建成稿文件夹')
        try:
            target.mkdir()
        except FileExistsError:
            # Another article with the same title claimed this exact name.
            suffix = f'（{topic_id[-8:]}）' if index == 1 else f'（{topic_id[-8:]}-{index}）'
            index += 1
            continue
        try:
            _write_json(target / topic_packages.OUTPUT_IDENTITY_FILE,
                        {'schema_version': 1, 'topic_id': topic_id, 'title': title})
        except OSError:
            try:
                target.rmdir()
            except OSError:
                pass
            raise
        return target


def _find_topic_export(topic_id: str) -> Path | None:
    root = config.UNFORMATTED.resolve()
    if not root.is_dir() or root.is_symlink():
        return None
    for folder in root.iterdir():
        if folder.is_symlink() or not folder.is_dir():
            continue
        if not topic_packages.is_topic_image_export(folder):
            continue
        try:
            marker = json.loads((folder / '配图文件夹信息.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        if marker.get('topic_id') == topic_id:
            return folder
    return None


def topic_export_folder(topic: str) -> Path | None:
    folder = topic_path(topic)
    if not topic_packages.is_package(folder):
        return None
    package = topic_packages.load(folder)
    return _find_topic_export(package['topic_id'])


def topic_export_status(folder: Path) -> dict:
    try:
        value = json.loads((Path(folder) / EXPORT_STATUS_FILE).read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def sync_topic_package_export(topic: str) -> dict:
    """Export the latest approved-state snapshot without changing decisions."""
    ensure_editable(topic)
    folder = topic_path(topic)
    package = topic_packages.load(folder)
    status_path = folder / EXPORT_STATUS_FILE
    try:
        with ledger_file_lock(_state_lock_target(folder / REVIEW_FILE)):
            review = load_review(folder)
            names = _approved_names(review, folder)
            existing = _find_topic_export(package['topic_id'])
            if not names and existing is None:
                export = None
            else:
                export = _export_topic_package_images_unlocked(topic, names)
            result = {'ok': True, 'folder_name': export.name if export else '',
                      'folder_path': str(export) if export else '',
                      'count': len(names), 'updated_at': datetime.now().isoformat(timespec='seconds')}
            _write_json(status_path, result)
            return result
    except (OSError, ValueError, TypeError) as exc:
        result = {'ok': False, 'folder_name': '', 'folder_path': '',
                  'error': str(exc), 'updated_at': datetime.now().isoformat(timespec='seconds')}
        try:
            with ledger_file_lock(_state_lock_target(folder / REVIEW_FILE)):
                _write_json(status_path, result)
        except OSError:
            pass
        return result


def _write_topic_progress(folder: Path, topic: str, topic_id: str, progress: dict,
                         model_roles: dict | None = None) -> None:
    """Persist and stream a per-package progress snapshot for refresh-safe UI."""
    path = Path(folder) / '配图搜图进度.json'
    try:
        previous = json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}
    except (OSError, ValueError):
        previous = {}
    if not isinstance(previous, dict) or previous.get('topic_id') not in (None, topic_id):
        previous = {}
    value = {**previous, **progress, 'topic': topic, 'topic_id': topic_id,
             'updated_at': datetime.now().isoformat(timespec='seconds')}
    if model_roles is not None:
        value['model_roles'] = model_roles
    try:
        _write_json(path, value)
    except OSError:
        pass
    print('[图片进度] ' + json.dumps(value, ensure_ascii=False, separators=(',', ':')), flush=True)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _export_topic_package_images_unlocked(topic: str, names: list[str]) -> Path:
    """Commit only package-owned exports; preserve unrelated user files."""
    folder = topic_path(topic)
    package = topic_packages.load(folder)
    if not isinstance(names, list) or len(names) != len(set(names)):
        raise ValueError('图片导出清单不合法')
    review = load_review(folder)
    if any(not isinstance(name, str) or review['states'].get(name) != 'approved'
           for name in names):
        raise ValueError('只能导出已明确保留的图片')

    clean_title = _clean_topic_title(package['title'])
    root = config.UNFORMATTED.resolve()
    target = _find_topic_export(package['topic_id'])
    if target is None:
        target = root / clean_title
        suffix = 2
        while target.exists():
            if target.is_symlink():
                target = root / f'{clean_title}（{suffix}）'
                suffix += 1
                continue
            marker = target / '配图文件夹信息.json'
            try:
                existing = json.loads(marker.read_text(encoding='utf-8')) if marker.is_file() and not marker.is_symlink() else {}
            except (OSError, ValueError):
                existing = {}
            if existing.get('topic_id') == package['topic_id']:
                break
            target = root / f'{clean_title}（{suffix}）'
            suffix += 1
    if target.resolve().parent != root or target.is_symlink():
        raise ValueError('标题图片文件夹路径不安全，已停止导出')
    target.mkdir(parents=False, exist_ok=True)

    try:
        old_marker = json.loads((target / '配图文件夹信息.json').read_text(encoding='utf-8'))
    except (OSError, ValueError, TypeError):
        old_marker = {}
    if old_marker and (old_marker.get('kind') != 'topic-image-export'
                       or old_marker.get('topic_id') != package['topic_id']):
        raise ValueError('标题文件夹不属于本选题，已停止覆盖')
    old_images = old_marker.get('images', []) if isinstance(old_marker, dict) else []
    pending_delete = old_marker.get('pending_removal', []) if isinstance(old_marker, dict) else []
    if not isinstance(old_images, list):
        old_images = []
    if not isinstance(pending_delete, list):
        pending_delete = []

    try:
        manifest = json.loads((folder / '配图清单.json').read_text(encoding='utf-8'))
    except (OSError, ValueError, TypeError):
        manifest = {}
    manifest_rows = manifest.get('配图', []) if isinstance(manifest, dict) else []
    if not isinstance(manifest_rows, list):
        manifest_rows = []
    metadata = {item.get('原始文件名'): item for item in manifest_rows
                if isinstance(item, dict) and isinstance(item.get('原始文件名'), str)}
    by_name = {item.get('filename'): item for item in old_images + pending_delete
               if isinstance(item, dict) and isinstance(item.get('filename'), str)}
    exported = []
    staged = target / ('.同步-' + uuid.uuid4().hex)
    created = []
    marker_committed = False
    try:
        staged.mkdir()
        for name in names:
            if Path(name).name != name or name in {'', '.', '..'}:
                raise ValueError('图片文件名不合法')
            source = image_path(topic, name)
            destination = target / name
            digest = _file_sha256(source)
            if destination.exists():
                if not destination.is_file() or destination.is_symlink() or _file_sha256(destination) != digest:
                    raise ValueError(f'标题文件夹中已有同名但内容不同的文件：{name}；未覆盖原文件')
            else:
                shutil.copy2(source, staged / name)
            exported.append({'filename': name, 'sha256': digest,
                             'source': metadata.get(name, {})})
        desired = set(names)
        for item in by_name.values():
            old_name = item['filename']
            if old_name in desired or old_name in {entry['filename'] for entry in pending_delete}:
                continue
            pending_delete.append(item)
        pending_by_name = {item['filename']: item for item in pending_delete
                           if isinstance(item, dict) and isinstance(item.get('filename'), str)}
        marker_value = {'kind': 'topic-image-export', 'schema_version': 1,
                        'topic_id': package['topic_id'], 'title': package['title'],
                        'created_at': package.get('created_at', ''), 'images': exported,
                        'pending_removal': list(pending_by_name.values())}
        for name in names:
            source = image_path(topic, name)
            destination = target / name
            if not destination.exists():
                (staged / name).replace(destination)
                created.append(name)
        _write_json(target / '配图文件夹信息.json', marker_value)
        marker_committed = True
        still_pending = []
        for item in pending_by_name.values():
            old_name = item['filename']
            if old_name in desired or Path(old_name).name != old_name:
                continue
            destination = target / old_name
            if not destination.exists() or destination.is_symlink() or not destination.is_file():
                continue
            expected = item.get('sha256', '')
            if not expected:
                try:
                    source = image_path(topic, old_name)
                    expected = _file_sha256(source)
                except (OSError, ValueError):
                    expected = ''
            if expected and _file_sha256(destination) == expected:
                try:
                    destination.unlink()
                except OSError:
                    still_pending.append(item)
            # If a user edited the managed copy, leave it intact and relinquish ownership.
        if still_pending:
            marker_value['pending_removal'] = still_pending
            _write_json(target / '配图文件夹信息.json', marker_value)
            raise OSError('部分旧图片文件正在占用，自动保存未能完成清理；点击重试即可继续')
        if marker_value['pending_removal']:
            marker_value['pending_removal'] = []
            _write_json(target / '配图文件夹信息.json', marker_value)
    except Exception:
        if not marker_committed:
            for name in created:
                destination = target / name
                try:
                    if destination.is_file() and not destination.is_symlink():
                        destination.unlink()
                except OSError:
                    pass
        raise
    finally:
        shutil.rmtree(staged, ignore_errors=True)
    return target


def _same_file_bytes(first: Path, second: Path) -> bool:
    import filecmp
    return filecmp.cmp(first, second, shallow=False)


def clear_topic_image_outputs_for_testing() -> dict:
    """Clear only new topic-flow image outputs, preserving packages and drafts."""
    root = config.UNFORMATTED.resolve()
    removed_images = removed_folders = reset_packages = skipped = 0
    if not root.is_dir() or root.is_symlink():
        return {'images': 0, 'folders': 0, 'packages': 0, 'skipped': 0}

    for folder in root.iterdir():
        if folder.is_symlink() or not folder.is_dir():
            continue
        try:
            if folder.resolve().parent != root:
                skipped += 1
                continue
        except OSError:
            skipped += 1
            continue

        marker_path = folder / '配图文件夹信息.json'
        if marker_path.is_file() and not marker_path.is_symlink():
            try:
                marker = json.loads(marker_path.read_text(encoding='utf-8'))
                marker_images = marker.get('images', []) if isinstance(marker, dict) else []
                marked_names = {item.get('filename') for item in marker_images
                                if isinstance(item, dict) and isinstance(item.get('filename'), str)}
                managed = (isinstance(marker, dict)
                           and topic_packages.TOPIC_ID_RE.fullmatch(marker.get('topic_id', '') or '')
                           and isinstance(marker.get('title'), str)
                           and marker.get('kind', 'topic-image-export') == 'topic-image-export'
                           and bool(marked_names))
                children = list(folder.iterdir())
                child_images = {child.name for child in children
                                if child.is_file() and child.suffix.casefold() in IMAGE_SUFFIXES}
                safe_contents = all(
                    not child.is_symlink() and child.is_file()
                    and (child.name == marker_path.name or child.suffix.casefold() in IMAGE_SUFFIXES)
                    for child in children
                ) and child_images.issubset(marked_names)
                if managed and safe_contents:
                    removed_images += sum(child.suffix.casefold() in IMAGE_SUFFIXES
                                          for child in children)
                    shutil.rmtree(folder)
                    removed_folders += 1
                    continue
                skipped += 1
            except (OSError, ValueError, TypeError):
                skipped += 1
            continue

        if not topic_packages.is_package(folder):
            continue
        images = [path for path in folder.iterdir()
                  if path.is_file() and not path.is_symlink()
                  and path.suffix.casefold() in IMAGE_SUFFIXES]
        for path in images:
            try:
                path.unlink()
                removed_images += 1
            except OSError:
                skipped += 1
        # Keep the writing prompt and import choice, but clear cached search
        # results and review decisions so the same topic can be tested again.
        reset = False
        for name in (REVIEW_FILE, SELECTION_FILE, topic_packages.IMPORT_FILE,
                     '配图清单.json', '配图顺序.txt', '配图来源.md',
                     '配图搜索历史.json'):
            record = folder / name
            if record.is_file() and not record.is_symlink():
                try:
                    record.unlink()
                    reset = True
                except OSError:
                    skipped += 1
        if images or reset:
            reset_packages += 1
    return {'images': removed_images, 'folders': removed_folders,
            'packages': reset_packages, 'skipped': skipped}


def list_topics() -> list[dict]:
    rows = []
    folders = [(folder.name, folder) for folder in sorted(config.UNFORMATTED.iterdir())] if config.UNFORMATTED.exists() else []
    if config.FORMATTED.exists():
        for finished in sorted(config.FORMATTED.iterdir()):
            if not finished.is_dir() or finished.is_symlink():
                continue
            # 已发布完的文章不显示（原来过滤掉，现在保留让用户能回看）
            identity = topic_packages.output_identity(finished)
            key = '成稿:' + (identity['topic_id'] if identity else finished.name)
            try:
                folders.append((key, topic_path(key)))
            except ValueError:
                pass
    for key, folder in folders:
        # 已发布完的文章不显示（原来过滤掉，现在保留让用户能回看）
        if not folder.is_dir() or folder.is_symlink():
            continue
        # New topic exports are image folders, not old Word articles. Their
        # stable topic_id marker keeps them out of both review lists.
        if folder.parent.resolve() == config.UNFORMATTED.resolve() and topic_packages.is_topic_image_export(folder):
            continue
        package_marker = topic_packages.is_package(folder)
        if package_marker and not topic_packages.is_imported(folder):
            continue
        has_word = any(p.is_file() and not p.is_symlink() and p.suffix.lower() == '.docx'
                       and not p.name.startswith('~$') for p in folder.glob('*.docx'))
        if not package_marker and not has_word:
            continue
        paths = _image_paths(folder)
        if not paths and not has_word and not package_marker:
            continue
        package = None
        package_error = ''
        word = None
        if package_marker:
            try:
                package = topic_packages.load(folder)
                word = topic_packages.imported_word(folder)
            except (ValueError, OSError) as exc:
                package_error = str(exc)
        try:
            manifest = json.loads((folder / '配图清单.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            manifest = {}
        metadata = {i.get('原始文件名'):i for i in manifest.get('配图', []) if isinstance(i, dict)}
        review_error = ''
        try:
            review = load_review(folder)
        except (ValueError, OSError) as exc:
            review_error = str(exc)
            review = {'states': {p.name: 'pending' for p in paths}, 'cover': '',
                      'revision': 0, 'needs_layout': True}
        current_image_names = {path.name for path in paths
                               if review['states'].get(path.name) != 'rejected'}
        filled_plan_positions = {
            item.get('计划位置') for item in manifest.get('配图', [])
            if (isinstance(item, dict) and item.get('计划位置')
                and item.get('原始文件名') in current_image_names)
        }
        paths.sort(key=lambda path: (metadata.get(path.name, {}).get(
            '计划顺序', metadata.get(path.name, {}).get('顺序', 10_000)), path.name.casefold()))
        selected = _approved_names(review, folder)
        export_folder = (_find_topic_export(package['topic_id'])
                         if package_marker and package else None)
        export_sync = topic_export_status(folder) if package_marker else {}
        if export_folder and not export_sync:
            try:
                marker = json.loads((export_folder / '配图文件夹信息.json').read_text(encoding='utf-8'))
                export_sync = {'ok': True, 'count': len(marker.get('images', [])),
                               'folder_name': export_folder.name,
                               'folder_path': str(export_folder)}
            except (OSError, ValueError, TypeError):
                export_sync = {}
        try:
            image_progress = (json.loads((folder / '配图搜图进度.json').read_text(encoding='utf-8'))
                              if package_marker else {})
            if not isinstance(image_progress, dict):
                image_progress = {}
        except (OSError, ValueError, TypeError):
            image_progress = {}
        options = []
        target = 0
        folder_word_status = (topic_packages.export_word_status(package['topic_id'])
                              if package_marker and package else {})
        final_docx = ''
        if package_marker and package and key.startswith('成稿:'):
            formatted_root = folder.parent
            try:
                output_manifest = json.loads((formatted_root / '配图清单.json').read_text(encoding='utf-8'))
                name = output_manifest.get('成稿', '')
                output_path = (formatted_root / name).resolve()
                if name and output_path.parent == formatted_root.resolve() and output_path.is_file():
                    final_docx = str(output_path)
            except (OSError, ValueError, TypeError):
                pass
        try:
            target = target_count(folder)
            # Topic packages always use their saved plan here. Word is read only
            # later by the local formatter and never contributes to image review.
            if not package_marker:
                document = source_document(folder)
                heading = '开篇'
                for index, block in enumerate(document.blocks):
                    if block.kind in {'h2', 'h3'}:
                        heading = block.text
                    elif block.kind == 'p':
                        options.append({'position':index, 'heading':heading, 'text':block.text[:260]})
            positions = load_positions(folder)
        except (ValueError, OSError) as exc:
            positions = {}
            if package_marker and not package_error:
                package_error = str(exc)
        warnings = list(manifest.get('提示', []))
        if package_error:
            warnings.append('配图计划不可用：' + package_error)
        if review_error:
            warnings.append(review_error)
        counts = {state: sum(value == state for value in review['states'].values()) for state in REVIEW_STATES}
        display_title = (package.get('title') if package else
                         (key[3:] if key.startswith('成稿:') else key))
        outline_headings = {item.get('section_id'): item.get('heading', '')
                            for item in (package or {}).get('outline', [])}
        image_plan = [{**item, 'heading': outline_headings.get(item.get('section_id', ''), '')}
                      for item in (package or {}).get('image_plan', [])]
        rows.append({'topic':key, 'title':display_title,
                     'topic_id':package.get('topic_id', '') if package else '',
                     'keyword_version':package.get('keyword_version', 1) if package else 1,
                     'export_folder': str(export_folder) if export_folder else '',
                     'export_folder_name': export_folder.name if export_folder else '',
                     'export_sync': export_sync,
                     'image_progress': image_progress,
                     'folder_word_status':folder_word_status,
                     'final_docx':final_docx,
                     'topic_package':package_marker, 'plan_ready':bool(package) and not package_error,
                     'plan_error':package_error, 'has_word':word is not None,
                     'plan_imported':topic_packages.is_imported(folder) if package_marker else False,
                     'image_plan':image_plan,
                     'word_name':word.name if word is not None else '',
                     'count':len(selected), 'warnings':warnings,
                     'target_count':target, 'missing_count':max(0, target - counts['approved']),
                     'unfilled_plan_count': (max(0, target - len(filled_plan_positions))
                                             if package_marker else 0),
                     'approved_count':counts['approved'], 'pending_count':counts['pending'],
                     'rejected_count':counts['rejected'], 'cover':review['cover'],
                     'revision':review['revision'], 'needs_layout':review['needs_layout'],
                     'phase': workflow_phase(review, target=target,
                                             formatted=key.startswith('成稿:')),
                     'formatted':key.startswith('成稿:'), 'paragraphs':options, 'selected':selected, 'images':[
            {'name':p.name, 'title':metadata.get(p.name, {}).get('原始标题', p.stem),
             'platform':metadata.get(p.name, {}).get('平台', '本地'),
             'heading':metadata.get(p.name, {}).get('插入到小标题', ''),
             'position':positions.get(p.name, metadata.get(p.name, {}).get('插入到段落')),
             'context':metadata.get(p.name, {}).get('对应正文', ''),
             'query':metadata.get(p.name, {}).get('搜索词', ''),
             'keyword_type':metadata.get(p.name, {}).get('关键词类型', 'core'),
             'subject_query':metadata.get(p.name, {}).get('关联主体', ''),
             'scene_term':metadata.get(p.name, {}).get('场景方向', ''),
             'plan_position':metadata.get(p.name, {}).get('计划位置', ''),
             'plan_order':metadata.get(p.name, {}).get('计划顺序'),
             'scene':metadata.get(p.name, {}).get('需要画面', ''),
             'exclude':metadata.get(p.name, {}).get('排除画面', []),
             'review_status':review['states'][p.name],
             'size':p.stat().st_size, 'mtime':p.stat().st_mtime_ns}
            for p in paths]})
    return rows


def _replace_package_files(staged, destination, previous):
    """Update a package whose directory is held open by Windows.

    Keep a complete backup and restore every changed file if any replacement
    fails. Unchanged source files are not reopened for writing.
    """
    import filecmp
    import shutil
    shutil.copytree(destination, previous)
    changed = []
    files = sorted((path for path in staged.rglob('*') if path.is_file()),
                   key=lambda path: (path.name == REVIEW_FILE, str(path)))
    staged_files = {path.relative_to(staged) for path in files}
    obsolete = sorted(
        (path.relative_to(destination) for path in destination.rglob('*')
         if path.is_file() and path.relative_to(destination) not in staged_files),
        key=lambda path: (len(path.parts), str(path)), reverse=True,
    )
    removed = []
    try:
        for source in files:
            relative = source.relative_to(staged)
            target = destination / relative
            if target.is_file() and filecmp.cmp(source, target, shallow=False):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            source.replace(target)
            changed.append(relative)
        # A successful in-place commit must match the staged package.  Without
        # this step an old title DOCX can survive beside the renamed new one and
        # later be scanned as a second sendable manuscript.
        for relative in obsolete:
            target = destination / relative
            target.unlink()
            removed.append(relative)
    except Exception as exc:
        failed_name = target.name
        for relative in reversed(changed):
            target = destination / relative
            old = previous / relative
            if old.is_file():
                shutil.copy2(old, target)
            else:
                target.unlink(missing_ok=True)
        for relative in removed:
            target = destination / relative
            old = previous / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(old, target)
        if isinstance(exc, PermissionError):
            raise ValueError(f'文件正在被其他程序占用：{failed_name}。请关闭该文件后重试；旧成稿和已取得图片均已保留。') from exc
        raise
    staged_dirs = {path.relative_to(staged) for path in staged.rglob('*') if path.is_dir()}
    for path in sorted((path for path in destination.rglob('*') if path.is_dir()),
                       key=lambda item: len(item.parts), reverse=True):
        if path.relative_to(destination) not in staged_dirs:
            try:
                path.rmdir()
            except OSError:
                pass


def _restore_package_files(previous: Path, destination: Path) -> None:
    """用完整备份把原地替换的成稿恢复到提交前。

    Windows 上目录可能无法改名，但其中未被 Word 锁定的文件仍可替换。
    这个恢复路径保留 ``previous`` 作为可追溯备份，不会把备份移走。
    """
    import shutil

    previous_files = {
        path.relative_to(previous): path
        for path in previous.rglob('*') if path.is_file()
    }
    destination_files = {
        path.relative_to(destination): path
        for path in destination.rglob('*') if path.is_file()
    }
    for relative, source in previous_files.items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for relative in sorted(destination_files.keys() - previous_files.keys(),
                           key=lambda path: len(path.parts), reverse=True):
        (destination / relative).unlink(missing_ok=True)
    previous_dirs = {path.relative_to(previous) for path in previous.rglob('*') if path.is_dir()}
    destination_dirs = sorted(
        (path for path in destination.rglob('*') if path.is_dir()),
        key=lambda path: len(path.parts), reverse=True,
    )
    for path in destination_dirs:
        if path.relative_to(destination) not in previous_dirs:
            try:
                path.rmdir()
            except OSError:
                pass


def _failed_package_path(backup: Path) -> Path:
    """返回本次事务中不会覆盖其他证据的失败成稿路径。"""
    path = backup / '未提交成稿'
    index = 2
    while path.exists():
        path = backup / f'未提交成稿-{index}'
        index += 1
    return path


def _rollback_reformat(*, destination: Path, previous: Path, staged: Path,
                       backup: Path, replaced_in_place: bool,
                       source: Path | None = None,
                       archived_source: Path | None = None) -> None:
    """恢复重新排版前的可用版本，并保留未提交新版供排查。"""
    import shutil

    failures = []
    if source is not None and archived_source is not None and archived_source.exists():
        try:
            if source.exists():
                raise FileExistsError(f'源素材恢复位置已存在：{source}')
            archived_source.rename(source)
        except Exception as exc:
            failures.append(f'源素材恢复失败：{exc}')

    failed = _failed_package_path(backup)
    if replaced_in_place:
        try:
            # 原地替换后 staged 里的部分文件已被移走；此时目标目录才是完整新版。
            shutil.copytree(destination, failed)
        except Exception as exc:
            failures.append(f'未提交成稿备份失败：{exc}')
        try:
            _restore_package_files(previous, destination)
        except Exception as exc:
            failures.append(f'旧成稿恢复失败：{exc}')
    else:
        try:
            candidate = destination if destination.exists() else staged
            if candidate.exists():
                candidate.rename(failed)
        except Exception as exc:
            failures.append(f'未提交成稿保留失败：{exc}')
        try:
            if previous.exists():
                if destination.exists():
                    raise FileExistsError(f'旧成稿恢复位置已存在：{destination}')
                previous.rename(destination)
        except Exception as exc:
            failures.append(f'旧成稿恢复失败：{exc}')

    if failures:
        raise RuntimeError('；'.join(failures) + f'。请查看备份：{backup}')


@_article_transaction
def reformat(topic, image_collaboration=None, word_name=None):
    import shutil
    import tempfile
    from datetime import datetime
    from . import ai, layout, library, model_settings, sourcing as src
    ensure_editable(topic)
    folder = topic_path(topic)
    package_workflow = topic_packages.is_package(folder)
    package = None
    if package_workflow:
        package = topic_packages.load(folder)  # damaged/missing plans fail closed
        if not topic_packages.is_imported(folder):
            raise ValueError('请先在选题卡点击「一键导入配图清单」，再审核图片和排版')
        if topic_packages.imported_word(folder) is None:
            topic_packages.import_word_from_export(package['topic_id'], filename=word_name)
    review = load_review(folder)
    selected = _approved_names(review, folder)
    if not selected:
        undecided = sum(state == 'pending' for state in review['states'].values())
        if undecided:
            raise ValueError(f'还有 {undecided} 张图片没有决定；请至少保留一张图片再生成成稿')
        raise ValueError('还没有保留任何图片；请逐张选择保留、换一张或去掉，至少保留一张后再生成成稿')
    # 只把 approved 图片送入成稿。尚未决定的候选继续保持 pending，不能
    # 因为用户点击了排版就替用户记成「去掉」。
    if not package_workflow and any(state == 'pending' for state in review['states'].values()):
        # 传统 Word 审核仍遵守旧确认门槛；仅新版选题包允许保留待选候选。
        review = {**review, 'states': {
            image: ('rejected' if state == 'pending' else state)
            for image, state in review['states'].items()}}
    name = topic.removeprefix('成稿:')
    config.DATA.mkdir(parents=True, exist_ok=True)
    config.FORMATTED.mkdir(parents=True, exist_ok=True)
    output_name = (name if not package_workflow else
                   _formatted_topic_destination(package['topic_id'], package['title']).name)
    destination = (config.FORMATTED / name if not package_workflow else
                   _formatted_topic_destination(package['topic_id'], package['title']))
    image_positions = None
    skipped_reasons = None
    layout_warnings = []
    layout_role_state = None
    layout_role_elapsed = 0.0
    if package_workflow:
        try:
            if image_collaboration is None:
                raw = os.environ.get('ARTICLE_HUB_IMAGE_COLLABORATION', '')
                image_collaboration = json.loads(raw) if raw else None
            if image_collaboration:
                collaboration = model_settings.validate_image_collaboration(image_collaboration)
                if collaboration['mode'] == 'collaborative':
                    role = collaboration['roles']['layout']
                    profile = model_settings.resolve(role['provider'], role['model'])
                    layout_role_elapsed = _time.monotonic()
                    try:
                        saved_progress = json.loads((folder / '配图搜图进度.json').read_text(encoding='utf-8'))
                    except (OSError, ValueError):
                        saved_progress = {}
                    model_roles = saved_progress.get('model_roles', {}) if isinstance(saved_progress, dict) else {}
                    layout_role_state = dict(model_roles.get('layout', {}))
                    layout_role_state.update({'provider': profile.get('name') or role['provider'],
                        'model': profile.get('模型') or role['model'],
                        'duty': '根据正文段落和已保留图片匹配位置；只返回图片与段落对应关系',
                        'status': '运行中', 'detail': '正在读取本篇正文与已保留图片信息',
                        'completed': 0, 'total': len(selected), 'elapsed_seconds': 0,
                        'result': ''})
                    model_roles['layout'] = layout_role_state
                    _write_topic_progress(folder, topic, package['topic_id'],
                        {'stage': '排版匹配', 'layout_progress': {'completed': 0, 'total': len(selected)},
                         'result': '排版模型正在处理本篇已保留图片'}, model_roles)
                    from .docxio import read_document
                    source = topic_packages.imported_word(folder)
                    document = read_document(source)
                    manifest = json.loads((folder / src.MANIFEST_FILE).read_text(encoding='utf-8')) if (folder / src.MANIFEST_FILE).is_file() else {}
                    metadata = {item.get('原始文件名'):item for item in manifest.get('配图', [])
                                if isinstance(item, dict)}
                    image_rows = []
                    for index, filename in enumerate(selected):
                        item = metadata.get(filename, {})
                        image_rows.append({'name':filename,
                                           'title':item.get('原始标题') or filename,
                                           'query':item.get('搜索词', ''),
                                           'source':item.get('来源') or item.get('平台', ''),
                                           'visual_label':item.get('画面标签', '')})
                    layout_role_state['detail'] = (f'正在请求模型匹配：正文 {sum(block.kind in {"p", "h2", "h3"} for block in document.blocks)} 个段落/小节，'
                                                   f'{len(image_rows)} 张已保留图片')
                    layout_role_state['elapsed_seconds'] = round(_time.monotonic() - layout_role_elapsed, 1)
                    model_roles['layout'] = layout_role_state
                    _write_topic_progress(folder, topic, package['topic_id'],
                        {'stage': '排版模型请求中',
                         'layout_progress': {'completed': 0, 'total': len(selected)},
                         'result': layout_role_state['detail']}, model_roles)
                    image_positions, skipped_reasons = layout.suggest_image_positions(
                        document.blocks, image_rows, profile)
                    layout_role_state.update({'status': '已完成',
                        'detail': f'已完成 {len(selected)}/{len(selected)} 张图片的位置匹配',
                        'completed': len(selected), 'total': len(selected),
                        'elapsed_seconds': round(_time.monotonic() - layout_role_elapsed, 1),
                        'result': f'建议采用 {len(image_positions)} 张，暂不采用 {len(skipped_reasons)} 张'})
                    model_roles['layout'] = layout_role_state
                    _write_topic_progress(folder, topic, package['topic_id'],
                        {'stage': '排版匹配完成',
                         'layout_progress': {'completed': len(selected), 'total': len(selected)},
                         'result': layout_role_state['result']}, model_roles)
                    print(f"[排版协作] {profile['name']} · {profile['模型']} 完成段落匹配；"
                          f"采用 {len(image_positions)} 张，暂不采用 {len(skipped_reasons)} 张。")
        except (ai.AiError, layout.LayoutError, ValueError, OSError, json.JSONDecodeError) as exc:
            image_positions = None
            skipped_reasons = None
            layout_warnings.append(f'协作排版匹配未完成，已使用本地排版规则：{str(exc)[:180]}')
            if layout_role_state is not None:
                layout_role_state.update({'status': '失败',
                    'detail': '段落匹配失败；已回退到现有本地排版规则，不代表语义匹配成功',
                    'elapsed_seconds': round(_time.monotonic() - layout_role_elapsed, 1),
                    'result': str(exc)[:180]})
                model_roles['layout'] = layout_role_state
                _write_topic_progress(folder, topic, package['topic_id'],
                    {'stage': '排版匹配失败，使用本地规则', 'error': str(exc)[:240],
                     'result': '模型匹配未完成；本地规则仍在继续'}, model_roles)
            print('[排版提示] ' + layout_warnings[-1])
        if layout_role_state is None:
            try:
                saved_progress = json.loads((folder / '配图搜图进度.json').read_text(encoding='utf-8'))
            except (OSError, ValueError):
                saved_progress = {}
            model_roles = saved_progress.get('model_roles', {}) if isinstance(saved_progress, dict) else {}
            existing_layout = dict(model_roles.get('layout', {}))
            existing_layout.update({'status': '未调用',
                'detail': '本次使用本地排版规则；协作排版模型未调用', 'completed': 0,
                'total': None, 'result': '未请求模型匹配'})
            model_roles['layout'] = existing_layout
            layout_role_state = existing_layout
            _write_topic_progress(folder, topic, package['topic_id'],
                {'stage': '本地排版', 'result': '协作排版模型未调用'}, model_roles)
    with tempfile.TemporaryDirectory(prefix='审阅排版-', dir=config.DATA) as temporary:
        work = Path(temporary)
        result = layout.format_topic(folder, force=True, max_images=len(selected),
                                     output_topic=output_name, output_root=work / '成稿',
                                     image_positions=image_positions,
                                     image_skip_reasons=skipped_reasons,
                                     layout_warnings=layout_warnings)
        # A corrupt approved image must never silently disappear from the published version.
        expected_images = len(selected) - len(skipped_reasons or {})
        if result.images != expected_images:
            raise ValueError('已通过的图片未全部排入成稿，请检查图片是否损坏')
        from .docxio import read_document
        read_document(result.docx)
        if package_workflow and output_name != package['topic_id']:
            _write_json(result.folder / topic_packages.OUTPUT_IDENTITY_FILE,
                        {'schema_version': 1, 'topic_id': package['topic_id'],
                         'title': package['title']})
        if topic.startswith('成稿:'):
            for archive in destination.iterdir():
                if archive.is_dir() and not archive.is_symlink() and archive.name.startswith('原始素材'):
                    shutil.copytree(archive, result.folder / archive.name)
            reviewed_source = result.folder / folder.name
        else:
            reviewed_source = result.folder / '原始素材'
            shutil.copytree(folder, reviewed_source)
        review['needs_layout'] = False
        _write_json(reviewed_source / REVIEW_FILE, review)
        if package_workflow:
            _write_topic_progress(reviewed_source, topic, package['topic_id'],
                {'stage': '定稿已生成', 'final_docx': str(result.docx),
                 'layout_progress': {'completed': len(selected), 'total': len(selected)},
                 'result': f'本篇定稿已生成；采用 {result.images} 张图片'},
                model_roles if layout_role_state else None)
        backup = config.DATA / '重新排版备份' / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup.mkdir(parents=True)
        previous = backup / name
        replaced_in_place = False
        if destination.exists():
            try:
                destination.rename(previous)
            except PermissionError:
                if not topic.startswith('成稿:'):
                    raise
                _replace_package_files(result.folder, destination, previous)
                replaced_in_place = True
        if not replaced_in_place:
            try:
                result.folder.rename(destination)
            except Exception:
                _rollback_reformat(destination=destination, previous=previous,
                                   staged=result.folder, backup=backup,
                                   replaced_in_place=False)
                raise
        archived_source = backup / '未排版原始素材'
        source_archived = False
        try:
            if not topic.startswith('成稿:'):
                folder.rename(archived_source)
                source_archived = True
            # 文件与台账是一次提交；刷新失败时不留下「新成稿+旧台账」。
            library.refresh_ledger()
        except Exception:
            try:
                _rollback_reformat(
                    destination=destination, previous=previous, staged=result.folder,
                    backup=backup, replaced_in_place=replaced_in_place,
                    source=folder if source_archived else None,
                    archived_source=archived_source if source_archived else None,
                )
            except Exception as rollback_error:
                raise RuntimeError(
                    f'重新排版未完成，自动恢复也遇到问题：{rollback_error}'
                ) from rollback_error
            raise
    print(f'本次排版 1 篇：{result.title}')


@_article_transaction
def return_for_images(topic: str) -> dict:
    """Return an article to a clean, unformatted source state.

    The operation is intentionally repeatable.  A draft that is already in the
    unformatted queue is cleaned in place, while a finished package is moved to
    a timestamped backup before its source document is queued again.
    """
    import shutil
    import tempfile
    from datetime import datetime

    if not isinstance(topic, str) or not topic:
        raise ValueError('请选择要退回的文章')
    name = topic.removeprefix('成稿:')

    # An unformatted article can still contain downloaded candidates, review
    # decisions, search metadata, or the remains of an interrupted run.  Keep
    # all of that recoverable, but leave only the source document in the queue.
    if not topic.startswith('成稿:'):
        folder = topic_path(topic)
        source_document(folder)
        source = next(path for path in folder.glob('*.docx') if not path.name.startswith('~'))
        artifacts = [path for path in folder.iterdir() if path != source]
        backup = (config.DATA / '重新配图备份' /
                  datetime.now().strftime('%Y%m%d-%H%M%S-%f') / name)
        moved = []
        try:
            if artifacts:
                backup.mkdir(parents=True)
                for path in artifacts:
                    target = backup / path.name
                    path.rename(target)
                    moved.append((path, target))
            with library.ledger_transaction() as ledger:
                record = ledger['文章'].setdefault(name, {})
                for field in ('成稿', '封面', '配图数'):
                    record.pop(field, None)
                record['配图状态'] = '待重新配图'
                if artifacts:
                    record['重配备份'] = str(backup)
        except Exception:
            for original, saved in reversed(moved):
                if saved.exists() and not original.exists():
                    saved.rename(original)
            raise
        _mark_returned_for_images(name, backup if artifacts else None)
        result = {'ok': True, 'topic': name, 'folder': str(folder),
                  'message': '已退回未配图状态'}
        if artifacts:
            result['backup'] = str(backup)
        return result

    # A finished article is allowed to come back even if it has previously
    # reached a platform: the button is an explicit, recoverable override.
    source = topic_path(topic)
    source_document(source)
    finished = source.parent if topic_packages.is_package(source) else config.FORMATTED / name
    destination = config.UNFORMATTED / name
    if destination.exists():
        raise ValueError('未排版文章中已有同名文章，请先处理，避免覆盖')
    config.UNFORMATTED.mkdir(parents=True, exist_ok=True)
    backup = config.DATA / '重新配图备份' / datetime.now().strftime('%Y%m%d-%H%M%S-%f') / name
    backup.parent.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix='退回重配-', dir=backup.parent) as temporary:
        stage = Path(temporary) / name
        stage.mkdir()
        for path in source.glob('*.docx'):
            if not path.name.startswith('~'):
                shutil.copy2(path, stage / path.name)
        finished.rename(backup)
        try:
            stage.rename(destination)
        except Exception:
            backup.rename(finished)
            raise
    try:
        with library.ledger_transaction() as ledger:
            record = ledger['文章'].setdefault(name, {})
            for field in ('成稿', '封面', '配图数'):
                record.pop(field, None)
            record['配图状态'] = '待重新配图'
            record['重配备份'] = str(backup)
    except Exception:
        # The file move and ledger update form one user-visible transition.
        # Restore the old finished package if the durable ledger commit fails;
        # keep the staged source as a timestamped recovery copy instead of
        # deleting it during rollback.
        try:
            recovery = backup.parent / '未提交退回'
            if destination.exists():
                destination.rename(recovery)
            if backup.exists() and not finished.exists():
                backup.rename(finished)
        except Exception as rollback_error:
            raise RuntimeError(
                f'退回重配未完成，自动恢复也遇到问题：{rollback_error}'
            ) from rollback_error
        raise
    _mark_returned_for_images(name, backup)
    return {'ok': True, 'topic': name, 'folder': str(destination), 'backup': str(backup),
            'message': '已退回未配图状态'}


def _mark_returned_for_images(name: str, backup: Path | None) -> None:
    """Best-effort UI telemetry; the completed file transaction stays valid."""
    status = config.DATA / '配图进度.json'
    with ledger_file_lock(_state_lock_target(status)):
        try:
            report = json.loads(status.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            report = {'文章': []}
        if not isinstance(report, dict) or not isinstance(report.get('文章', []), list):
            report = {'文章': []}
        rows = [row for row in report.get('文章', [])
                if isinstance(row, dict) and row.get('标题') != name]
        details = [f'旧成稿和图片已备份：{backup}'] if backup else []
        rows.append({'标题': name, '状态': '待处理', '阶段': '已退回未排版文章，请选择模型后重新配图',
                     '详情': details})
        report.update({'状态': '有待处理项', '文章': rows})
        try:
            _write_json(status, report)
        except OSError:
            pass


@_article_transaction
def resource(topic, sources_names):
    """Collect fresh candidates while retaining the current final unchanged."""
    from datetime import datetime
    from . import sourcing

    ensure_editable(topic)
    original = topic_path(topic)
    if topic_packages.is_package(original):
        raise ValueError('选题内容包必须使用已导入的提示词清单配图；请在配图排版模块点「单篇配图」')
    name = topic.removeprefix('成稿:')
    source_document(original)  # Validate before contacting providers.
    config.DATA.mkdir(parents=True, exist_ok=True)
    active = {'标题': name, '状态': '运行中', '阶段': '准备重新搜图', '详情': []}
    report = {'开始时间': datetime.now().isoformat(timespec='seconds'), '状态': '运行中', '文章': [active]}
    status_path = config.DATA / '配图进度.json'

    def hint(message):
        print(message, flush=True)
        active['详情'].append(str(message))
        active['阶段'] = str(message)
        _write_status(status_path, report)

    sources = []
    try:
        hint('[进度] 单篇重新搜图；旧成稿保持不变，新图必须审核后才能定稿')
        sources, warnings = sourcing.build_sources(sources_names, hint=hint)
        for warning in warnings:
            hint('[提示] ' + warning)
        if not sources:
            raise ValueError('没有可用的图源，请检查图源配置')
        result = sourcing.source_topic(original, sources=sources, force=True,
                                       do_layout=False, captions=False, hint=hint)
        if not result.chosen:
            raise ValueError('未找到合适图片')
        active['状态'] = '已完成'
        active['阶段'] = '新候选图已保存，等待审核'
        active['图片数'] = len(result.chosen)
        report['状态'] = '已完成'
        hint(f'《{name}》的新候选图已保存；旧成稿未改动，请审核后再定稿。')
    except Exception as exc:
        active['状态'] = '待处理'
        report['状态'] = '有待处理项'
        hint(f'重新配图未完成：{exc}。原有素材和旧成稿保留。')
        raise
    finally:
        for source in sources:
            try:
                source.close()
            except Exception:
                pass


if __name__ == '__main__':
    import sys
    try:
        if '--重新配图' in sys.argv:
            resource(sys.argv[1], sys.argv[sys.argv.index('--来源') + 1].split(','))
        else:
            reformat(sys.argv[1])
    except Exception as exc:
        print(f'[待处理] {exc}')
        raise SystemExit(1)
