from __future__ import annotations

import argparse
import html
import json
import sys
import time
from contextlib import nullcontext
from pathlib import Path

from .queue import DraftQueue


def parser():
    p = argparse.ArgumentParser(description='本地文章 → 今日头条草稿箱（不公开发布）')
    p.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    sub = p.add_subparsers(dest='command', required=True)
    sub.add_parser('init', help='创建目录并把根目录 Word 移入待发文章')
    sub.add_parser('list', help='查看待发及已入草稿的记录')
    sub.add_parser('preview', help='生成本地文章预览和机器可读清单')
    login = sub.add_parser('login', help='打开专用 Edge 并等待手动登录')
    login.add_argument('--timeout', type=int, default=300)
    probe = sub.add_parser('probe', help='记录今日头条发文页结构，便于页面改版后修复')
    probe.add_argument('--cdp', help='可选：连接已经启用调试的本机 Edge http://127.0.0.1:端口')
    run = sub.add_parser('run', help='保存到草稿箱；逐篇回读成功后归档')
    run.add_argument('--limit', type=int, default=1, help='本次最多新建篇数；0 表示全部')
    run.add_argument('--interval', type=float, default=12, help='新建草稿之间的秒数（最少 5 秒）')
    run.add_argument('--cdp', help='可选：连接已经启用调试的本机 Edge http://127.0.0.1:端口')
    run.add_argument('--清空编辑器', '--reset-editor', dest='reset_editor', action='store_true',
                     help='编辑器里残留着上次的临时内容时，先清空再导入（不会动已保存的草稿）')
    resolve = sub.add_parser('resolve', help='到草稿箱人工确认已经有这篇之后，补登记并归档')
    resolve.add_argument('--标题', required=True, help='标题，或标题里的一小段')
    return p


def preview(queue, articles):
    directory = queue.root / '预览'
    directory.mkdir(exist_ok=True)
    items, links = [], []
    seen = set()
    for article in articles:
        item = {'source': str(article.source), 'title': article.title, 'html': article.html,
                'text': article.text, 'fingerprint': article.fingerprint,
                'warnings': article.warnings, 'duplicate': article.fingerprint in seen}
        items.append(item)
        if item['duplicate']:
            continue
        seen.add(article.fingerprint)
        name = article.fingerprint[:16] + '.html'
        body = f'<h1>{html.escape(article.title)}</h1>{article.html}'
        (directory / name).write_text(page(article.title, body), encoding='utf-8')
        links.append(f'<li><a href="{name}">{html.escape(article.title)}</a><small>{len(article.text)} 字符</small></li>')
    (directory / 'manifest.json').write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
    (directory / 'index.html').write_text(page('待发文章预览', '<h1>待发文章预览</h1><p>这些是本地预览，尚未发送到今日头条。</p><ol>' + ''.join(links) + '</ol>'), encoding='utf-8')
    print(f'已生成 {len(seen)} 篇预览，{len(items) - len(seen)} 份重复稿：{directory / "index.html"}')


def page(title, body):
    return ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{html.escape(title)}</title><style>'
            'body{max-width:840px;margin:48px auto;padding:0 24px;font:18px/1.85 system-ui;color:#20252b}'
            'h1{font-size:30px;line-height:1.4}h2{font-size:24px}li{margin:16px 0}'
            'a{color:#1767b9}small{display:block;color:#64748b}blockquote{border-left:3px solid #ccc;padding-left:20px}'
            '</style><body>' + body + '</body></html>')


def resolve(queue, articles, args):
    """人工确认草稿箱里已经有这篇之后，补登记并归档；不会再新建草稿。"""
    from .urls import EDITOR_URL
    hit = 0
    for article in articles:
        if args.标题 not in article.title:
            continue
        queue.verified(article, EDITOR_URL, evidence='草稿箱已人工确认存在，补登记')
        target = queue.archive(article)
        hit += 1
        print(f'已确认并归档：{article.title} → {target.name}')
    if not hit:
        print(f'待发目录里没有标题包含「{args.标题}」的稿子。')
    return hit


def run(queue, articles, args):
    from .browser import ToutiaoBrowser
    if args.limit < 0 or args.interval < 5:
        raise ValueError('--limit 不能小于 0；--interval 不能少于 5 秒。')
    # 先恢复已经保存成功、但尚未来得及移动的文件。
    pending = []
    for article in articles:
        record = queue.get(article.fingerprint)
        if record and record['status'] in ('verified', 'archived'):
            queue.db.execute('DELETE FROM drafts WHERE fingerprint=?', (article.fingerprint,))
            queue.db.commit()
            print(f'重发：{article.source.name}（之前存过，按你的设置再发一次）', flush=True)
        pending.append(article)
    if not pending:
        print('没有待处理的新文章。')
        return
    sent = 0
    failed = 0
    with ToutiaoBrowser(queue.root, cdp_url=args.cdp) as browser:
        browser.ensure_login()
        for article in pending:
            record = queue.get(article.fingerprint)
            if record and record['status'] in ('verified', 'archived'):
                queue.db.execute('DELETE FROM drafts WHERE fingerprint=?', (article.fingerprint,))
                queue.db.commit()
                record = None
            if args.limit and sent >= args.limit:
                break
            if record and not record.get('draft_url'):
                print(f'提示：{article.title} 上次结果不明，继续重试（可能产生重复草稿，删掉即可）。',
                      flush=True)
            queue.begin(article)
            print(f'正在保存：{article.title}', flush=True)
            try:
                url = browser.save_draft(article, resume_url=record['draft_url'] if record else None,
                    on_created=lambda url, fp=article.fingerprint: queue.created(fp, url),
                    reset_editor=getattr(args, 'reset_editor', False))
                queue.verified(article, url)
            except Exception as exc:
                queue.failed(article.fingerprint, exc)
                failed += 1
                print(f'[失败] {article.title}：{str(exc)[:160]}', flush=True)
                print('       这篇跳过，继续发下一篇（原稿留在待发文章里）。', flush=True)
                continue
            target = queue.archive(article)
            sent += 1
            print(f'已保存并验证：{url}\n已归档：{target.name}', flush=True)
            if not args.limit or sent < args.limit:
                time.sleep(args.interval)
    print(f'完成：成功 {sent} 篇进入今日头条草稿箱'
          + (f'，失败 {failed} 篇（已跳过，原稿保留）' if failed else '') + '。')


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    args = parser().parse_args()
    queue = DraftQueue(args.root)
    try:
        with (queue.lock() if args.command in ('init', 'login', 'run', 'probe', 'resolve')
                else nullcontext()):
            if args.command == 'init':
                names = queue.organize()
                print(f'目录就绪，已整理 {len(names)} 篇 Word 到待发文章。')
            elif args.command == 'login':
                from .browser import ToutiaoBrowser
                with ToutiaoBrowser(queue.root, login_timeout=args.timeout) as browser:
                    browser.ensure_login()
                print('登录状态已保存在本项目专用 Edge 中。')
            elif args.command == 'probe':
                from .browser import ToutiaoBrowser
                with ToutiaoBrowser(queue.root, cdp_url=args.cdp) as browser:
                    path = browser.dump_editor()
                print(f'已记录编辑器页面结构：{path}')
            else:
                articles = list(queue.articles())
                if args.command == 'list':
                    seen = set()
                    for article in articles:
                        record = queue.get(article.fingerprint)
                        state = record['status'] if record else ('重复稿' if article.fingerprint in seen else '待发')
                        seen.add(article.fingerprint)
                        print(f'[{state}] {article.source.name}')
                        for warning in article.warnings:
                            print(f'  提示：{warning}')
                    print(f'待发目录 {len(articles)} 个文件 / {len(seen)} 篇不同内容；已保存记录 {sum(r["status"] in ("verified", "archived") for r in queue.records())} 条。')
                elif args.command == 'preview':
                    preview(queue, articles)
                elif args.command == 'run':
                    run(queue, articles, args)
                elif args.command == 'resolve':
                    resolve(queue, articles, args)
        return 0
    except KeyboardInterrupt:
        print('\n已停止。原稿与已保存的进度记录会保留。', file=sys.stderr)
        return 130
    except Exception as exc:
        print(f'\n操作停止：{exc}', file=sys.stderr)
        return 1
    finally:
        queue.close()


if __name__ == '__main__':
    raise SystemExit(main())
