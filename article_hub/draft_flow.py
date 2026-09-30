"""Selected platforms: stage finished articles, then save verified drafts.

The platform applications retain their existing manual commands. This workflow
adds an idempotent queue filter before calling their draft-saving implementation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import threading
import importlib
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from . import config, library
from .manuscripts import manuscript_files

MODULES = {"今日头条": "toutiao_drafts", "知乎": "zhihu_drafts", "百家号": "baijiahao_drafts"}
PLATFORM_TIMEOUT = 900
TERMINAL = {"verified", "archived"}


def selected_platforms(value: str) -> list[str]:
    names = list(dict.fromkeys(part.strip() for part in value.split(",") if part.strip()))
    names = list(dict.fromkeys("今日头条" if name == "头条" else name for name in names))
    if not names or any(name not in MODULES for name in names):
        raise ValueError("请选择发文平台：" + "、".join(MODULES))
    return names


def _emit(message: str) -> None:
    print(message, flush=True)


def _result(platform, title, status, reason=""):
    _emit("[发送结果] " + json.dumps({"platform": platform, "title": title, "status": status, "reason": reason}, ensure_ascii=False))


def _safe_preupload_retry(record, predicate) -> bool:
    """Allow only a platform-confirmed failure from before file selection."""
    if (not record or record.get("status") != "needs_review"
            or record.get("draft_url") or not callable(predicate)):
        return False
    try:
        return bool(predicate(record))
    except Exception:
        return False


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class _TrackedWriter:
    """Record exactly the bytes written through our newly-created handle."""

    def __init__(self, stream):
        self.stream = stream
        self.hash = hashlib.sha256()
        self.size = 0

    def write(self, value):
        written = self.stream.write(value)
        if written is None:
            written = len(value)
        if written:
            self.hash.update(memoryview(value)[:written])
            self.size += written
        return written

    def __getattr__(self, name):
        return getattr(self.stream, name)

    def version(self, identity: tuple[int, int]) -> tuple[str, int, tuple[int, int]]:
        return self.hash.hexdigest(), self.size, identity


def _identity(stat) -> tuple[int, int]:
    return int(stat.st_dev), int(stat.st_ino)


def _remove_unchanged_new_file(queue, path: Path,
                               version: tuple[str, int, tuple[int, int]]) -> None:
    """Delete a file only while it is still the exact object/bytes we wrote."""
    expected_digest, expected_size, expected_identity = version
    try:
        # A replacement symlink or a path that now resolves outside the queue
        # belongs to somebody else; fail closed and leave it alone.
        if path.is_symlink() or queue.safe(path) != path.resolve() or not path.is_file():
            return
        before = path.stat()
        if _identity(before) != expected_identity or before.st_size != expected_size:
            return
        if _digest(path) != expected_digest:
            return
        after = path.stat()
        stable = (_identity(before), before.st_size, before.st_mtime_ns)
        if stable != (_identity(after), after.st_size, after.st_mtime_ns):
            return
        path.unlink()
    except (OSError, ValueError):
        # Rollback is deliberately conservative.  Losing the ledger write or
        # a failed copy must never authorize deleting an uncertain/manual file.
        return


def _remove_unchanged_new_files(
        queue, created: dict[Path, tuple[str, int, tuple[int, int]]]) -> None:
    """Roll back only files this preparation created and nobody changed."""
    for path, version in created.items():
        _remove_unchanged_new_file(queue, path, version)


def prepare(platform: str, queue, load_article, *, only: str | None = None,
            retry_without_url=None) -> tuple[list, list[str]]:
    """Stage new finished files without replacing an existing pending upload."""
    from .image_review import assert_ready_for_dispatch
    # Keep the complete hub-ledger read/modify/write under one cross-process
    # transaction.  Queue staging is deliberately included: committing an old
    # in-memory snapshot after another process records a publication would
    # otherwise erase the newer state.
    created: dict[Path, tuple[str, int, tuple[int, int]]] = {}
    allowed_versions: set[tuple[str, str]] | None = set() if only else None
    try:
      with library.ledger_transaction(sync=True) as data:
        formatted = library.scan_formatted()
        selected = [item for item in formatted if not only or item["主题"] == only]
        # The platform queue names files from their display titles.  Refuse the
        # whole preparation pass before touching that queue when two distinct
        # topics would resolve to the same filename; sending either copy would
        # be ambiguous and could make the other look completed.
        library.assert_no_title_collisions(data, selected)
        issues: list[str] = []
        blocked: set[Path] = set()
        blocked_versions: dict[str, str] = {}
        pending_sources = {}
        for stored in data['文章'].values():
            receipt = (stored.get('分发') or {}).get(platform) or {}
            if receipt.get('文件') and receipt.get('成稿'):
                pending_sources[Path(receipt['文件']).resolve()] = Path(receipt['成稿'])
        for item in selected:
            if not int(item.get("配图数") or 0):
                _emit(f"[跳过] {item['标题']}：尚未配图排版")
                continue
            target = queue.pending / f"{item['标题']}.docx"
            try:
                target = queue.safe(target)
                try:
                    assert_ready_for_dispatch(item['成稿'])
                except (ValueError, OSError) as exc:
                    # A copy renamed or moved into a pending subfolder is still the
                    # same stale version; don't let that bypass the review gate.
                    blocked_versions[_digest(Path(item['成稿']))] = str(exc)
                    raise
                article = load_article(item["成稿"])
                if allowed_versions is not None:
                    allowed_versions.add((article.fingerprint, article.source_digest))
                record = queue.get(article.fingerprint)
                if record and record["status"] in TERMINAL:
                    _result(platform, item["标题"], "skipped")
                    _emit(f"[已完成] {item['标题']}：已在{platform}草稿箱，跳过重复发送")
                    continue
                if (record and not record.get("draft_url")
                        and not _safe_preupload_retry(record, retry_without_url)):
                    detail = (record.get("error") or "没有取得草稿地址").replace("\n", " ")
                    raise ValueError(f"上次保存结果未确认：{detail}；请先在平台草稿箱核对，避免重复")
                if target.exists():
                    if _digest(target) != article.source_digest:
                        raise ValueError("待发目录已有不同版本，保留原文件，请核对后再发送")
                else:
                    # Exclusive creation avoids replacing a file added during preparation.
                    try:
                        output = target.open("xb")
                    except FileExistsError:
                        raise ValueError("待发目录刚新增同名文件，请核对后再发送")
                    identity = _identity(os.fstat(output.fileno()))
                    tracked = _TrackedWriter(output)
                    try:
                        with output, Path(item["成稿"]).open("rb") as source:
                            try:
                                shutil.copyfileobj(source, tracked)
                            finally:
                                # Make all bytes represented by the tracker
                                # visible before deciding whether cleanup is safe.
                                tracked.flush()
                    except BaseException:
                        _remove_unchanged_new_file(queue, target, tracked.version(identity))
                        raise
                    version = tracked.version(identity)
                    try:
                        if _digest(target) != article.source_digest:
                            raise ValueError("成稿在准备时发生变化，请核对待发文件")
                    except BaseException:
                        _remove_unchanged_new_file(queue, target, version)
                        raise
                    created[target] = version
                record = data["文章"].setdefault(item["主题"], {})
                record.setdefault("分发", {})[platform] = {
                    "时间": datetime.now().isoformat(timespec="seconds"),
                    "文件": str(target), "成稿": str(item["成稿"]), "标题": item["标题"],
                }
                record["分发平台"] = library.dispatched_platforms(record)
            except Exception as exc:
                blocked.add(target.resolve())
                issues.append(f"{item['标题']}：{exc}")
                _result(platform, item['标题'], 'unconfirmed', str(exc))
    except BaseException:
        _remove_unchanged_new_files(queue, created)
        raise

    ready = []
    seen = set()
    for path in manuscript_files(queue.pending):
        if not path.is_file() or path.suffix.lower() not in {".docx", ".md", ".txt"} or path.name.startswith("~$"):
            continue
        if path.resolve() in blocked:
            continue
        try:
            article = load_article(queue.safe(path))
            if allowed_versions is not None and (article.fingerprint, article.source_digest) not in allowed_versions:
                continue
            record = queue.get(article.fingerprint)
            if record and record["status"] in TERMINAL:
                _result(platform, article.title, "skipped")
                queue.archive(article)
                _emit(f"[已完成] {article.title}：已保存，完成本地归档")
                continue
            if article.source_digest in blocked_versions:
                raise ValueError(blocked_versions[article.source_digest])
            if path.resolve() in pending_sources:
                assert_ready_for_dispatch(pending_sources[path.resolve()])
            if record:
                if (not record.get("draft_url")
                        and not _safe_preupload_retry(record, retry_without_url)):
                    detail = (record.get("error") or "没有取得草稿地址").replace("\n", " ")
                    raise ValueError(f"上次保存结果未确认：{detail}；请在平台草稿箱核对后处理")
                if not record.get("source_digest") or record["source_digest"] != article.source_digest:
                    raise ValueError("文件在上次上传后有改动，保留原稿等待核对")
            if article.fingerprint in seen:
                _emit(f"[跳过] {article.title}：同批重复稿，保留副本")
                continue
            seen.add(article.fingerprint)
            ready.append(article)
        except Exception as exc:
            issues.append(f"{path.name}：{exc}")
            _result(platform, str(path.relative_to(queue.pending)), 'unconfirmed', str(exc))
    return ready, issues


def run_platform(platform: str, only: str | None = None) -> int:
    """Runs in an isolated child process so stop/timeout includes its browser."""
    paths = config.load_platforms().get(platform)
    if not paths or not paths["root"].is_dir():
        _emit(f"[待处理] {platform}：平台目录不存在")
        return 1
    root = paths["root"].resolve()
    if paths["pending"].resolve() != root / "待发文章":
        _emit(f"[待处理] {platform}：待发目录设置与平台程序不一致")
        return 1
    sys.path.insert(0, str(root))
    queue = None
    try:
        module = MODULES[platform]
        queue_type = importlib.import_module(module + ".queue").DraftQueue
        load_article = importlib.import_module(module + ".articles").load_article
        sender = importlib.import_module(module + ".__main__")
        run = sender.run
        retry_without_url = getattr(sender, "_safe_to_retry_without_url", None)
        queue = queue_type(root)
        with queue.lock():
            articles, issues = prepare(
                platform, queue, load_article, only=only,
                retry_without_url=retry_without_url,
            )
            for issue in issues:
                _emit(f"[待处理] {platform} · {issue}")
            if not articles:
                _emit(f"{platform}：没有可发送的新稿，已完成的不会重复发送。")
                return 1 if issues else 0
            _emit(f"[进度] {platform}：准备送入 {len(articles)} 篇，请在弹出的窗口完成登录")
            # Keep the platform's interval and independent read-back verification.
            # A finite limit also removes the old command's unnecessary wait after
            # the last article; the spacing between articles stays unchanged.
            try:
                # A platform editor can retain an unrelated abandoned draft after a
                # failed import. Once preflight has confirmed there is no saved
                # receipt, clear that stale editor state before importing the
                # current source; saved drafts are still protected by the queue.
                run(queue, articles, argparse.Namespace(limit=len(articles), interval=12, cdp=None, reset_editor=True))
            except Exception as exc:
                issues.append(f"运行中断：{str(exc)[:500]}")
                _emit(f"[待处理] {platform}：{issues[-1]}")
            # Inspect every queue record even after an exception; preserve partial success.
            saved = 0
            for article in articles:
                record = queue.get(article.fingerprint) or {}
                if record.get("status") in TERMINAL:
                    saved += 1
                    _result(platform, article.title, "saved")
                else:
                    issue = f"{article.title}：{record.get('error') or '未确认保存成功，原稿保留'}"
                    issues.append(issue)
                    _result(platform, article.title, "unconfirmed", record.get("error") or "未确认保存成功")
                    _emit(f"[待处理] {platform} · {issue}")
            _emit(f"{platform}：本次 {saved} 篇进入草稿箱，{len(issues)} 项待处理。")
            return 1 if issues else 0
    except Exception as exc:
        _emit(f"[待处理] {platform}：{str(exc)[:500]}")
        return 1
    finally:
        if queue is not None:
            queue.close()
        library.sync_receipts()


def _kill_tree(process) -> None:
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        result = subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode == 0:
            return
    process.kill()


def run_all(platforms: list[str], only: str | None = None) -> int:
    failures = []
    executable = Path(sys.executable)
    if executable.name.lower() == "pythonw.exe":
        executable = executable.with_name("python.exe")
    for index, platform in enumerate(platforms, 1):
        _emit(f"[进度] 写第 {index}/{len(platforms)} 个平台：{platform}")
        process = None
        try:
            command = [str(executable), "-u", "-X", "utf8", "-m", "article_hub.draft_flow",
                       "--platform", platform]
            if only:
                command.extend(["--only", only])
            process = subprocess.Popen(
                command,
                cwd=str(config.ROOT),
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            def relay():
                for line in process.stdout:
                    _emit(line.rstrip("\r\n"))
            reader = threading.Thread(target=relay, daemon=True)
            reader.start()
            code = process.wait(timeout=PLATFORM_TIMEOUT)
            reader.join(timeout=5)
            if code:
                failures.append(platform)
        except subprocess.TimeoutExpired:
            _kill_tree(process)
            process.wait()
            failures.append(platform)
            _emit(f"[待处理] {platform}：超过 {PLATFORM_TIMEOUT // 60} 分钟，已停止该平台并保留进度")
        except Exception as exc:
            failures.append(platform)
            _emit(f"[待处理] {platform}：{exc}")
        finally:
            if process is not None and process.poll() is None:
                _kill_tree(process)
        _emit(f"[进度] 完成 {index}/{len(platforms)} 个平台")
    if failures:
        _emit(f"草稿处理结束：{'、'.join(failures)}有待处理项；已完成的平台保留进度，详情见运行记录。")
    else:
        _emit(f"草稿处理完成：已检查 {len(platforms)} 个平台，新稿已送入草稿箱，已完成稿件自动跳过。")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="成稿一步送入所选平台草稿箱")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--platforms")
    group.add_argument("--platform", choices=tuple(MODULES))
    parser.add_argument("--only", help="只处理指定主题")
    args = parser.parse_args()
    if args.platform:
        return run_platform(args.platform, only=args.only)
    return run_all(selected_platforms(args.platforms), only=args.only)


if __name__ == "__main__":
    raise SystemExit(main())
