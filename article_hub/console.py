"""文章总库控制台：一个本地网页，点按钮就能跑现有命令。

只监听 127.0.0.1，只用标准库（http.server），不引入新依赖。
每个按钮背后就是一条已经存在的命令行，输出实时回传，跑完给出一句结果。
"""

from __future__ import annotations

import json
import hashlib
import hmac
import html
import mimetypes
import os
import re
import secrets
import subprocess
import sys
import threading
import time as _time
from contextlib import contextmanager
from datetime import datetime
from http.client import HTTPConnection, HTTPSConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit
import ssl

from . import (config, library, image_review, model_settings, topics,
               topic_service, topic_packages, topic_research, topic_research_sources,
               console_auth, console_access, console_network)

PAGE_FILE = Path(__file__).with_name("console_page.html")
LOGIN_PAGE_FILE = Path(__file__).with_name("console_login.html")
LOGIN_STATUS_MARKER = "__HAODUOYU_LOGIN_STATUS__"
AUTH_MANAGER = console_auth.AUTH_MANAGER
DAILY_DIR = config.ROOT / "选题" / "每日选题"

def _isolated_platform_dirs() -> dict[str, Path]:
    """Resolve the configured platform folders and fail closed on path escape."""
    configured = config.load_platforms()
    workspace = config.ROOT.resolve()
    aliases = {"头条": "今日头条", "知乎": "知乎", "百家号": "百家号"}
    result = {}
    for alias, name in aliases.items():
        paths = configured.get(name)
        if not paths:
            raise RuntimeError(f"独立开发区缺少平台目录配置：{name}")
        for part in ("root", "pending", "sent", "receipts"):
            target = Path(paths[part]).resolve()
            if not target.is_relative_to(workspace):
                raise RuntimeError(f"平台{name}的{part}目录越出独立开发区，已拒绝启动")
        result[alias] = Path(paths["root"]).resolve()
    return result


PLATFORM_DIRS = _isolated_platform_dirs()
PLATFORM_ALIASES = {"头条": "今日头条", "今日头条": "今日头条",
                    "知乎": "知乎", "百家号": "百家号"}

# 每个按钮跑完，从输出里抠一句人话当结果提示。
SUMMARY_RULES = (
    ("选题", r"已找到\s*(\d+)\s*个选题", "已找到 {n} 个选题"),
    ("配图", r"本次完成\s*(\d+)\s*篇", "已配好 {n} 篇"),
    ("搜图预览", r"本次完成\s*(\d+)\s*篇", "已搜好 {n} 篇配图，请在下方确认"),
    ("小红书搜图", r"本次完成\s*(\d+)\s*篇", "已搜好 {n} 篇小红书配图，请在下方确认"),
    ("排版", r"本次排版\s*(\d+)\s*篇", "已排版 {n} 篇"),
    ("预览", r"已生成总库预览", "预览已刷新"),
    ("时间表", r"发文时间表", "时间表已刷新"),
    ("头条", r"本次\s*(\d+)\s*篇进入", "已送进头条草稿箱 {n} 篇"),
    ("知乎", r"本次\s*(\d+)\s*篇进入", "已送进知乎草稿箱 {n} 篇"),
    ("百家号", r"本次\s*(\d+)\s*篇进入", "已送进百家号草稿箱 {n} 篇"),
)


def tasks() -> dict[str, dict]:
    table: dict[str, dict] = {
        # ① 找选题：抓头条热榜 → 直接调模型接口写「得到大脑提示词」，约 2 分钟。
        "选题": {"title": "一键找选题", "cwd": config.ROOT,
                 "argv": ["-m", "article_hub", "找选题"]},
        "配图": {"title": "全网搜图 · 网络不足时 AI 补缺 · 等待审核", "cwd": config.ROOT,
                 # 图源不写进正文：来源只在 配图来源.md 里留档给作者核对。
                 "argv": ["-m", "article_hub", "配图", "--无图注"]},
        "补AI配图": {"title": "网络配图完成后补 AI 图", "cwd": config.ROOT,
                      "argv": ["-m", "article_hub.ai_supplement"]},
        "搜图预览": {"title": "头条与小红书搜图（待确认）", "cwd": config.ROOT,
                     "argv": ["-m", "article_hub", "配图", "--不排版"]},
        "小红书搜图": {"title": "小红书搜图（待确认）", "cwd": config.ROOT,
                       "argv": ["-m", "article_hub", "配图", "--来源", "小红书", "--不排版"]},
        "登录小红书": {"title": "登录小红书", "cwd": config.ROOT,
                       "argv": ["-m", "article_hub", "登录小红书"]},
        "排版": {"title": "自动排版", "cwd": config.ROOT,
                 "argv": ["-m", "article_hub", "排版"]},
        "预览": {"title": "刷新预览", "cwd": config.ROOT,
                 "argv": ["-m", "article_hub", "预览"]},
        "时间表": {"title": "刷新时间表", "cwd": config.ROOT,
                    "argv": ["-m", "article_hub", "时间表"]},
        "一键送草稿": {"title": "一键送草稿箱", "cwd": config.ROOT,
                       "argv": ["-m", "article_hub.draft_flow"]},
    }
    return table


class Job:
    """一次按钮点击对应一个后台进程。"""

    def __init__(self, job_id: int, task: str, title: str, topic: str = ""):
        self.id = job_id
        self.task = task
        self.title = title
        self.topic = topic
        self.status = "running"
        self.lines: list[str] = []
        self.summary = ""
        self.started = datetime.now().strftime("%H:%M:%S")
        self.started_at = _time.time()
        self.finished = ""
        self.process = None
        self.stopped = False
        self.timed_out = False

    def snapshot(self) -> dict:
        image_progress = None
        for line in reversed(self.lines):
            if not line.startswith('[图片进度] '):
                continue
            try:
                payload = json.loads(line[len('[图片进度] '):])
            except (TypeError, ValueError):
                continue
            if isinstance(payload, dict) and payload.get('topic') == self.topic:
                image_progress = payload
                break
        return {"id": self.id, "task": self.task, "title": self.title,
                "topic": self.topic,
                "status": self.status, "summary": self.summary,
                "lines": self.lines[-400:], "image_progress": image_progress,
                "started": self.started,
                "started_at": self.started_at, "finished": self.finished}


LOCK = threading.Lock()
OPERATION_LOCK = threading.RLock()
STARTUP_LOCK = threading.Lock()
CLEAR_IMAGES_LOCK = threading.Lock()
CURRENT: "Job | None" = None
JOBS: dict[str, "Job"] = {}


def task_scope(task: str, topic: str = "") -> str:
    if task == "选题":
        return "topics"
    if task == "排版" and topic:
        # Only stable-ID packages use the independent local-layout lane. Keep
        # the established legacy Word batch and per-article behavior intact.
        try:
            if topic_packages.is_package(image_review.topic_path(topic)):
                return "layout:" + topic
        except (ValueError, OSError):
            pass
    if task in {"配图", "补AI配图", "搜图预览", "小红书搜图", "登录小红书"}:
        return "images"
    if task == "排版":
        return "images"
    if task == "一键送草稿":
        return "drafts"
    return "library"


def jobs_snapshot() -> dict:
    with LOCK:
        jobs = dict(JOBS)
        if CURRENT is not None:
            jobs.setdefault(task_scope(CURRENT.task, CURRENT.topic), CURRENT)
        return {scope: job.snapshot() for scope, job in jobs.items()}


def scope_busy(scope=None) -> bool:
    jobs = jobs_snapshot()
    active = any(j['status'] == 'running' for key, j in jobs.items()
                 if scope is None or key == scope
                 or (scope in {'layout', 'layouts'} and key.startswith('layout:')))
    if scope in (None, 'topics'):
        with topic_service.LOCK:
            active = active or topic_service.OPERATION.get('status') == 'running'
    return active


def _active_article_image_jobs() -> list[Job]:
    with LOCK:
        jobs = list(JOBS.values())
        if CURRENT is not None and all(job.id != CURRENT.id for job in jobs):
            jobs.append(CURRENT)
    return [job for job in jobs if job.status == 'running'
            and job.task in {'配图', '补AI配图', '搜图预览', '小红书搜图', '排版'}]


def article_image_job(topic: str) -> Job | None:
    """Return running image work that actually touches this article."""
    for job in sorted(_active_article_image_jobs(), key=lambda item: item.started_at, reverse=True):
        if job.topic:
            if job.topic == topic:
                return job
            continue
        # A traditional whole-library Word run only touches legacy drafts. It
        # must not block an independently imported topic package.
        try:
            folder = image_review.topic_path(topic)
            if topic_packages.is_package(folder):
                continue
            modified, report = image_review._read_status(config.DATA / '配图进度.json')
            if modified < job.started_at:
                return job  # Until fresh per-article progress arrives, fail closed.
            articles = report.get('文章', [])
            if not isinstance(articles, list) or not articles:
                if report.get('状态') == '运行中':
                    return job
                continue
            active = [row for row in articles if isinstance(row, dict)
                      and row.get('状态') in {'运行中', '排队中'}]
            if any(row.get('topic') == folder.name
                   or (not row.get('topic') and row.get('标题') == folder.name)
                   for row in active):
                return job
        except (ValueError, OSError):
            return job
    return None


def article_image_busy(topic: str) -> bool:
    """Check image work against the affected article, not the whole page."""
    return article_image_job(topic) is not None
COUNTER = {"value": 0}
CACHE: dict = {"at": 0.0, "overview": None, "images_at": 0.0, "images": None}
SERVER: dict = {"httpd": None, "port": None, "bind_address": None,
                "scheme": None, "mode": None}
CLEAR_IMAGE_CONFIRMATIONS: dict[str, dict] = {}
JOB_TIMEOUT = 900  # 单次任务最长 15 分钟，超时就杀掉，免得卡死控制台
UNTIMED_IMAGE_TASKS = {"配图", "补AI配图", "搜图预览", "小红书搜图"}

CONSOLE_SERVICE = "haoduoyu-article-hub-console"
CONSOLE_PROTOCOL = 1
WRITE_TOKEN_HEADER = "X-Haoduoyu-Token"
PAGE_TOKEN_MARKER = '"__HAODUOYU_REQUEST_TOKEN__"'
CLEAR_IMAGE_TTL = 60
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"}
SENSITIVE_IMAGE_DIRS = {
    ".git", "data", "debug", "diagnostic", "diagnostics", "log", "logs", "profile", "profiles",
    "screenshots", "browser-profile", "edge-profile", "图标", "日志", "截图", "配置",
    "小红书配置", "头条配置", "知乎配置", "百家号配置",
}


def _summary_for(task: str, lines: list[str], code: int) -> str:
    text = "\n".join(lines)
    if task == "选题":
        summaries = [line.strip() for line in lines if line.strip().startswith("候选 ")]
        if summaries:
            return summaries[-1]
    if task == "一键送草稿":
        summaries = [line for line in lines if line.startswith("草稿处理")]
        if summaries:
            return summaries[-1]
    if code != 0:
        errors = [line.strip() for line in lines if "没写成：" in line or "接口还没准备好：" in line
                  or line.startswith(("[跳过]", "[待处理]"))]
        if errors:
            if task == "配图":
                details = [line.strip() for line in lines
                           if line.startswith(("[无图]", "[筛图]", "[下载失败]",
                                               "[配图结果]", "[提示] 按选题清单搜图未完成"))]
                if details:
                    return errors[-1] + "\n" + "\n".join(details[-4:])
            return errors[-1]
    for name, pattern, template in SUMMARY_RULES:
        if name != task or code != 0:
            continue
        found = list(re.finditer(pattern, text))
        if found:
            groups = found[-1].groups()
            return template.format(n=groups[0] if groups else "")
    tail = [line.strip() for line in lines if line.strip()]
    if code == 0:
        return tail[-1] if tail else "完成"
    return "没跑通：" + (tail[-1] if tail else f"退出码 {code}")


def _watchdog(job: Job, process, timeout: int) -> None:
    """到点还没结束就杀掉，别让一个卡住的任务占着控制台。"""
    deadline = _time.monotonic() + timeout
    while _time.monotonic() < deadline:
        if process.poll() is not None:
            return
        _time.sleep(2)
    with LOCK:
        job.timed_out = True
    try:
        _kill_process(process)
    except Exception:
        pass


def _kill_process(process) -> None:
    """Windows 的浏览器任务会启动子进程，停止时一起收尾。"""
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        result = subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode == 0:
            return
    process.kill()


def _worker_environment(overrides=None) -> dict:
    """Drop ambient app settings, forwarding only the explicit network-mode switch."""
    env = {key: value for key, value in os.environ.items()
           if not key.startswith('ARTICLE_HUB_')}
    project_only = os.environ.get('ARTICLE_HUB_NETWORK_MODEL_CONFIG') == 'project'
    if project_only:
        env['ARTICLE_HUB_NETWORK_MODEL_CONFIG'] = 'project'
    env.update(overrides or {})
    if project_only:
        env['ARTICLE_HUB_NETWORK_MODEL_CONFIG'] = 'project'
    return env


def _execute(job: Job, spec: dict) -> None:
    # 配图耗时随篇数和候选图数量增长，不设整批总时限；仍可手动停止。
    timeout = None if job.task in UNTIMED_IMAGE_TASKS else spec.get("timeout", JOB_TIMEOUT)
    if spec.get("exe"):
        argv = [spec["exe"], *spec["argv"]]
    else:
        # -u：子进程不缓冲输出，控制台才能实时看到进度
        executable = Path(sys.executable)
        if executable.name.lower() == "pythonw.exe":
            executable = executable.with_name("python.exe")
        argv = [str(executable), "-u", "-X", "utf8", *spec["argv"]]
    try:
        with LOCK:
            if job.stopped:
                job.status = "bad"
                job.summary = "已手动停止"
                return
        process = subprocess.Popen(
            argv, cwd=str(spec["cwd"]), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            env=_worker_environment(spec.get('env', {})))
        with LOCK:
            job.process = process
            if job.stopped:
                _kill_process(process)
        if timeout is not None:
            threading.Thread(target=_watchdog, args=(job, process, timeout), daemon=True).start()
        assert process.stdout is not None
        for line in process.stdout:
            with LOCK:
                job.lines.append(line.rstrip("\n"))
        code = process.wait()
    except Exception as exc:
        with LOCK:
            job.lines.append(f"启动失败：{exc}")
        code = -1
    with LOCK:
        job.status = "ok" if code == 0 and not (job.stopped or job.timed_out) else "bad"
        CACHE["at"] = 0.0
        CACHE["images_at"] = 0.0
        job.finished = datetime.now().strftime("%H:%M:%S")
        job.summary = _summary_for(job.task, job.lines, code)
        if job.stopped:
            job.summary = "已手动停止"
        elif job.timed_out:
            job.summary = f"跑了超过 {timeout // 60} 分钟，已自动停止"
        if job.task == "一键送草稿":
            path = config.DATA / "最近发送结果.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(job.snapshot(), ensure_ascii=False, indent=2), encoding="utf-8")


def stop(scope: str | None = None, job_id: str | None = None) -> dict:
    """停掉正在跑的任务。"""
    with LOCK:
        candidates = list(JOBS.values()) or ([CURRENT] if CURRENT else [])
        candidates = [j for j in candidates if j.status == 'running'
                      and (scope is None or task_scope(j.task, j.topic) == scope)
                      and (job_id is None or str(j.id) == str(job_id))]
        if len(candidates) != 1:
            return {"error": "现在没有在跑的任务。"}
        job = candidates[0]
        job.stopped = True
        process = job.process
    if process is not None:
        try:
            _kill_process(process)
        except Exception:
            pass
    return {"ok": True}


def start(task: str, *, topic: str = "", provider: str = "", model: str = "", sources: str | None = None,
          platforms: str | None = None, categories: str | None = None,
          allow_ai_images: bool = False, word_name: str = "") -> dict:
    """每个模块一个后台任务，不同模块可并行。"""
    global CURRENT
    table = tasks()
    if task not in table:
        return {"error": f"没有这个按钮：{task}"}
    if task == '补AI配图':
        return {'error': '请在图片审阅卡片中选择 AI 生成图片和生图模型'}
    spec = table[task]
    if task == "一键送草稿":
        from .draft_flow import PLATFORM_TIMEOUT, selected_platforms
        try:
            names = selected_platforms(platforms or "")
        except ValueError as exc:
            return {"error": str(exc)}
        spec = {**spec, "argv": [*spec["argv"], "--platforms", ",".join(names)],
                "title": "送入草稿箱 · " + "、".join(names),
                "timeout": PLATFORM_TIMEOUT * len(names) + 60}
    elif platforms is not None:
        return {"error": "这个任务不支持选择发文平台"}
    if sources is not None:
        from .sourcing import SOURCE_ORDER
        from .topics import TOPIC_SOURCES
        allowed = TOPIC_SOURCES if task == "选题" else SOURCE_ORDER
        names = list(dict.fromkeys(part.strip() for part in sources.split(",") if part.strip()))
        if task not in {"选题", "配图", "搜图预览"} or not names or any(name not in allowed for name in names):
            return {"error": "请选择有效的来源：" + "、".join(allowed)}
        spec = {**spec, "argv": [*spec["argv"], "--来源", ",".join(names)]}
    if categories is not None:
        from .topics import selected_categories
        if task != "选题":
            return {"error": "这个任务不支持话题分类"}
        try:
            names = selected_categories(categories)
        except ValueError as exc:
            return {"error": str(exc)}
        spec = {**spec, "argv": [*spec["argv"], "--话题", ",".join(names)]}
    scope = 'topics' if task == '选题' else ('images' if task in {'配图','补AI配图','搜图预览','小红书搜图'} else '')
    if scope:
        try:
            choice = model_settings.public_config()['choices'][scope]
            provider = provider or choice['provider']
            model = model or (choice['model'] if provider == choice['provider'] else '')
            if scope == 'images' and provider not in {'gpt', 'deepseek', 'doubao'}:
                return {'error': '网络搜图模型仅支持 GPT、DeepSeek 或豆包，请在模型设置中选择其中一个'}
            if provider != 'rules' or scope != 'images':
                info = model_settings.resolve(provider, model)
                spec = {**spec, 'env':{'ARTICLE_HUB_PROVIDER':provider, 'ARTICLE_HUB_MODEL':model,
                                      'ARTICLE_HUB_IMAGE_AI':'1' if scope == 'images' else '',
                                      'ARTICLE_HUB_ALLOW_AI_IMAGES':'1' if task == '补AI配图' else ''},
                        'title':spec['title']+' · '+model}
        except (ValueError, OSError) as exc:
            return {'error':str(exc)}
    if scope == 'images':
        spec = {**spec, 'env': {**spec.get('env', {}),
                               'ARTICLE_HUB_ALLOW_AI_IMAGES': '0'}}
    if topic:
        if task not in {"排版", "配图", "补AI配图"}:
            return {"error": "这个任务不支持单篇操作"}
        try:
            image_review.ensure_editable(topic)
            folder = image_review.topic_path(topic)
            if task in {'排版', '配图'} and article_image_busy(topic):
                return {"error": "本篇正在搜图或排版，请等本篇任务完成后再启动另一项操作。"}
            if task == "排版":
                if topic_packages.is_package(folder):
                    package = topic_packages.load(folder)  # damaged/missing plans fail closed
                    if not topic_packages.is_imported(folder):
                        return {"error": "请先在选题卡点击「一键导入配图清单」，再审核图片和排版"}
                    if topic_packages.imported_word(folder) is None:
                        if article_image_busy(topic):
                            return {"error": "本篇正在搜图，等本轮完成后再读取标题文件夹里的 Word。"}
                        topic_packages.import_word_from_export(package['topic_id'], filename=word_name or None)
                review_state = image_review.load_review(folder)
                states = list(review_state['states'].values())
                approved_count = states.count('approved')
                if not approved_count:
                    # 计划张数只是建议：保留几张都能定稿，但至少要有一张。
                    pending_count = states.count('pending')
                    if pending_count:
                        return {"error": f"还有 {pending_count} 张图片待审阅；请至少保留一张图片再定稿"}
                    return {"error": "还没有保留任何图片；请逐张选择保留、换一张或去掉，至少保留一张再定稿"}
        except (OSError, ValueError) as exc:
            return {"error": str(exc)}
        if task == '配图':
            try:
                planned = topic_packages.is_package(folder)
                if planned:
                    topic_packages.load(folder)  # fail closed on a malformed plan
                    if not sources:
                        return {'error': '请先明确选择至少一个图片来源；新选题不会自动替你选择图源'}
                return start_image_action({'topic': topic, 'mode': 'search' if planned else 'auto', 'image': '',
                    'count': image_review.target_count(folder),
                    'provider': provider, 'model': model,
                    'sources': [part.strip() for part in sources.split(',') if part.strip()]
                               if sources else ['全网']})
            except (OSError, ValueError) as exc:
                return {'error': str(exc)}
        spec = {**spec, "argv": ["-m", "article_hub.ai_supplement" if task == "补AI配图" else "article_hub.image_review", topic]}
        if task == '排版' and topic_packages.is_package(folder):
            collaboration = model_settings.image_collaboration()
            if collaboration.get('mode') == 'collaborative':
                collaboration = model_settings.validate_image_collaboration(collaboration)
                spec = {**spec, 'env':{**spec.get('env', {}),
                                      'ARTICLE_HUB_IMAGE_COLLABORATION':
                                          json.dumps(collaboration, ensure_ascii=False)}}
    job_scope = task_scope(task, topic)
    if scope_busy(job_scope):
        return {"error": "本模块已有任务在运行，请完成或停止后再操作。"}
    with LOCK:
        previous = JOBS.get(job_scope)
        if previous is not None and previous.status == "running":
            return {"error": "上一个任务还在跑，等它结束再点。"}
        COUNTER["value"] += 1
        CURRENT = Job(COUNTER["value"], task, spec["title"], topic=topic)
        job = CURRENT
        JOBS[job_scope] = job
        threading.Thread(target=_execute, args=(job, spec), daemon=True).start()
        return {"job": job.snapshot()}


def start_image_action(data):
    from . import image_actions
    # Persisted model settings are authoritative; a stale browser snapshot must
    # not shadow a configuration saved in another tab or during a running round.
    if isinstance(data, dict) and isinstance(data.get('topic'), str):
        try:
            folder = image_review.topic_path(data['topic'])
            saved_collaboration = (model_settings.image_collaboration()
                                  if topic_packages.is_package(folder) else None)
        except ValueError:
            saved_collaboration = None
        if saved_collaboration and saved_collaboration.get('mode') == 'collaborative':
            data = {**data, 'image_mode':'collaborative',
                    'collaboration':saved_collaboration}
    global CURRENT
    payload = image_actions.validate(data)
    if article_image_busy(payload['topic']):
        return {'error': '本篇正在搜图或排版，请等本篇任务完成后再启动另一项操作。'}
    mode = ('按选题清单搜图' if payload.get('topic_package') and not payload.get('image') else
            '收集候选图（全网优先）' if payload['mode'] == 'auto' else
            '寻找替换图（网络优先）' if payload['mode'] == 'search' else 'GPT 生成候选图')
    title = mode + ' · ' + (payload['model'] or '规则搜索')
    spec = {'cwd': config.ROOT, 'argv': ['-m', 'article_hub.image_actions'],
            'title': title, 'env': {'ARTICLE_HUB_IMAGE_ACTION': json.dumps(payload, ensure_ascii=False)}}
    with LOCK:
        previous = JOBS.get('images')
        if previous is not None and previous.status == 'running':
            return {'error': '上一个任务正在运行，请完成或停止后再操作'}
        COUNTER['value'] += 1
        CURRENT = Job(COUNTER['value'], '配图', title, topic=payload['topic'])
        job = CURRENT
        JOBS['images'] = job
        threading.Thread(target=_execute, args=(job, spec), daemon=True).start()
        return {'job': job.snapshot()}


def _job_snapshot():
    with LOCK:
        return CURRENT.snapshot() if CURRENT is not None else None


def overview(*, force: bool = False) -> dict:
    """历史与统计：篇数、字数、配图、各平台草稿箱进度。"""
    now = _time.monotonic()
    if not force and CACHE["overview"] is not None and now - CACHE["at"] < 10:
        return CACHE["overview"]
    # 必须先同步各平台回执，否则已经存进草稿箱的稿子还显示成「待发」。
    job = _job_snapshot()
    # 后台任务会写台账；轮询此时只读，避免旧快照覆盖任务的新结果。
    data = library.load_ledger() if scope_busy() else library.sync_receipts()
    platforms = config.PLATFORM_ORDER
    totals = {"篇数": 0, "字数": 0, "配图": 0}
    removed = []
    per_platform = {name: {"草稿箱": 0, "已发布": 0, "待发": 0} for name in platforms}
    rows = []
    for topic, record in data["文章"].items():
        if record.get('列表已删除'):
            removed.append({'主题': topic, '标题': record.get('标题', topic)})
            continue
        totals['篇数'] += 1
        totals["字数"] += int(record.get("正文字数") or 0)
        totals["配图"] += int(record.get("配图数") or 0)
        marks = {}
        for name in platforms:
            completed = library.platform_completion(record, name)
            if completed != '已发布' and name in record.get('手动草稿标记', {}):
                completed = '草稿箱'
            if completed != '已发布' and name in record.get('手动待发标记', {}):
                marks[name] = '待发'
                per_platform[name]['待发'] += 1
                continue
            if completed:
                marks[name] = completed
                per_platform[name][completed] += 1
            elif name in (record.get("分发") or {}):
                marks[name] = "待发"
                per_platform[name]["待发"] += 1
            else:
                marks[name] = "—"
        rows.append({"主题": topic, "标题": record.get("标题", ""),
                     "字数": int(record.get("正文字数") or 0),
                     "配图": int(record.get("配图数") or 0), "平台": marks})
    rows.sort(key=lambda item: item["标题"])
    result = {"totals": totals, "per_platform": per_platform, "articles": rows, "removed": removed,
              "更新": data.get("更新", "")}
    CACHE["overview"] = result
    CACHE["at"] = now
    return result


def latest_topics() -> list[dict]:
    """首页只显示「最近一批」新选题，旧的不再出现。"""
    if not DAILY_DIR.is_dir():
        return []
    recent = DAILY_DIR / ".最近一批.json"
    names: list[str] = []
    when = ""
    if recent.exists():
        try:
            payload = json.loads(recent.read_text(encoding="utf-8"))
            names = [str(name) for name in payload.get("文件", [])]
            when = str(payload.get("时间", ""))
        except (OSError, ValueError):
            names, when = [], ""
    intermediate_suffixes = ("_独立提示词.md", "_选题卡.md", "_提示词.md")
    paths = [DAILY_DIR / name for name in names]
    paths = [path for path in paths
             if path.is_file() and not path.name.endswith(intermediate_suffixes)]
    if not paths:  # 没有批次记录时，只退回正式合并稿，不显示系统中间文件。
        files = [path for path in DAILY_DIR.glob("*.md")
                 if not path.name.endswith(intermediate_suffixes)]
        paths = sorted(files, key=lambda path: path.stat().st_mtime)[-3:]
    items = []
    for path in paths:
        try:
            content = path.read_text(encoding="utf-8")
            first = content.splitlines()[0]
        except (OSError, IndexError):
            continue
        clean = re.sub(r"^#\s*(?:(?:选题|标题|建议标题)[:：])?\s*", "", first).strip()
        pending_title = "> 提示词状态：基础版" in content
        failed_match = re.search(r"^>\s*原因[:：]\s*(.+?)\s*$", content, re.M)
        match = re.search(r"^>\s*选题编号[:：]\s*(TP-\d{8}-[0-9a-f]{8})\s*$", content, re.M)
        topic_id = match.group(1) if match else ""
        package_state = "failed" if pending_title and failed_match else "legacy"
        package_error = failed_match.group(1).strip() if failed_match else ""
        image_plan_imported = False
        image_plan = []
        image_keyword_plan = []
        keyword_version = 1
        image_plan_warnings = []
        if topic_id:
            try:
                package_folder = topic_packages.folder_for(topic_id)
                if package_folder.is_dir():
                    package = topic_packages.load_any(package_folder)
                    package_state = package["status"]
                else:
                    archived = image_review.topic_path("成稿:" + topic_id)
                    package = topic_packages.load(archived)
                    package_folder = archived
                    package_state = "finalized"
                image_plan_imported = topic_packages.is_imported(package_folder)
                image_keyword_plan = package.get("image_plan", [])
                image_plan = [item["query"] for item in topic_packages.searchable_plan(package)]
                keyword_version = package.get("keyword_version", 1)
                image_plan_warnings = package.get("image_plan_warnings", [])
                if package_state == "needs_keywords":
                    package_error = "图片关键词需要调整"
            except (ValueError, OSError) as exc:
                package_state = "invalid"
                package_error = str(exc)
        items.append({"标题": clean, "文件": str(path),
                      "提示词状态": ("文章提示词已完成 · 图片关键词需要调整" if package_state == "needs_keywords" else
                                     "生成失败 · 配图清单不可用" if package_state == "failed" else
                                     "基础版 · 模型待补全" if pending_title else
                                     ("基础版 · 模型待补全" if "> 提示词状态：基础版" in content else
                                      ("写文提示词与配图清单已完成" if package_state in {"ready", "finalized"} else
                                       "标题已定 · 旧版写文提示词"))),
                      "字数": path.stat().st_size, "时间": when,
                      "选题编号": topic_id, "内容包状态": package_state,
                      "内容包错误": package_error,
                      "配图清单已导入": image_plan_imported,
                      "图片关键词": image_plan,
                      "图片关键词清单": image_keyword_plan,
                      "关键词版本": keyword_version,
                      "图片关键词警告": image_plan_warnings})
    return items


def sourcing_status(job=None) -> dict:
    """Return progress only for the image job currently represented by ``job``.

    The JSON file is kept as an audit trail, but replaying it on every idle poll
    made yesterday's image run look like an active task forever.
    """
    if not job or job.get("task") != "配图":
        return {}
    try:
        path = config.DATA / '配图进度.json'
        modified, report = image_review._read_status(path)
        if modified < float(job.get("started_at") or 0):
            return {}
        return report
    except (OSError, ValueError):
        return {}


def draft_status(job=None) -> dict:
    if job and job.get('task') == '一键送草稿':
        return job
    # 最近发送结果.json remains available for diagnostics.  It is deliberately
    # not replayed into the live UI after the corresponding job is acknowledged.
    return {}


def _image_review_rows(*, force: bool = False) -> list[dict]:
    now = _time.monotonic()
    if (not force and CACHE["images"] is not None
            and now - CACHE["images_at"] < 6):
        return CACHE["images"]
    rows = image_review.list_topics()
    CACHE["images"] = rows
    CACHE["images_at"] = now
    return rows


def _topic_output_context(topic_id: str) -> tuple[Path, str, set[str]]:
    """Resolve only files explicitly belonging to a formatted topic package."""
    if not isinstance(topic_id, str) or not topic_packages.TOPIC_ID_RE.fullmatch(topic_id):
        raise ValueError('成稿编号不合法')
    folder = topic_packages.formatted_folder_for(topic_id)
    root = config.FORMATTED.resolve()
    if (folder is None or folder.is_symlink() or not folder.is_dir()
            or folder.resolve().parent != root):
        raise ValueError('没有找到本篇开发区成稿')
    identity = topic_packages.output_identity(folder)
    if not identity or identity.get('topic_id') != topic_id:
        raise ValueError('成稿与本篇编号不一致')
    manifest_path = folder / '配图清单.json'
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError('成稿清单不存在')
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise ValueError('成稿清单无法读取') from exc
    if not isinstance(manifest, dict):
        raise ValueError('成稿清单格式不正确')
    document_name = manifest.get('成稿')
    if (not isinstance(document_name, str) or Path(document_name).name != document_name
            or Path(document_name).suffix.lower() != '.docx'):
        raise ValueError('成稿文件名不合法')
    document = folder / document_name
    if document.is_symlink() or not document.is_file() or document.resolve().parent != folder.resolve():
        raise ValueError('成稿文件不存在或路径不安全')
    image_names = set()
    entries = manifest.get('配图', [])
    if not isinstance(entries, list):
        raise ValueError('成稿图片清单格式不正确')
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = entry.get('文件')
        if (isinstance(name, str) and name and Path(name).name == name
                and entry.get('角色') in {'封面', '正文配图'}):
            image_names.add(name)
    return folder, document_name, image_names


def _topic_output_child(folder: Path, relative: str, *, image: bool = False) -> Path:
    """Resolve one manifest-approved output, rejecting traversal and links."""
    if (not isinstance(relative, str) or not relative or Path(relative).name != relative
            or any(ord(char) < 32 for char in relative)):
        raise ValueError('成稿文件名不合法')
    parent = folder / '配图' if image else folder
    if not parent.is_dir() or parent.is_symlink():
        raise ValueError('成稿文件不存在')
    target = parent / relative
    if target.is_symlink() or not target.is_file():
        raise ValueError('成稿文件不存在')
    resolved_parent = parent.resolve()
    resolved = target.resolve()
    if resolved.parent != resolved_parent:
        raise ValueError('成稿文件路径不安全')
    return resolved


def _topic_output_preview(folder: Path, topic_id: str, allowed_images: set[str]) -> bytes:
    preview = _topic_output_child(folder, '预览.html')
    try:
        content = preview.read_text(encoding='utf-8')
    except (OSError, UnicodeError) as exc:
        raise ValueError('成稿预览无法读取') from exc

    def rewrite_image(match: re.Match) -> str:
        name = html.unescape(match.group(1))
        if name not in allowed_images:
            raise ValueError('预览引用了不属于本篇的图片')
        url = ('/api/topic-output?topic_id=' + quote(topic_id, safe='')
               + '&kind=image&name=' + quote(name, safe=''))
        return 'src="' + html.escape(url, quote=True) + '"'

    return re.sub(r'src="配图/([^"<>]+)"', rewrite_image, content).encode('utf-8')


def state(*, include_images: bool = True) -> dict:
    job = _job_snapshot()
    jobs = jobs_snapshot()
    result = {"job": job, "busy": scope_busy(), "jobs": jobs,
              "module_progress": {key: progress_of(value) for key, value in jobs.items()},
              "overview": overview(), "topics": latest_topics(), "draft_status": draft_status(jobs.get('drafts')),
              "pending": pending_lists(), "sourcing_status": sourcing_status(jobs.get('images')),
              "progress": progress_of(job),
              "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    if include_images:
        result["image_review"] = _image_review_rows()
    return result


def pending_lists() -> dict:
    """每个平台待发目录里现在有哪些稿子（分发出去后一眼能看到）。"""
    out: dict = {}
    for name, directory in PLATFORM_DIRS.items():
        folder = directory / "待发文章"
        from .manuscripts import manuscript_files
        out[name] = [str(path.relative_to(folder).with_suffix('')) for path in manuscript_files(folder)]
    return out


def progress_of(job: dict | None) -> dict:
    """从日志里读出「正在做什么、到第几步」，让过程看得见。"""
    if not job:
        return {"label": "", "percent": 0, "steps": []}
    steps = [re.sub(r"^\[进度\]\s*", "", line).strip()
             for line in job.get("lines", []) if line.startswith("[进度]")]
    label = steps[-1] if steps else (job.get("title", "") if job.get("status") == "running" else "")
    percent = 0
    for line in job.get("lines", []):
        finished = re.search(r"\[进度\]\s*完成\s*(\d+)/(\d+)", line)
        working = re.search(r"\[进度\]\s*写第\s*(\d+)/(\d+)", line)
        classified = re.search(r'已分类\s*(\d+)/(\d+)', line)
        if finished:
            percent = int(int(finished.group(1)) / max(1, int(finished.group(2))) * 100)
        elif working and not finished:
            done = int(working.group(1)) - 1
            percent = int(done / max(1, int(working.group(2))) * 100)
        elif classified:
            percent = max(percent, 5 + int(20 * int(classified.group(1)) / max(1, int(classified.group(2)))))
        elif "热榜" in line or "候选" in line:
            percent = max(percent, 5)
    if job.get("status") == "ok":
        percent = 100
    return {"label": label, "percent": percent, "steps": steps[-8:]}


def _workspace_identity() -> str:
    """不暴露本机路径，只返回用于识别同一工作区的稳定短标识。"""
    try:
        source = str(config.ROOT.resolve()).casefold()
    except OSError:
        source = str(config.ROOT.absolute()).casefold()
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:20]


def _identity_payload() -> dict:
    # Anonymous health is deliberately generic: no path, workspace hash, or user data.
    return {"status": "ok", "service": CONSOLE_SERVICE, "protocol": CONSOLE_PROTOCOL}


def _render_page(csrf_token: str) -> str:
    try:
        page = PAGE_FILE.read_text(encoding="utf-8")
    except OSError:
        return "<h1>控制台页面文件缺失</h1>"
    # 会话级 CSRF 令牌只存在于该次 no-store 页面响应中，不进入 URL 或日志。
    token_json = json.dumps(str(csrf_token), ensure_ascii=True)
    return page.replace(PAGE_TOKEN_MARKER, token_json)


def _render_login_page() -> str:
    try:
        page = LOGIN_PAGE_FILE.read_text(encoding="utf-8")
    except OSError:
        return "<h1>登录页面文件缺失</h1>"
    configured = AUTH_MANAGER.load_credentials() is not None
    status = ("请输入开发区本地账号和密码。" if configured else
              r"本机登录尚未配置。请在开发区终端执行：.\.venv\Scripts\python.exe -m article_hub.console_auth --setup")
    return page.replace(LOGIN_STATUS_MARKER, html.escape(status))


def _header_values(headers, name: str) -> list[str]:
    get_all = getattr(headers, "get_all", None)
    if callable(get_all):
        return [str(value) for value in (get_all(name) or [])]
    value = headers.get(name) if headers is not None else None
    return [] if value is None else [str(value)]


def _safe_compare_text(left: str, right: str) -> bool:
    try:
        return hmac.compare_digest(left.encode("utf-8", "surrogatepass"),
                                   right.encode("utf-8", "surrogatepass"))
    except (AttributeError, UnicodeError):
        return False


def _handler_port(handler) -> int | None:
    address = getattr(getattr(handler, "server", None), "server_address", None)
    candidate = address[1] if isinstance(address, tuple) and len(address) > 1 else SERVER.get("port")
    try:
        port = int(candidate)
    except (TypeError, ValueError):
        return None
    return port if 1 <= port <= 65535 else None


def _request_origin_error(handler) -> str | None:
    """所有登录与写请求共用严格的回环 Host/Origin 检查。"""
    port = _handler_port(handler)
    server = getattr(handler, "server", None)
    test_https_origin = getattr(server, "test_https_origin", None)
    if test_https_origin is not None:
        if console_access.match_request_source(
                handler.headers, port or 0, test_https_origin=test_https_origin) is None:
            return "Invalid request origin. Reopen the console."
        return None
    expected_host = f"127.0.0.1:{port}" if port else ""
    hosts = _header_values(handler.headers, "Host")
    if len(hosts) != 1 or not expected_host or not _safe_compare_text(
            hosts[0].strip().casefold(), expected_host):
        return "请求来源无效，请重新打开好多鱼控制台。"

    origins = _header_values(handler.headers, "Origin")
    if len(origins) != 1:
        return "请求来源无效，请重新打开好多鱼控制台。"
    expected_origin = f"http://{expected_host}"
    if not _safe_compare_text(origins[0].strip().casefold(), expected_origin):
        return "请求来源无效，请重新打开好多鱼控制台。"
    return None


def _request_uses_secure_origin(handler) -> bool:
    port = _handler_port(handler)
    server = getattr(handler, "server", None)
    test_https_origin = getattr(server, "test_https_origin", None)
    return console_access.request_uses_secure_origin(
        handler.headers, port or 0, test_https_origin=test_https_origin)


def _session_cookie(value: str, handler, *, expired: bool = False) -> str:
    secure = " Secure;" if _request_uses_secure_origin(handler) else ""
    if expired:
        return (f"{console_auth.COOKIE_NAME}={value}; Path=/; HttpOnly;{secure} "
                "SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
    return (f"{console_auth.COOKIE_NAME}={value}; Path=/; HttpOnly;{secure} "
            f"SameSite=Strict; Max-Age={console_auth.SESSION_TTL_SECONDS}")


def _write_auth_error(handler, session=None) -> str | None:
    """所有写请求共用会话、来源与会话级 CSRF 检查。"""
    source_error = _request_origin_error(handler)
    if source_error:
        return source_error
    session = session or AUTH_MANAGER.session_for_request(handler)
    if session is None:
        return "登录已失效，请重新登录。"

    supplied = _header_values(handler.headers, WRITE_TOKEN_HEADER)
    expected_token = str(session.csrf_token or "")
    if len(supplied) != 1 or not expected_token or not _safe_compare_text(supplied[0], expected_token):
        return "页面凭证已失效，请刷新页面后重试。"
    return None


def _is_link(path: Path) -> bool:
    try:
        return path.is_symlink() or bool(getattr(os.path, "isjunction", lambda _: False)(path))
    except OSError:
        return True


def _sensitive_image_part(name: str) -> bool:
    lowered = name.casefold()
    return (lowered in SENSITIVE_IMAGE_DIRS or lowered.endswith(("-profile", "_profile"))
            or lowered.startswith(("debug-", "diagnostic-", "screenshot-")))


def _clear_image_roots() -> list[tuple[str, Path]]:
    """只列举文章工作区，永远不把项目根、日志、配置或浏览器资料当清理根。"""
    roots = [
        ("总库·未排版", Path(config.UNFORMATTED)),
        ("总库·已排版", Path(config.FORMATTED)),
        ("总库·临时图片", Path(config.ROOT) / "imgtmp"),
    ]
    for name, root in PLATFORM_DIRS.items():
        roots.extend(((f"{name}·待发", root / "待发文章"),
                      (f"{name}·已发", root / "已发文章")))
    return roots


def _safe_image_stat(path: Path, root: Path):
    """返回可删除普通图片的 lstat；任何越界、链接或敏感目录都拒绝。"""
    try:
        if _is_link(root) or not root.is_dir() or path.suffix.casefold() not in IMAGE_SUFFIXES:
            return None
        root_resolved = root.resolve(strict=True)
        path_resolved = path.resolve(strict=True)
        if not path_resolved.is_relative_to(root_resolved) or _is_link(path):
            return None
        relative = path.relative_to(root)
        if any(_sensitive_image_part(part) for part in relative.parts[:-1]):
            return None
        current = path.parent
        while current != root:
            if _is_link(current):
                return None
            parent = current.parent
            if parent == current:
                return None
            current = parent
        stat = path.lstat()
        return stat if path.is_file() else None
    except (OSError, ValueError):
        return None


def _image_signature(stat) -> tuple[int, int, int, int]:
    return (int(stat.st_dev), int(stat.st_ino), int(stat.st_size), int(stat.st_mtime_ns))


def _clear_image_candidates() -> list[tuple[str, Path, Path, tuple[int, int, int, int]]]:
    candidates = []
    seen: set[Path] = set()
    for label, root in _clear_image_roots():
        if _is_link(root) or not root.is_dir():
            continue
        for current_name, dirs, files in os.walk(root, topdown=True, followlinks=False):
            current = Path(current_name)
            dirs[:] = [name for name in dirs
                       if not _sensitive_image_part(name) and not _is_link(current / name)]
            for name in files:
                path = current / name
                stat = _safe_image_stat(path, root)
                if stat is None:
                    continue
                try:
                    resolved = path.resolve(strict=True)
                except OSError:
                    continue
                if resolved in seen:
                    continue
                seen.add(resolved)
                candidates.append((label, path, root, _image_signature(stat)))
    return candidates


def _create_clear_image_preview() -> dict:
    from . import archive_cleanup
    plans = archive_cleanup.preview()
    nonce = secrets.token_urlsafe(24)
    with CLEAR_IMAGES_LOCK:
        CLEAR_IMAGE_CONFIRMATIONS[nonce] = {'expires': _time.monotonic()+CLEAR_IMAGE_TTL, 'archives': plans}
    return {'count':len(plans),'nonce':nonce,'expires_in':CLEAR_IMAGE_TTL}


def _take_clear_image_preview(nonce: str) -> dict | None:
    now = _time.monotonic()
    with CLEAR_IMAGES_LOCK:
        for key in list(CLEAR_IMAGE_CONFIRMATIONS):
            if CLEAR_IMAGE_CONFIRMATIONS[key]["expires"] < now:
                CLEAR_IMAGE_CONFIRMATIONS.pop(key, None)
        matched = next((key for key in CLEAR_IMAGE_CONFIRMATIONS
                        if hmac.compare_digest(key, nonce)), None)
        return CLEAR_IMAGE_CONFIRMATIONS.pop(matched, None) if matched else None


def _confirm_clear_images(nonce: str) -> dict:
    preview = _take_clear_image_preview(nonce)
    if preview is None:
        raise ValueError("清理确认已失效，请重新预览后再确认。")
    if 'archives' in preview:
        from .archive_cleanup import execute
        return execute(preview['archives'])
    removed = failed = changed = 0
    detail: dict[str, int] = {}
    # nonce 在删除前已经取走：即使中途失败，也不能重放这批删除操作。
    for label, path, root, signature in preview["candidates"]:
        stat = _safe_image_stat(path, root)
        if stat is None or not hmac.compare_digest(repr(_image_signature(stat)), repr(signature)):
            changed += 1
            continue
        try:
            path.unlink()
        except FileNotFoundError:
            changed += 1
        except OSError:
            failed += 1
        else:
            removed += 1
            detail[label] = detail.get(label, 0) + 1
    return {"removed": removed, "detail": detail, "failed": failed, "changed": changed}


class Handler(BaseHTTPRequestHandler):
    server_version = "ArticleHubConsole"

    def log_message(self, *args) -> None:  # 静音，别把日志刷到控制台窗口
        return

    def _send(self, code: int, body: bytes, content_type: str,
              *, content_disposition: str | None = None,
              extra_headers: tuple[tuple[str, str], ...] | list[tuple[str, str]] = ()) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if content_disposition:
            self.send_header("Content-Disposition", content_disposition)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; base-uri 'none'; "
                         "frame-ancestors 'none'; form-action 'self'; object-src 'none'; "
                         "img-src 'self' data:; script-src 'self' 'unsafe-inline'; "
                         "style-src 'self' 'unsafe-inline'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        for name, value in extra_headers:
            self.send_header(name, value)
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _json(self, payload: dict, code: int = 200, *, extra_headers=()) -> None:
        self._send(code, json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8", extra_headers=extra_headers)

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == "/api/health":
            self._json(_identity_payload())
            return
        if parsed.path in ("/", "/index.html"):
            session = AUTH_MANAGER.session_for_request(self)
            page = _render_page(session.csrf_token) if session else _render_login_page()
            self._send(200, page.encode("utf-8"), "text/html; charset=utf-8")
            return
        if parsed.path == "/login":
            session = AUTH_MANAGER.session_for_request(self)
            page = _render_page(session.csrf_token) if session else _render_login_page()
            self._send(200, page.encode("utf-8"), "text/html; charset=utf-8")
            return
        if AUTH_MANAGER.session_for_request(self) is None:
            self._json({"error": "需要登录后继续。"}, 401)
            return
        if parsed.path == "/api/xhs-status":
            from .xiaohongshu import saved_login_status
            self._json(saved_login_status())
            return
        if parsed.path == "/api/xhs-check":
            if scope_busy('images'):
                self._json({'status': 'unknown', 'logged_in': None,
                            'message': '配图或登录任务正在使用浏览器，请完成后检查；不代表登录失效'})
                return
            src = None
            try:
                from .xiaohongshu import XiaohongshuSource
                src = XiaohongshuSource(headless=True)
                src.open()
                src._page.goto("https://www.xiaohongshu.com/explore", wait_until="domcontentloaded")
                import time; time.sleep(3)
                ok = src.logged_in()
                url = src._page.url
                self._json({'status': 'saved' if ok else 'missing', 'logged_in': ok,
                            'message': '浏览器已读取登录凭据，配图时自动复用；平台仍可能要求验证' if ok else '未检测到登录凭据，请打开登录窗口确认'})
            except Exception as exc:
                self._json({'status': 'unknown', 'logged_in': None,
                            'message': '暂时无法检查（浏览器占用或网络异常），不代表登录失效'})
            finally:
                if src is not None:
                    src.close()
            return
        if parsed.path == '/api/topic-operation':
            try:
                self._json(topic_service.snapshot((parse_qs(parsed.query).get('id') or [''])[0]))
            except ValueError as exc:
                self._json({'error': str(exc)}, 404)
            return
        if parsed.path == '/api/topic-research-settings':
            self._json({'profile': topic_research.profile(),
                        'sources': topic_research_sources.source_status()})
            return
        if parsed.path == "/api/state":
            with OPERATION_LOCK:
                try:
                    include_images = (parse_qs(parsed.query).get("images") or [""])[0] == "1"
                    self._json(state(include_images=include_images))
                except Exception as exc:
                    self._json({"error": f"读取状态失败：{exc}"}, 500)
            return
        if parsed.path in {"/api/topic-text", "/api/topic-brief"}:
            query = parse_qs(parsed.query)
            wanted = (query.get("path") or [""])[0]
            try:
                target = Path(wanted).resolve()
            except Exception:
                target = None
            root = DAILY_DIR.resolve()
            if target is None or not target.is_relative_to(root) or not target.is_file():
                self._json({"error": "只能读 选题\\每日选题 里的文件"}, 403)
                return
            try:
                content = target.read_text(encoding="utf-8")
                if parsed.path == "/api/topic-brief":
                    content = topics.brain_brief_from_document(content)
                self._send(200, content.encode("utf-8"), "text/plain; charset=utf-8")
            except ValueError as exc:
                self._json({"error": str(exc)}, 422)
            except (OSError, UnicodeError):
                self._json({"error": "文件无法读取或已被移动"}, 404)
            return
        if parsed.path == "/api/review-image":
            query = parse_qs(parsed.query)
            try:
                image = image_review.image_path((query.get("topic") or [""])[0], (query.get("name") or [""])[0])
                self._send(200, image.read_bytes(), mimetypes.guess_type(image.name)[0] or "application/octet-stream")
            except (OSError, ValueError):
                self._json({"error": "图片不存在"}, 404)
            return
        if parsed.path == "/api/topic-output":
            query = parse_qs(parsed.query)
            topic_id = (query.get('topic_id') or [''])[0]
            kind = (query.get('kind') or [''])[0]
            try:
                folder, document_name, image_names = _topic_output_context(topic_id)
                if kind == 'preview':
                    body = _topic_output_preview(folder, topic_id, image_names)
                    self._send(200, body, 'text/html; charset=utf-8')
                    return
                if kind == 'docx':
                    target = _topic_output_child(folder, document_name)
                    body = target.read_bytes()
                    encoded_name = quote(document_name, safe='')
                    self._send(200, body,
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        content_disposition=(f'attachment; filename="document.docx"; '
                                              f"filename*=UTF-8''{encoded_name}"))
                    return
                if kind == 'image':
                    name = (query.get('name') or [''])[0]
                    if name not in image_names:
                        raise ValueError('图片不属于本篇成稿')
                    target = _topic_output_child(folder, name, image=True)
                    self._send(200, target.read_bytes(),
                        mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
                    return
                raise ValueError('成稿读取类型不合法')
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                self._json({'error': '成稿不存在或读取路径不安全'}, 404)
            return
        if parsed.path == "/favicon.ico":
            icon = config.ROOT / "素材" / "图标" / "好多鱼-黑白.ico"
            if icon.exists():
                self._send(200, icon.read_bytes(), "image/x-icon")
            else:
                self._send(204, b"", "image/x-icon")
            return
        if parsed.path == "/api/tasks":
            self._json({"tasks": [{"id": key, "title": value["title"]}
                                  for key, value in tasks().items()]})
            return
        if parsed.path == "/api/models-config":
            try:
                self._json(model_settings.public_config())
            except (OSError, ValueError) as exc:
                self._json({'error':str(exc)}, 400)
            return
        self._json({"error": "没有这个地址"}, 404)

    def do_POST(self) -> None:
        request_path = urlsplit(self.path).path
        if request_path == "/api/login":
            self._handle_login()
            return
        session = AUTH_MANAGER.session_for_request(self)
        if session is None:
            self._json({"error": "登录已失效，请重新登录。"}, 401)
            return
        auth_error = _write_auth_error(self, session)
        if auth_error:
            self._json({"error": auth_error}, 403)
            return
        if request_path == "/api/logout":
            token = console_auth.AuthManager.token_from_cookie(self.headers)
            AUTH_MANAGER.logout(token)
            self._json({"ok": True}, extra_headers=[(
                "Set-Cookie", _session_cookie("", self, expired=True))])
            return
        per_article_image_paths = {
            '/api/image-review', '/api/image-selection',
            '/api/topic-image-export-sync', '/api/topic-image-folder-open',
            '/api/topic-final-open',
        }
        operation_locked = request_path not in per_article_image_paths
        if operation_locked and not OPERATION_LOCK.acquire(blocking=False):
            self._json({"error": "正在处理其他操作，请稍后重试。"}, 409)
            return
        try:
            path = urlsplit(self.path).path
            if SERVER.get("restart_requested"):
                self._json({"error": "正在刷新系统，请稍后。"}, 409)
                return
            scope = ('images' if path in {'/api/topic-word', '/api/topic-images/cleanup',
                                          '/api/image-collaboration'} else
                     'topics' if path.startswith('/api/topic-') else
                     'images' if path.startswith('/api/image-') else
                     'drafts' if path.startswith('/api/dispatch') else None)
            if path == '/api/topic-images/cleanup' and scope_busy('layouts'):
                self._json({"error": "正在排版，请完成后再清理新版配图数据。"}, 409)
                return
            if (path in {"/api/dispatch", "/api/dispatch-all", "/api/clear-images",
                         "/api/clear-images/preview", "/api/clear-images/confirm",
                         "/api/topic-images/cleanup",
                         "/api/quit", "/api/restart", "/api/refresh",
                         "/api/image-action", "/api/topic-rewrite",
                         "/api/topic-recommendations", "/api/topic-manual", "/api/topic-batch",
                         "/api/topic-keywords-confirm",
                         "/api/topic-word"}
                    or path in {'/api/model-provider', '/api/model-discover',
                                '/api/image-collaboration'}) and scope_busy(scope) \
                    and path != '/api/image-collaboration':
                self._json({"error": "任务正在运行，请完成或停止后再操作。"}, 409)
                return
            self._handle_post()
        except Exception as exc:
            self._json({"error": str(exc)[:200]}, 500)
        finally:
            CACHE["at"] = 0.0
            CACHE["images_at"] = 0.0
            if operation_locked:
                OPERATION_LOCK.release()

    def _handle_login(self) -> None:
        source_error = _request_origin_error(self)
        if source_error:
            self._json({"error": source_error}, 403)
            return
        content_type = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().casefold()
        if content_type != "application/json":
            self._json({"error": "登录请求格式无效。"}, 415)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except (TypeError, ValueError):
            length = 0
        if not 0 < length <= 8192:
            self._json({"error": "登录请求大小无效。"}, 400)
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            self._json({"error": "登录请求格式无效。"}, 400)
            return
        if not isinstance(payload, dict):
            self._json({"error": "登录请求格式无效。"}, 400)
            return
        peer = self.client_address[0] if isinstance(self.client_address, tuple) else "unknown"
        result = AUTH_MANAGER.login(payload.get("username"), payload.get("password"), peer)
        if result.status == "unavailable":
            self._json({"error": "本地登录尚未配置或配置无效。"}, 503)
            return
        if result.status == "rate_limited":
            self._json({"error": "登录尝试过多，请稍后再试。"}, 429,
                       extra_headers=[("Retry-After", "600")])
            return
        if result.status != "ok" or result.session is None:
            self._json({"error": "用户名或密码不正确。"}, 401)
            return
        cookie = _session_cookie(result.session_token, self)
        self._json({"ok": True}, extra_headers=[("Set-Cookie", cookie)])

    def _handle_post(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == '/api/article-record':
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 16384:
                self._json({'error': '请求大小不合法'}, 400)
                return
            try:
                payload = json.loads(self.rfile.read(length))
                action, topic = payload.get('action'), payload.get('topic')
                if action not in {'delete', 'restore', 'draft', 'pending', 'undo-draft'}:
                    raise ValueError('不支持的记录操作')
                platform = payload.get('platform')
                if action in {'draft', 'pending', 'undo-draft'} and platform not in config.PLATFORM_ORDER:
                    raise ValueError('请选择有效平台')
                with library.ledger_transaction() as ledger:
                    if topic not in ledger['文章']:
                        raise ValueError('文章记录不存在，请刷新')
                    record = ledger['文章'][topic]
                    if action == 'delete':
                        ledger['文章'].pop(topic)
                        ignored = ledger.setdefault('忽略扫描主题', [])
                        if topic not in ignored:
                            ignored.append(topic)
                    elif action == 'restore':
                        record.pop('列表已删除', None)
                    elif action == 'draft':
                        record.setdefault('手动草稿标记', {})[platform] = datetime.now().isoformat()
                        record.setdefault('手动待发标记', {}).pop(platform, None)
                    elif action == 'pending':
                        record.setdefault('手动待发标记', {})[platform] = datetime.now().isoformat()
                        record.setdefault('手动草稿标记', {}).pop(platform, None)
                    else:
                        record.setdefault('手动草稿标记', {}).pop(platform, None)
                        record.setdefault('手动待发标记', {}).pop(platform, None)
                self._json({'ok': True})
            except (ValueError, TypeError, AttributeError) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path == '/api/copy-topic-files':
            from .file_clipboard import copy_topic_files
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 65536:
                self._json({'error': '文件列表大小不合法'}, 400)
                return
            try:
                payload = json.loads(self.rfile.read(length))
                count = copy_topic_files(payload.get('files'), DAILY_DIR,
                                         [row['文件'] for row in latest_topics()])
                self._json({'ok': True, 'count': count})
            except (ValueError, AttributeError, OSError, subprocess.TimeoutExpired) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path in {'/api/image-review', '/api/image-action'}:
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= 65536:
                    raise ValueError('图片操作数据大小不合法')
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError('图片操作数据格式不正确')
                if parsed.path == '/api/image-review':
                    if article_image_busy(data.get('topic', '')):
                        self._json({'error': '这篇文章正在搜图或排版，等本篇任务完成后再修改选图。'}, 409)
                        return
                    result = image_review.save_review(data.get('topic', ''), data.get('states', {}), data.get('cover'))
                    self._json({'ok': True, **result,
                                'export_sync': result.get('export_sync')})
                else:
                    self._json(start_image_action(data))
            except (ValueError, TypeError, KeyError, OSError) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path == '/api/topic-plan-import':
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= 4096:
                    raise ValueError('配图清单导入信息不合法')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError('配图清单导入信息不合法')
                result = topic_packages.mark_imported(payload.get('topic_id', ''))
                self._json({'ok': True, **result})
            except (ValueError, TypeError, OSError) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path == '/api/topic-keywords-confirm':
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= 8192:
                    raise ValueError('图片关键词确认信息不合法')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError('图片关键词确认信息不合法')
                topic_id = payload.get('topic_id', '')
                result = topics.confirm_topic_keywords(topic_id, payload.get('keywords'))
                imported = topic_packages.mark_imported(topic_id)
                self._json({'ok': True, **result, 'imported': imported})
            except (ValueError, TypeError, OSError) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path == '/api/topic-word':
            query = parse_qs(parsed.query)
            topic_id = (query.get('topic') or [''])[0]
            filename = (query.get('name') or [''])[0]
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 30 * 1024 * 1024:
                self._json({'error': 'Word 文件为空或超过 30 MB'}, 400)
                return
            try:
                result = topic_packages.import_word(topic_id, filename, self.rfile.read(length))
                self._json({'ok': True, **result})
            except (ValueError, OSError) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path in {'/api/topic-rewrite', '/api/topic-recommendations', '/api/topic-manual', '/api/topic-batch'}:
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= 32768:
                    raise ValueError('选题数据不合法')
                data = json.loads(self.rfile.read(length))
                self._json(topic_service.start(parsed.path.rsplit('-', 1)[-1], data))
            except (ValueError, OSError) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path in {'/api/model-provider','/api/model-choice','/api/model-discover',
                           '/api/image-collaboration'}:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 16384:
                self._json({'error':'模型配置数据不合法'}, 400)
                return
            try:
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError('模型配置数据不合法')
                if parsed.path == '/api/model-provider':
                    model_settings.save_provider(data)
                elif parsed.path == '/api/model-choice':
                    if scope_busy(data.get('scope')):
                        self._json({'error': '本模块正在运行，完成后再修改模型。'}, 409)
                        return
                    model_settings.save_choice(data.get('scope'), data.get('provider'), data.get('model',''))
                elif parsed.path == '/api/image-collaboration':
                    model_settings.save_image_collaboration(data)
                else:
                    model_settings.discover(data.get('provider'))
                self._json(model_settings.public_config())
            except (ValueError, OSError) as exc:
                self._json({'error':str(exc)}, 400)
            return
        if parsed.path == "/api/image-return":
            query = parse_qs(parsed.query)
            topic = (query.get('topic') or [''])[0]
            try:
                # Stop only a producer writing this article; never cancel a
                # different article's independent search task.
                running_job = article_image_job(topic)
                if running_job:
                    stop(task_scope(running_job.task, running_job.topic), str(running_job.id))
                result = image_review.return_for_images(topic)
                self._json({'ok': True, **result})
            except (ValueError, OSError) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path == "/api/image-selection":
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 65536:
                self._json({"error": "选图数据大小不合法"}, 400)
                return
            try:
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError('选图数据格式不正确')
                if article_image_busy(data.get('topic', '')):
                    self._json({'error': '这篇文章正在搜图或排版，等本篇任务完成后再保存选图。'}, 409)
                    return
                exported_folder = image_review.save_selection(data["topic"], data["images"], data.get("positions"))
            except (ValueError, KeyError, TypeError, OSError) as exc:
                self._json({"error": str(exc)}, 400)
                return
            self._json({"ok": True, "folder_name": exported_folder.name if exported_folder else ""})
            return
        if parsed.path in {'/api/topic-research-profile', '/api/topic-research-feedback', '/api/topic-cancel'}:
            try:
                length = int(self.headers.get('Content-Length', 0))
                max_length = 32768 if parsed.path == '/api/topic-research-profile' else 16384
                if not 0 < length <= max_length:
                    raise ValueError('选题研究请求大小不合法')
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError('选题研究请求格式错误')
                if parsed.path == '/api/topic-research-profile':
                    self._json({'profile': topic_research.save_profile(data.get('profile'))})
                elif parsed.path == '/api/topic-research-feedback':
                    self._json(topic_research.save_feedback(data.get('candidate_id'), data.get('action')))
                else:
                    self._json(topic_service.cancel(data.get('id')))
            except (ValueError, OSError, TypeError) as exc:
                self._json({'error': str(exc)}, 400)
            return
        if parsed.path == '/api/topic-image-export-sync':
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 4096:
                self._json({'error': '图片文件夹同步请求不合法'}, 400)
                return
            try:
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict) or not isinstance(payload.get('topic'), str):
                    raise ValueError('图片文件夹同步请求不合法')
                topic = payload['topic']
                if article_image_busy(topic):
                    self._json({'error': '这篇文章正在搜图或排版，完成后再同步图片文件夹。'}, 409)
                    return
                result = image_review.sync_topic_package_export(topic)
            except (ValueError, TypeError, OSError) as exc:
                self._json({'error': str(exc)}, 400)
                return
            self._json({'ok': bool(result.get('ok')), 'export_sync': result,
                        'folder_name': result.get('folder_name', ''),
                        'folder_path': result.get('folder_path', '')})
            return
        if parsed.path == '/api/topic-image-folder-open':
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 4096:
                self._json({'error': '打开图片文件夹请求不合法'}, 400)
                return
            try:
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict) or not isinstance(payload.get('topic'), str):
                    raise ValueError('打开图片文件夹请求不合法')
                folder = image_review.topic_export_folder(payload['topic'])
                if folder is None:
                    raise ValueError('本篇还没有创建标题图片文件夹')
                resolved = folder.resolve()
                if resolved.parent != config.UNFORMATTED.resolve():
                    raise ValueError('图片文件夹路径不安全')
                if sys.platform == 'win32':
                    os.startfile(str(resolved))
                else:
                    raise ValueError('此系统不支持从控制台打开文件夹')
            except (ValueError, TypeError, OSError) as exc:
                self._json({'error': str(exc)}, 400)
                return
            self._json({'ok': True, 'folder_path': str(resolved)})
            return
        if parsed.path == '/api/topic-final-open':
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 4096:
                self._json({'error': '打开最终文稿请求不合法'}, 400)
                return
            try:
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict) or not isinstance(payload.get('topic'), str):
                    raise ValueError('打开最终文稿请求不合法')
                topic = payload['topic']
                if not topic.startswith('成稿:'):
                    raise ValueError('本篇尚未生成最终文稿')
                row = next((item for item in _image_review_rows()
                            if item.get('topic') == topic and item.get('topic_package')) , None)
                if not row or not row.get('final_docx'):
                    raise ValueError('本篇最终文稿不存在，请先重新排版')
                target = Path(row['final_docx']).resolve()
                root = config.FORMATTED.resolve()
                if (target.suffix.lower() != '.docx' or target.parent.parent != root
                        or target.parent.is_symlink() or not target.is_file()):
                    raise ValueError('最终文稿路径校验失败，已停止打开')
                manifest_path = target.parent / '配图清单.json'
                if manifest_path.is_symlink() or not manifest_path.is_file():
                    raise ValueError('最终文稿清单不存在，已停止打开')
                manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
                if manifest.get('成稿') != target.name:
                    raise ValueError('最终文稿与本篇清单不一致，已停止打开')
                if sys.platform != 'win32':
                    raise ValueError('此系统不支持从控制台打开 Word 文件')
                os.startfile(str(target))
            except (ValueError, TypeError, OSError, json.JSONDecodeError) as exc:
                self._json({'error': str(exc)}, 400)
                return
            self._json({'ok': True, 'filename': target.name})
            return
        if parsed.path == "/api/quit":
            self._json({"ok": True})
            httpd = SERVER.get("httpd")
            if httpd is not None:
                threading.Thread(target=httpd.shutdown, daemon=True).start()
            return
        if parsed.path in {"/api/restart", "/api/refresh"}:
            # 先关闭旧监听，再启动新服务，避免新进程误认旧实例并直接退出。
            SERVER["restart_requested"] = True
            self._json({"ok": True})
            httpd = SERVER.get("httpd")
            if httpd is not None:
                threading.Thread(target=httpd.shutdown, daemon=True).start()
            return
        if parsed.path == "/api/stop":
            query = parse_qs(parsed.query)
            self._json(stop((query.get('scope') or [None])[0], (query.get('id') or [None])[0]))
            return
        if parsed.path == "/api/clear-result":
            global CURRENT
            wanted = (parse_qs(parsed.query).get("id") or [""])[0]
            with LOCK:
                for scope, job in list(JOBS.items()):
                    if str(job.id) == str(wanted) and job.status != 'running':
                        del JOBS[scope]
                if (CURRENT is not None and CURRENT.status != "running"
                        and str(CURRENT.id) == str(wanted)):
                    CURRENT = None
                    cleared = True
                else:
                    cleared = False
            self._json({"ok": True})
            return
        if parsed.path == "/api/dispatch":
            query = parse_qs(parsed.query)
            name = PLATFORM_ALIASES.get((query.get("platform") or [""])[0])
            topic = (query.get("topic") or [""])[0]
            if not name or not topic:
                self._json({"error": "要指定平台和文章"}, 400)
                return
            try:
                result = library.dispatch(name, only=topic)
            except Exception as exc:
                self._json({"error": str(exc)[:200]}, 500)
                return
            moved = ""
            warnings: list[str] = []
            errors: list[str] = []
            cleanup_pending = False
            if (query.get("purge") or [""])[0] == "1" and result.copied:
                try:
                    archived = library.archive_dispatched_topic(topic)
                    moved = str(archived.target)
                    cleanup_pending = archived.cleanup_pending
                    if archived.warning:
                        warnings.append(archived.warning)
                except (OSError, ValueError) as exc:
                    errors.append(f"{topic}已分发，但归档失败：{str(exc)[:160]}")
            self._json({"copied": [title for title, _ in result.copied],
                        "skipped": [f"{title}：{why}" for title, why in result.skipped],
                        "platform": name, "moved": moved, "warnings": warnings,
                        "errors": errors, "cleanup_pending": cleanup_pending})
            return
        if parsed.path == "/api/clear-images/preview":
            self._json(_create_clear_image_preview())
            return
        if parsed.path == "/api/clear-images/confirm":
            try:
                length = int(self.headers.get("Content-Length", 0))
                if not 0 < length <= 2048:
                    raise ValueError("清理确认数据不合法。")
                data = json.loads(self.rfile.read(length))
                nonce = data.get("nonce", "") if isinstance(data, dict) else ""
                if not isinstance(nonce, str) or not nonce:
                    raise ValueError("缺少清理确认，请重新预览。")
                self._json(_confirm_clear_images(nonce))
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                self._json({"error": str(exc)}, 400)
            return
        if parsed.path == "/api/clear-images":
            self._json({"error": "清理接口已升级，请刷新页面后先预览再确认。"}, 410)
            return
        if parsed.path == "/api/topic-images/cleanup":
            try:
                result = image_review.clear_topic_image_outputs_for_testing()
            except (OSError, ValueError) as exc:
                self._json({"error": str(exc)}, 400)
                return
            self._json({"ok": True, **result})
            return
        if parsed.path == "/api/dispatch-all":
            query = parse_qs(parsed.query)
            purge = (query.get("purge") or [""])[0] == "1"
            copied: list[str] = []
            skipped: list[str] = []
            errors: list[str] = []
            delivered: dict[str, set[str]] = {}
            for name in config.PLATFORM_ORDER:
                try:
                    result = library.dispatch(name)
                except Exception as exc:
                    errors.append(f"{name}：{str(exc)[:80]}")
                    continue
                for topic, _title, _path in result.copied_topics:
                    delivered.setdefault(topic, set()).add(name)
                copied += [f"{name}：{title}" for title, _ in result.copied]
                skipped += [f"{name}：{title}（{why}）" for title, why in result.skipped]
            moved: list[str] = []
            warnings: list[str] = []
            cleanup_pending: list[str] = []
            if purge and copied:
                for topic, platforms in delivered.items():
                    if not set(config.PLATFORM_ORDER).issubset(platforms):
                        continue
                    try:
                        archived = library.archive_dispatched_topic(topic)
                        moved.append(topic)
                        if archived.cleanup_pending:
                            cleanup_pending.append(topic)
                        if archived.warning:
                            warnings.append(archived.warning)
                    except (OSError, ValueError) as exc:
                        errors.append(f"{topic}已分发，但归档失败：{str(exc)[:160]}")
            self._json({"copied": copied, "skipped": skipped, "moved": moved,
                        "errors": errors, "warnings": warnings,
                        "cleanup_pending": cleanup_pending})
            return
        if parsed.path != "/api/run":
            self._json({"error": "没有这个地址"}, 404)
            return
        query = parse_qs(parsed.query, keep_blank_values=True)
        task = (query.get("task") or [""])[0]
        self._json(start(task, topic=(query.get("topic") or [""])[0],
                         provider=(query.get('provider') or [''])[0], model=(query.get('model') or [''])[0],
                         sources=(query.get('sources') or [None])[0],
                         platforms=(query.get('platforms') or [None])[0],
                         categories=(query.get('categories') or [None])[0],
                         allow_ai_images=(query.get('allow_ai_images') or ['0'])[0] == '1',
                         word_name=(query.get('word') or [''])[0]))


def _open_window(url: str) -> None:
    """用 Edge 的应用模式打开，看起来就像个桌面程序。"""
    import webbrowser, os

    # 重启模式下不打开新窗口，旧窗口会自动刷新
    if os.environ.get("ARTICLE_HUB_NO_OPEN") == "1":
        return
    for candidate in (r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"):
        if Path(candidate).exists():
            try:
                subprocess.Popen([candidate, f"--app={url}", "--window-size=1280,940"])
                from .window_branding import brand_after_launch
                brand_after_launch(config.ROOT / "素材" / "图标" / "好多鱼-黑白.ico")
                return
            except Exception:
                break
    webbrowser.open(url)


def _already_running(port: int) -> bool:
    """只认好多鱼自身的轻量身份响应，不能把任意 HTTP 服务当作旧实例。"""
    connection = HTTPConnection("127.0.0.1", port, timeout=0.45)
    try:
        connection.request("GET", "/api/health", headers={"Host": f"127.0.0.1:{port}",
                                                            "Accept": "application/json"})
        response = connection.getresponse()
        body = response.read(2049)
        if response.status != 200 or len(body) > 2048:
            return False
        payload = json.loads(body.decode("utf-8"))
        expected = _identity_payload()
        return (isinstance(payload, dict)
                and payload.get("service") == expected["service"]
                and payload.get("protocol") == expected["protocol"]
                and payload.get("status") == "ok")
    except (OSError, ValueError, UnicodeError):
        return False
    finally:
        connection.close()


def _find_running_console(port: int, span: int = 10) -> int | None:
    for candidate in range(port, port + span):
        if _already_running(candidate):
            return candidate
    return None


@contextmanager
def _startup_mutex(timeout_ms: int = 5000):
    """防止两个桌面启动进程同时各占一个端口；Windows 下跨进程生效。"""
    if sys.platform != "win32":
        with STARTUP_LOCK:
            yield True
        return
    handle = None
    acquired = False
    try:
        import ctypes
        from ctypes import wintypes
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateMutexW.argtypes = (ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR)
        kernel32.CreateMutexW.restype = wintypes.HANDLE
        kernel32.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
        kernel32.WaitForSingleObject.restype = wintypes.DWORD
        kernel32.ReleaseMutex.argtypes = (wintypes.HANDLE,)
        kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
        name = "Local\\HaoduoyuConsoleStartup-" + _workspace_identity()
        handle = kernel32.CreateMutexW(None, False, name)
        if not handle:
            raise OSError(ctypes.get_last_error(), "无法创建启动互斥锁")
        result = kernel32.WaitForSingleObject(handle, timeout_ms)
        acquired = result in (0x00000000, 0x00000080)  # WAIT_OBJECT_0 / WAIT_ABANDONED
    except (AttributeError, OSError):
        # 极少数精简 Windows 环境没有该 API 时，仍至少保护本进程内的并发启动。
        with STARTUP_LOCK:
            yield True
        return
    try:
        yield acquired
    finally:
        if handle:
            try:
                if acquired:
                    kernel32.ReleaseMutex(handle)
                kernel32.CloseHandle(handle)
            except Exception:
                pass


def serve_lan_test(lan_config: console_network.LanTestConfig) -> int:
    """Run only an explicitly validated HTTPS LAN test; never scan or fall back."""
    if not isinstance(lan_config, console_network.LanTestConfig):
        print("Invalid LAN test configuration; refusing to start.")
        return 2
    try:
        allowed_origin = console_access.configured_external_source()
        if allowed_origin is None or allowed_origin.origin != lan_config.origin:
            print("Configured HTTPS origin does not match LAN test configuration.")
            return 2
        verified = console_network.build_lan_test_config(
            root=config.ROOT,
            bind_address=lan_config.bind_address,
            port=lan_config.port,
            allowed_device_ips=lan_config.allowed_device_ips,
            certificate_path=lan_config.certificate_path,
            private_key_path=lan_config.private_key_path,
        )
        if verified != lan_config:
            print("LAN test configuration changed during validation; refusing to start.")
            return 2
        lan_config = verified
    except (OSError, ValueError) as exc:
        print(f"Invalid LAN test configuration; refusing to start: {exc}")
        return 2

    httpd = None
    server_thread = None
    try:
        with _startup_mutex() as acquired:
            if not acquired:
                print("Another console startup is in progress.")
                return 1
            httpd = console_network.create_lan_test_server(lan_config, Handler)
            httpd.test_https_origin = lan_config.origin
            SERVER.update({"httpd": httpd, "port": lan_config.port,
                           "bind_address": lan_config.bind_address,
                           "scheme": "https", "mode": "lan-test"})
            server_thread = threading.Thread(
                target=httpd.serve_forever, name="haoduoyu-lan-test-console", daemon=True)
            server_thread.start()
            # The exact peer allowlist may exclude this host. Check only the bound
            # socket and serving thread; do not probe over HTTP or widen the allowlist.
            deadline = _time.monotonic() + 3
            ready = False
            while _time.monotonic() < deadline:
                try:
                    bound = httpd.socket.getsockname()
                    ready = (server_thread.is_alive() and httpd.socket.fileno() >= 0
                             and bound[0] == lan_config.bind_address
                             and int(bound[1]) == lan_config.port)
                except OSError:
                    ready = False
                if ready:
                    break
                _time.sleep(0.05)
            if not ready:
                httpd.shutdown()
                server_thread.join(timeout=3)
                httpd.server_close()
                SERVER.update({"httpd": None, "port": None, "bind_address": None,
                               "scheme": None, "mode": None})
                print("LAN HTTPS listener did not become ready; stopped without fallback.")
                return 2
    except (OSError, ssl.SSLError, ValueError) as exc:
        if httpd is not None:
            try:
                httpd.server_close()
            except OSError:
                pass
        SERVER.update({"httpd": None, "port": None, "bind_address": None,
                       "scheme": None, "mode": None})
        print(f"LAN test listener unavailable; refusing fallback: {exc}")
        return 1

    assert httpd is not None and server_thread is not None
    print(f"LAN HTTPS test console: {lan_config.origin}/")
    try:
        server_thread.join()
    except KeyboardInterrupt:
        httpd.shutdown()
        server_thread.join(timeout=3)
    finally:
        if server_thread.is_alive():
            httpd.shutdown()
            server_thread.join(timeout=3)
        httpd.server_close()
        SERVER.pop("restart_requested", None)
        if SERVER.get("httpd") is httpd:
            SERVER.update({"httpd": None, "port": None, "bind_address": None,
                           "scheme": None, "mode": None})
    return 0


def serve(*, port: int = 18765, open_browser: bool = True) -> int:
    """起本地服务并（默认）打开窗口；已经在跑就只把窗口开到它上面。"""
    existing = _find_running_console(port)
    if existing is not None:
        url = f"http://127.0.0.1:{existing}/"
        print(f"控制台已经在运行：{url}")
        if open_browser:
            _open_window(url)
        return 0

    httpd = None
    server_thread = None
    with _startup_mutex() as acquired:
        if not acquired:
            print("另一个好多鱼窗口正在启动，请稍后再试。")
            return 1
        # 等待互斥锁期间，另一个进程可能已经把服务启动好了，因此必须重扫整段端口。
        existing = _find_running_console(port)
        if existing is not None:
            url = f"http://127.0.0.1:{existing}/"
        else:
            first_port = port
            for candidate in range(port, port + 10):
                try:
                    httpd = ThreadingHTTPServer(("127.0.0.1", candidate), Handler)
                    port = candidate
                    break
                except OSError:
                    continue
            if httpd is None:
                print(f"端口 {first_port} 到 {first_port + 9} 都不可用。")
                return 1
            SERVER.update({"httpd": httpd, "port": port})
            server_thread = threading.Thread(target=httpd.serve_forever,
                                             name="haoduoyu-console", daemon=True)
            server_thread.start()
            # 身份接口可响应后才释放跨进程锁，避免第二次双击抢占下一个端口。
            deadline = _time.monotonic() + 2
            while _time.monotonic() < deadline and not _already_running(port):
                _time.sleep(0.03)

    if existing is not None:
        print(f"控制台已经在运行：{url}")
        if open_browser:
            _open_window(url)
        return 0

    assert httpd is not None and server_thread is not None
    url = f"http://127.0.0.1:{port}/"
    print(f"文章总库控制台已启动：{url}")
    print("点按钮就能跑：选题 → 配图 → 排版 → 发到三个平台。")
    print("关掉这个黑窗口、或在页面右上角点「退出控制台」，都可以停止它。")
    if open_browser:
        _open_window(url)
    try:
        server_thread.join()
    except KeyboardInterrupt:
        print("\n已停止控制台。")
        httpd.shutdown()
        server_thread.join(timeout=3)
    finally:
        httpd.server_close()
        restart_requested = SERVER.pop("restart_requested", False)
        if SERVER.get("httpd") is httpd:
            SERVER.update({"httpd": None, "port": None})
        if restart_requested:
            restart_env = os.environ.copy()
            for name in ("PYTHONHOME", "PYTHONPATH", "PYTHONUSERBASE", "PYTHONEXECUTABLE", "CODEX_HOME"):
                restart_env.pop(name, None)
            restart_script_value = os.environ.get("ARTICLE_HUB_RESTART_SCRIPT", "")
            restart_root = config.ROOT.resolve(strict=True)
            restart_args = None
            if sys.platform == "win32" and restart_script_value:
                try:
                    restart_script = Path(restart_script_value)
                    if not restart_script.is_absolute() or restart_script.is_symlink() or bool(getattr(os.path, "isjunction", lambda _: False)(restart_script)):
                        raise ValueError("重启脚本路径无效")
                    restart_script = restart_script.resolve(strict=True)
                    if restart_script.parent != restart_root or not restart_script.is_file() or restart_script.suffix.casefold() != ".ps1":
                        raise ValueError("重启脚本不在开发根目录")
                    restart_args = ["powershell.exe", "-ExecutionPolicy", "RemoteSigned", "-NoProfile", "-File", str(restart_script), "-NoBrowser"]
                except (OSError, ValueError) as exc:
                    print(f"控制台安全重启拒绝：{exc}", file=sys.stderr)
            else:
                expected_python = str(Path(sys.executable).resolve(strict=True))
                expected_prefix = str(Path(sys.prefix).resolve(strict=True))
                restart_code = "\n".join((
                    "import importlib.util, os, sys",
                    f"expected_root = os.path.realpath({str(restart_root)!r})",
                    f"expected_python = os.path.realpath({expected_python!r})",
                    f"expected_prefix = os.path.realpath({expected_prefix!r})",
                    "same = lambda value, expected: os.path.normcase(os.path.realpath(value)) == os.path.normcase(expected)",
                    "if sys.flags.isolated != 1 or not same(sys.executable, expected_python) or not same(sys.prefix, expected_prefix): raise SystemExit('restart runtime mismatch')",
                    "if not same(os.getcwd(), expected_root): raise SystemExit('restart cwd mismatch')",
                    "sys.path.insert(0, expected_root)",
                    "spec = importlib.util.find_spec('article_hub')",
                    "expected_origin = os.path.join(expected_root, 'article_hub', '__init__.py')",
                    "if not spec or not spec.origin or not same(spec.origin, expected_origin): raise SystemExit('restart package mismatch')",
                    "from article_hub.console import serve",
                    f"serve(port={int(port)}, open_browser=False)",
                ))
                restart_args = [sys.executable, "-I", "-X", "utf8", "-c", restart_code]
            if restart_args:
                try:
                    subprocess.Popen(
                        restart_args, cwd=str(restart_root), env=restart_env,
                        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
                except OSError as exc:
                    print(f"控制台安全重启失败：{exc}", file=sys.stderr)
    return 0
