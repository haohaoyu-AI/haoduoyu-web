"""Local-only memo acceptance using the real Worker and temporary synthetic D1.

Run after npm run build. Requires existing Python Playwright and system Chromium.
Starts/stops its own loopback fixture; screenshots contain synthetic content only.
"""
import json
import hashlib
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/memos'
OUT.mkdir(parents=True, exist_ok=True)
harness = (ROOT / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert username.startswith('synthetic-')
report = {'synthetic': True, 'real_backend': True, 'checks': [], 'screenshots': [],
          'pageerrors': [], 'blocked_external': [], 'expected_network_failures': []}
report['validated_sha256'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                            for name in ['public/app.js', 'public/memos.css', 'dist/server/index.js']}
server = subprocess.Popen(['node', 'tests/memos-browser-server.mjs'], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
origin = server.stdout.readline().strip()
if not origin.startswith('http://127.0.0.1:'):
    raise RuntimeError('Synthetic memo fixture failed to start: ' + server.stderr.read())
expect.set_options(timeout=15000)


def mark(name):
    report['checks'].append(name)
    print('Passed: ' + name, flush=True)


def action(page, name):
    return page.locator('[data-memo-action="' + name + '"]')


def confirm(page, title=None):
    expect(page.locator('#memo-dialog')).to_be_visible()
    field = page.locator('#memo-dialog-title')
    if title is not None and field.is_visible():
        field.fill(title)
    action(page, 'confirm').click()
    expect(page.locator('#memo-dialog')).to_be_hidden()


def snapshot(page):
    response = page.request.get(origin + '/api/v1/memos')
    assert response.status == 200, response.text()
    return response.json()['data']


def detail(page, note_id):
    response = page.request.get(origin + '/api/v1/memos/notes/' + note_id)
    assert response.status == 200, response.text()
    return response.json()['data']


def open_note(page, group_id, note_id):
    group = page.locator('[data-memo-group="' + group_id + '"]')
    if not group.is_visible() and action(page, 'back-groups').is_visible():
        action(page, 'back-groups').click()
    group.click()
    page.locator('[data-memo-note="' + note_id + '"]').click()


def screenshot(page, name):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow: ' + name
    path = OUT / name
    page.screenshot(path=str(path), full_page=True)
    report['screenshots'].append(str(path.relative_to(ROOT)))


try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        report['browser'] = browser.version

        def context(width=1440, storage_state=None):
            value = browser.new_context(viewport={'width': width, 'height': 1000 if width == 1440 else 900},
                                        is_mobile=width < 768, has_touch=width < 768,
                                        locale='zh-CN', timezone_id='Asia/Shanghai', storage_state=storage_state)

            def local_only(route):
                if route.request.url.startswith(origin + '/'):
                    route.continue_()
                else:
                    report['blocked_external'].append(route.request.url)
                    route.abort()
            value.route('**/*', local_only)
            page = value.new_page()
            page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
            page.on('requestfailed', lambda request: report['expected_network_failures'].append({
                'method': request.method, 'path': urlsplit(request.url).path, 'failure': request.failure}))
            return value, page

        owner_context, owner = context()
        owner.on('dialog', lambda dialog: dialog.accept())
        owner.goto(origin + '/?page=memos')
        expect(owner.locator('#memos')).to_be_visible()
        expect(action(owner, 'login')).to_be_visible()
        action(owner, 'login').click()
        owner.locator('#username').fill(username)
        owner.locator('#password').fill(password)
        owner.locator('#login-form button[type=submit]').click()
        expect(action(owner, 'new-group')).to_be_visible()
        assert 'page=memos' in owner.url
        assert snapshot(owner)['can_edit'] is True
        mark('existing real owner login retains memo route and enables owner capability')

        action(owner, 'new-group').click()
        confirm(owner, '合成常用资料')
        group = next(item for item in snapshot(owner)['groups'] if item['title'] == '合成常用资料')
        owner.locator('[data-memo-group="' + group['id'] + '"]').click()
        action(owner, 'rename-group').click()
        confirm(owner, '合成参考资料')
        assert next(item for item in snapshot(owner)['groups'] if item['id'] == group['id'])['title'] == '合成参考资料'
        action(owner, 'new-note').click()
        confirm(owner, '合成欢迎笔记')
        expect(owner.locator('#memo-body')).to_be_visible()
        note = next(item for item in snapshot(owner)['notes'] if item['title'] == '合成欢迎笔记')
        text = '仅用于本地验收的合成内容。\n\n<img src=x onerror=alert(1)> 作为普通文字显示。'
        owner.locator('#memo-title').fill('合成长期参考')
        owner.locator('#memo-body').fill(text)
        expect(owner.locator('#memo-status')).to_contain_text('已保存')
        saved = detail(owner, note['id'])
        assert saved['title'] == '合成长期参考' and saved['body'] == text
        assert owner.locator('#memos img').count() == 0
        screenshot(owner, 'desktop-owner-1440.png')
        mark('desktop create/rename group and note; title/body autosave; plaintext rendering; no horizontal overflow')

        public_context, public = context()
        public.goto(origin + '/?page=memos')
        open_note(public, group['id'], note['id'])
        expect(public.locator('#memos')).to_contain_text(text)
        expect(public.locator('#memo-body')).to_be_hidden()
        assert not action(public, 'new-group').is_visible()
        assert not action(public, 'new-note').is_visible()
        assert snapshot(public)['can_edit'] is False
        screenshot(public, 'desktop-public-1440.png')
        mark('independent anonymous desktop reader sees only public text and no mutation controls')

        mobile_context, mobile = context(375, owner_context.storage_state())
        mobile.goto(origin + '/?page=memos')
        open_note(mobile, group['id'], note['id'])
        expect(mobile.locator('#memo-body')).to_have_value(text)
        mobile.locator('#memo-body').fill(text + '\n手机编辑同一条长期笔记。')
        expect(mobile.locator('#memo-status')).to_contain_text('已保存')
        screenshot(mobile, 'mobile-owner-editor-375.png')
        action(mobile, 'back-notes').click()
        expect(mobile.locator('[data-memo-note="' + note['id'] + '"]')).to_be_visible()
        screenshot(mobile, 'mobile-notes-375.png')
        action(mobile, 'back-groups').click()
        expect(mobile.locator('[data-memo-group="' + group['id'] + '"]')).to_be_visible()
        screenshot(mobile, 'mobile-groups-375.png')
        mark('mobile group/list/editor navigation and autosave, 375px without overflow')

        public_mobile_context, public_mobile = context(375)
        public_mobile.goto(origin + '/?page=memos')
        open_note(public_mobile, group['id'], note['id'])
        expect(public_mobile.locator('#memos')).to_contain_text('手机编辑同一条长期笔记。')
        assert not action(public_mobile, 'save').is_visible()
        screenshot(public_mobile, 'mobile-public-375.png')
        mark('mobile anonymous reader can navigate the same two-level public structure')

        # The desktop still holds the old version: a second real session updated it.
        owner.locator('#memo-body').fill('合成桌面冲突草稿，必须保留。')
        expect(owner.locator('#memo-status')).to_contain_text('冲突')
        expect(owner.locator('#memo-body')).to_have_value('合成桌面冲突草稿，必须保留。')
        expect(owner.locator('#memo-remote')).to_contain_text('手机编辑同一条长期笔记。')
        screenshot(owner, 'desktop-conflict-1440.png')
        action(owner, 'use-draft').click()
        confirm(owner)
        expect(owner.locator('#memo-status')).to_contain_text('已保存')
        assert detail(owner, note['id'])['body'] == '合成桌面冲突草稿，必须保留。'
        mark('real concurrent mobile update causes desktop CAS409; local/server text retained; explicit resolution saves')

        writes, receipt_reads = [], []
        owner.on('request', lambda request: writes.append(request.post_data_json)
                 if request.method == 'PUT' and urlsplit(request.url).path == '/api/v1/memos/notes/' + note['id'] else None)
        owner.on('request', lambda request: receipt_reads.append(request.url)
                 if '/api/v1/memos/operations/' in request.url else None)
        unknown_path = '**/api/v1/memos/notes/' + note['id']
        dropped = {'once': False}

        def commit_then_drop(route):
            if route.request.method == 'PUT' and not dropped['once']:
                dropped['once'] = True
                response = route.fetch()
                assert response.ok, response.text()
                route.abort('failed')
            else:
                route.continue_()
        owner.route(unknown_path, commit_then_drop)
        owner.locator('#memo-body').fill('合成响应丢失，但服务器已经提交。')
        owner.wait_for_function("() => /核对|已保存/.test(document.querySelector('#memo-status')?.textContent || '')")
        if action(owner, 'check').is_visible():
            action(owner, 'check').click()
        expect(owner.locator('#memo-status')).to_contain_text('已保存')
        assert dropped['once'] and len(writes) == 1 and len(receipt_reads) >= 1
        assert detail(owner, note['id'])['body'] == '合成响应丢失，但服务器已经提交。'
        owner.unroute(unknown_path, commit_then_drop)
        mark('lost response after real commit resolves through receipt lookup with exactly one PUT, no blind replay')

        owner_context.set_offline(True)
        offline_text = '合成断网草稿：刷新后仍须存在，禁止自动重放未知提交。'
        owner.locator('#memo-body').fill(offline_text)
        expect(owner.locator('#memo-body')).to_have_value(offline_text)
        owner.wait_for_timeout(1200)
        assert detail(public, note['id'])['body'] != offline_text
        before_reload_writes = len(writes)
        owner_context.set_offline(False)
        owner.reload()
        open_note(owner, group['id'], note['id'])
        expect(owner.locator('#memo-body')).to_have_value(offline_text)
        screenshot(owner, 'desktop-retained-draft-1440.png')
        assert len(writes) == before_reload_writes
        if action(owner, 'check').is_visible():
            action(owner, 'check').click()
        if action(owner, 'retry').is_visible():
            action(owner, 'retry').click()
        else:
            action(owner, 'save').click()
        expect(owner.locator('#memo-status')).to_contain_text('已保存')
        assert detail(owner, note['id'])['body'] == offline_text
        mark('offline draft survives reload; no automatic write replay; explicit recovery saves retained text')

        action(owner, 'delete-note').click()
        confirm(owner)
        assert next(item for item in snapshot(owner)['notes'] if item['id'] == note['id'])['deleted_at']
        assert not snapshot(public)['notes']
        mobile.reload()
        action(mobile, 'trash').click()
        action(mobile, 'back-notes').click()
        mobile.locator('[data-memo-note="' + note['id'] + '"]').click()
        screenshot(mobile, 'mobile-trash-note-375.png')
        action(mobile, 'restore-note').click()
        expect(mobile.locator('#memo-body')).to_be_visible()
        assert detail(owner, note['id'])['deleted_at'] is None
        mark('owner note soft-delete hides public text; mobile trash navigation/restore retains body')

        # A nonempty group shows its exact title and current note count for confirmation.
        owner.reload()
        open_note(owner, group['id'], note['id'])
        action(owner, 'delete-group').click()
        expect(owner.locator('#memo-dialog-description')).to_contain_text('1')
        confirm(owner, '合成参考资料')
        assert next(item for item in snapshot(owner)['groups'] if item['id'] == group['id'])['deleted_at']
        assert not snapshot(public)['groups'] and not snapshot(public)['notes']
        mobile.reload()
        action(mobile, 'trash').click()
        mobile.locator('[data-memo-group="' + group['id'] + '"]').click()
        action(mobile, 'restore-group').click()
        expect(mobile.locator('[data-memo-action="restore-group"]')).to_be_hidden()
        assert next(item for item in snapshot(owner)['groups'] if item['id'] == group['id'])['deleted_at'] is None
        assert detail(public, note['id'])['body'] == offline_text
        mark('nonempty group requires title/count confirmation; mobile group restore preserves child note')

        assert not report['pageerrors'], report['pageerrors']
        assert not report['blocked_external'], report['blocked_external']
        assert len(report['expected_network_failures']) == 1, report['expected_network_failures']
        assert report['expected_network_failures'][0]['method'] == 'PUT'
        assert report['expected_network_failures'][0]['path'] == '/api/v1/memos/notes/' + note['id']
        report['completed'] = True
        for value in [owner_context, public_context, mobile_context, public_mobile_context]:
            value.close()
        browser.close()
except BaseException as error:
    report['completed'] = False
    report['failure'] = type(error).__name__ + ': ' + str(error)
    raise
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill(); server.wait(timeout=5)
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
