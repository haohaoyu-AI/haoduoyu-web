"""Small, dependency-free primitives for durable JSON state files."""

from __future__ import annotations

import errno
import json
import os
import threading
import time
import uuid
import warnings
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


class LedgerError(RuntimeError):
    """The ledger cannot be read or safely replaced."""


class LedgerBackupWarning(RuntimeWarning):
    """The primary committed, but its best-effort backup refresh failed."""


LEDGER_BACKUP_COUNT = 3
_LOCKS: dict[Path, threading.RLock] = {}
_LOCKS_GUARD = threading.Lock()


def _process_lock(path: Path) -> threading.RLock:
    key = path.resolve()
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(key, threading.RLock())


def _lock_byte(stream) -> None:
    if os.name == "nt":
        import msvcrt

        stream.seek(0, os.SEEK_END)
        if stream.tell() == 0:
            stream.write(b"\0")
            stream.flush()
            os.fsync(stream.fileno())
        while True:
            try:
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                return
            except OSError as exc:
                if exc.errno not in {errno.EACCES, errno.EAGAIN, errno.EDEADLK}:
                    raise
                time.sleep(0.05)
    else:
        import fcntl

        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)


def _unlock_byte(stream) -> None:
    if os.name == "nt":
        import msvcrt

        stream.seek(0)
        msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


@contextmanager
def ledger_file_lock(path: Path) -> Iterator[None]:
    """Serialize one ledger across threads and Python processes.

    Callers deliberately acquire this only at public transaction boundaries;
    internal helpers do not lock again, avoiding platform-specific re-entry
    behaviour in ``msvcrt``/``flock``.
    """
    path = Path(path)
    lock_path = path.with_name(path.name + ".lock")
    with _process_lock(path):
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with lock_path.open("a+b") as stream:
            _lock_byte(stream)
            try:
                yield
            finally:
                _unlock_byte(stream)


def validate_ledger(data, *, path: Path | None = None) -> dict:
    """Validate the stable outer ledger shape without rejecting extra fields."""
    where = f"「{path}」" if path is not None else "台账"
    if not isinstance(data, dict):
        raise LedgerError(f"{where}结构无效：顶层必须是 JSON 对象")
    if "文章" not in data or not isinstance(data["文章"], dict):
        raise LedgerError(f"{where}结构无效：缺少对象字段“文章”")
    for topic, record in data["文章"].items():
        if not isinstance(topic, str) or not isinstance(record, dict):
            raise LedgerError(f"{where}结构无效：每篇文章必须是“主题名: 对象”")
        for field in ("分发", "已发", "发布"):
            value = record.get(field)
            if value is not None and not isinstance(value, dict):
                raise LedgerError(f"{where}结构无效：文章“{topic}”的“{field}”必须是对象")
    return data


def decode_ledger(raw: bytes, path: Path) -> dict:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise LedgerError(f"无法读取台账「{path}」：文件不是 UTF-8 编码（{exc}）") from exc
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LedgerError(
            f"无法读取台账「{path}」：JSON 在第 {exc.lineno} 行第 {exc.colno} 列损坏（{exc.msg}）"
        ) from exc
    return validate_ledger(data, path=path)


def load_ledger_file(path: Path, *, missing: dict) -> dict:
    path = Path(path)
    if not path.exists():
        return missing
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise LedgerError(f"无法读取台账「{path}」：{exc}") from exc
    return decode_ledger(raw, path)


def _fsync_directory(folder: Path) -> None:
    """Persist the rename on POSIX; Windows does not expose O_DIRECTORY."""
    flags = getattr(os, "O_DIRECTORY", 0)
    if not flags:
        return
    try:
        descriptor = os.open(folder, os.O_RDONLY | flags)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _atomic_replace_bytes(path: Path, payload: bytes) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    try:
        with temporary.open("xb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        _fsync_directory(path.parent)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def ledger_backup_paths(path: Path, *, count: int = LEDGER_BACKUP_COUNT) -> list[Path]:
    """Newest-to-oldest bounded last-known-good backup locations."""
    path = Path(path)
    base = path.with_name(path.name + ".bak")
    return [base if index == 0 else base.with_name(base.name + f".{index}")
            for index in range(max(0, count))]


def _valid_backup_payloads(path: Path) -> list[bytes]:
    payloads: list[bytes] = []
    for backup in ledger_backup_paths(path):
        if not backup.exists():
            continue
        try:
            payload = backup.read_bytes()
            decode_ledger(payload, backup)
        except (LedgerError, OSError):
            continue
        payloads.append(payload)
    return payloads


def _write_rollback_copy(destination: Path, payload: bytes) -> Path:
    """Durably preserve one backup before its fixed-name slot is replaced."""
    rollback = destination.parent / f".{destination.name}.{uuid.uuid4().hex}.rollback"
    with rollback.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    return rollback


def _cleanup_stale_rollback_copies(destinations: list[Path]) -> None:
    """Remove superseded recovery generations after a complete rotation."""
    if not destinations:
        return
    try:
        candidates = list(destinations[0].parent.iterdir())
    except OSError:
        return
    prefixes = tuple(f".{destination.name}." for destination in destinations)
    for candidate in candidates:
        if not candidate.name.startswith(prefixes) or not candidate.name.endswith(".rollback"):
            continue
        try:
            candidate.unlink(missing_ok=True)
        except OSError:
            pass


def _rotate_backups(path: Path, old_payload: bytes) -> None:
    destinations = ledger_backup_paths(path)
    history = [old_payload, *_valid_backup_payloads(path)][:len(destinations)]

    changes: list[tuple[Path, bytes, Path | None]] = []
    rollback_copies: list[Path] = []
    try:
        # Preserve every destination before changing any of them.  This makes
        # a later slot failure recoverable without consuming older history.
        for destination, payload in zip(destinations, history):
            previous = destination.read_bytes() if destination.exists() else b""
            if previous == payload:
                continue
            rollback = None
            if destination.exists():
                rollback = _write_rollback_copy(destination, previous)
                rollback_copies.append(rollback)
            changes.append((destination, previous, rollback))
    except OSError:
        for rollback in rollback_copies:
            try:
                rollback.unlink(missing_ok=True)
            except OSError:
                pass
        raise

    committed: list[tuple[Path, bytes, Path | None]] = []
    retained_rollbacks: set[Path] = set()
    try:
        # Oldest-to-newest copying ensures the source history still exists in
        # its prior slot until the next slot is safely installed.
        desired = dict(zip(destinations, history))
        for destination, previous, rollback in reversed(changes):
            _atomic_replace_bytes(destination, desired[destination])
            committed.append((destination, previous, rollback))
    except OSError:
        restore_failures: list[str] = []
        for destination, previous, rollback in reversed(committed):
            try:
                if rollback is None:
                    destination.unlink(missing_ok=True)
                else:
                    os.replace(rollback, destination)
                    _fsync_directory(destination.parent)
            except OSError:
                # Keep the durable rollback file: even if the fixed slot
                # cannot be restored, the pre-existing recovery bytes remain.
                restore_failures.append(str(destination))
                if rollback is not None:
                    retained_rollbacks.add(rollback)
        if restore_failures:
            raise OSError(
                "backup rotation failed; preserved rollback copies remain for "
                + ", ".join(restore_failures)
            )
        raise
    else:
        # A complete new generation supersedes any rollback copies retained by
        # an older failed rotation, keeping recovery storage bounded.
        _cleanup_stale_rollback_copies(destinations)
    finally:
        for rollback in rollback_copies:
            if rollback in retained_rollbacks:
                continue
            try:
                rollback.unlink(missing_ok=True)
            except OSError:
                pass


def save_ledger_file(path: Path, data: dict) -> None:
    """Atomically replace a ledger, retaining only a validated old version."""
    path = Path(path)
    validate_ledger(data, path=path)
    try:
        payload = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise LedgerError(f"无法保存台账「{path}」：内容不能序列化为 JSON（{exc}）") from exc

    old_payload: bytes | None = None
    if path.exists():
        try:
            old_payload = path.read_bytes()
        except OSError as exc:
            raise LedgerError(f"无法备份旧台账「{path}」：{exc}") from exc
        # Never turn corrupt bytes into the last-known-good backup and never
        # overwrite a corrupt primary with a seemingly empty in-memory state.
        decode_ledger(old_payload, path)

    try:
        _atomic_replace_bytes(path, payload)
    except OSError as exc:
        raise LedgerError(f"无法原子保存台账「{path}」：{exc}；原台账已保留") from exc

    if old_payload is not None:
        try:
            _rotate_backups(path, old_payload)
        except OSError as exc:
            # The primary is already durably committed.  Treat backup refresh
            # as non-fatal so callers never mistake a successful ledger commit
            # for a rollback and repeat the logical mutation.  Existing
            # recovery history was restored (or retained as rollback copies).
            warnings.warn(
                f"台账已保存，但备份历史更新失败：{exc}",
                LedgerBackupWarning,
                stacklevel=2,
            )
