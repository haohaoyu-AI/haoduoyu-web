"""Flatten completed archives, keeping recoverable originals outside the archive."""
import hashlib
import json
import shutil
import uuid
from pathlib import Path
from . import config


def signature(folder):
    rows=[]
    for path in sorted(folder.rglob('*')):
        if path.is_symlink() or path.is_junction():
            raise ValueError('包含链接，跳过')
        if path.is_file():
            stat=path.stat()
            rows.append((str(path.relative_to(folder)),stat.st_size,stat.st_mtime_ns))
    return rows


def preview():
    root=(config.ROOT/'已分发归档').resolve()
    plans=[]
    if not root.is_dir(): return plans
    for folder in root.iterdir():
        if not folder.is_dir() or folder.is_symlink() or folder.is_junction(): continue
        try:
            marker=folder/'.分发归档.json'
            if marker.is_file() and json.loads(marker.read_text(encoding='utf-8')).get('源目录待清理'): continue
            docs=[p for p in folder.glob('*.docx') if p.name!='原文.docx' and not p.name.startswith('~')]
            if len(docs)!=1: continue
            if not marker.is_file() and (docs[0].stem != folder.name or not (folder/'配图清单.json').is_file()): continue
            plans.append({'folder':str(folder),'doc':docs[0].name,'signature':signature(folder)})
        except (OSError,ValueError): continue
    return plans


def execute(plans):
    root=(config.ROOT/'已分发归档').resolve()
    backup=config.DATA/'归档清理恢复'/uuid.uuid4().hex
    done=0
    for plan in plans:
        folder=Path(plan['folder'])
        if folder.resolve().parent!=root or folder.is_symlink() or folder.is_junction():
            raise ValueError('归档目录发生变化，请重新预览')
        if signature(folder)!=plan['signature']: raise ValueError('归档内容发生变化，请重新预览')
        source=folder/plan['doc']
        target=root/source.name
        if target.exists():
            target=root/(source.stem+'-'+uuid.uuid4().hex[:8]+'.docx')
        backup.mkdir(parents=True,exist_ok=True)
        # Exclusive creation prevents overwriting a same-name manuscript.
        with source.open('rb') as src, target.open('xb') as dst:
            shutil.copyfileobj(src,dst)
        if hashlib.sha256(source.read_bytes()).digest()!=hashlib.sha256(target.read_bytes()).digest():
            raise ValueError('成稿校验失败，原目录保留')
        shutil.move(str(folder),str(backup/folder.name))
        done+=1
    return {'removed':done,'backup':str(backup),'failed':0}
