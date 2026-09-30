"""本地队列与持久化记录；只有回读验证成功才能归档源文件。"""
from __future__ import annotations

import json
import hashlib
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .articles import load_article
from .manuscripts import manuscript_files

SUPPORTED = {'.docx', '.md', '.txt'}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class DraftQueue:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.pending = self.root / '待发文章'
        self.sent = self.root / '已发文章'
        self.duplicates = self.root / '重复文章'
        self.data = self.root / 'data'
        for directory in (self.pending, self.sent, self.duplicates, self.data, self.root / 'logs'):
            directory.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.data / 'drafts.sqlite3')
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS drafts (
            fingerprint TEXT PRIMARY KEY, title TEXT NOT NULL,
            status TEXT NOT NULL, draft_url TEXT, source TEXT,
            error TEXT, evidence TEXT, updated_at TEXT NOT NULL,
            source_digest TEXT)''')
        columns = {row['name'] for row in self.db.execute('PRAGMA table_info(drafts)')}
        if 'source_digest' not in columns:
            self.db.execute('ALTER TABLE drafts ADD COLUMN source_digest TEXT')
        self.db.commit()

    def close(self):
        self.db.close()

    def safe(self, path: Path) -> Path:
        resolved = path.resolve()
        if not resolved.is_relative_to(self.root) or path.is_symlink():
            raise ValueError(f'路径不在项目内或是符号链接：{path}')
        return resolved

    @contextmanager
    def lock(self):
        """OS 文件锁，进程退出自动释放；不留下会永远卡住的 PID 锁。"""
        path = self.data / 'run.lock'
        handle = path.open('a+b')
        try:
            handle.seek(0, 2)
            if handle.tell() == 0:
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                try:
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                except OSError as exc:
                    raise RuntimeError('另一个发文任务正在运行，请勿重复启动。') from exc
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield
        finally:
            handle.close()

    def organize(self):
        """只整理根目录原有 Word 稿件，保留 README 等项目文件。"""
        moved = []
        for path in sorted(self.root.glob('*.docx')):
            if path.name.startswith('~$'):
                continue
            target = self.pending / path.name
            self.move(path, target)
            moved.append(target.name)
        return moved

    def move(self, source, target):
        source, target = self.safe(source), self.safe(target)
        if target.exists():
            raise FileExistsError(f'目标已存在，为保护原文停止移动：{target}')
        source.rename(target)

    def articles(self):
        for path in manuscript_files(self.pending):
            if path.is_file() and path.suffix.lower() in SUPPORTED and not path.name.startswith('~$'):
                yield load_article(self.safe(path))

    def get(self, fingerprint):
        row = self.db.execute('SELECT * FROM drafts WHERE fingerprint=?', (fingerprint,)).fetchone()
        return dict(row) if row else None

    def begin(self, article):
        record = self.get(article.fingerprint)
        if record:
            return record
        self.db.execute('''INSERT INTO drafts
            (fingerprint,title,status,draft_url,source,error,evidence,updated_at,source_digest)
            VALUES (?,?,?,?,?,?,?,?,?)''', (
            article.fingerprint, article.title, 'uploading', None,
            str(article.source.relative_to(self.root)), None, None, now(), article.source_digest))
        self.db.commit()
        return self.get(article.fingerprint)

    def created(self, fingerprint, url):
        import re
        if not re.fullmatch(r'https://zhuanlan\.zhihu\.com/p/\d+/edit', url):
            raise ValueError(f'不是知乎草稿编辑地址：{url}')
        self.db.execute('UPDATE drafts SET draft_url=?,updated_at=? WHERE fingerprint=?', (url, now(), fingerprint))
        self.db.commit()

    def failed(self, fingerprint, error):
        self.db.execute('UPDATE drafts SET status=?,error=?,updated_at=? WHERE fingerprint=?',
                        ('needs_review', str(error)[:4000], now(), fingerprint))
        self.db.commit()

    def verified(self, article, url, evidence='独立页面回读标题与全文一致'):
        record = self.begin(article)
        self._check_record_source(article, record)
        self.created(article.fingerprint, url)
        self.db.execute('UPDATE drafts SET status=?,error=NULL,evidence=?,updated_at=? WHERE fingerprint=?',
                        ('verified', evidence, now(), article.fingerprint))
        self.db.commit()

    def _check_record_source(self, article, record):
        """A restart must not accept format changes to the original upload source."""
        same_source = str(self.safe(article.source).relative_to(self.root)) == record['source']
        if record['status'] == 'archived' or not same_source:
            return
        if not record.get('source_digest'):
            raise RuntimeError('旧记录缺少上传时的原文件校验摘要，保留待发原文，请人工核对。')
        if not article.source_digest:
            raise RuntimeError('缺少原文件校验摘要，请重新读取文章后再归档。')
        if record['source_digest'] != article.source_digest:
            raise RuntimeError('原文件在上次上传后已修改，保留待发原文，请人工核对。')

    def archive(self, article):
        record = self.get(article.fingerprint)
        if not record or record['status'] not in ('verified', 'archived'):
            raise RuntimeError('草稿尚未经过保存回读验证，禁止移动原文。')
        self._check_record_source(article, record)
        source = self.safe(article.source)
        if not article.source_digest:
            raise RuntimeError('缺少原文件校验摘要，请重新读取文章后再归档。')
        if hashlib.sha256(source.read_bytes()).hexdigest() != article.source_digest:
            raise RuntimeError('上传期间源文件已修改，保留待发原文，请核对。')
        # 已有另一份归档时，将同内容的副本单独归入重复文章。
        first_name = Path(record['source']).name
        duplicate = article.source.name != first_name or record['status'] == 'archived'
        original_target = self.sent / article.source.name
        if article.source.name == first_name and original_target.exists():
            try:
                existing = load_article(self.safe(original_target))
            except (OSError, ValueError) as exc:
                raise FileExistsError(f'归档目标已存在且无法确认内容一致：{original_target}') from exc
            if existing.fingerprint != article.fingerprint:
                raise FileExistsError(f'归档目标已存在且内容不同：{original_target}')
            duplicate = True
        target = (self.duplicates if duplicate else self.sent) / article.source.name
        if duplicate:
            number = 1
            while target.exists():
                target = self.duplicates / f'{article.source.stem} ({number}){article.source.suffix}'
                number += 1
        elif target.exists():
            raise FileExistsError(f'归档目标已存在：{target}')
        receipt = {
            'title': article.title, 'source_file': article.source.name,
            'fingerprint': article.fingerprint, 'draft_url': record['draft_url'],
            'source_digest': article.source_digest,
            'status': 'duplicate' if duplicate else 'saved_to_draft',
            'publicly_published': False, 'verified_at': record['updated_at'],
            'evidence': record['evidence'],
        }
        receipt_path = self.data / f'{article.fingerprint}.json'
        # 回执、验证状态先落盘，文件移动中断后下次可以直接完成归档。
        if not receipt_path.exists():
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        self.move(article.source, target)
        self.db.execute('UPDATE drafts SET status=?,updated_at=? WHERE fingerprint=?',
                        ('archived', now(), article.fingerprint))
        self.db.commit()
        return target

    def records(self):
        return [dict(row) for row in self.db.execute('SELECT * FROM drafts ORDER BY updated_at DESC')]
