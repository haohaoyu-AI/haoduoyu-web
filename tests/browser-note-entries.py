"""Local synthetic multi-entry notes acceptance; no production requests or business text."""
import json, select, subprocess
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
DAY, OTHER, STAMP = '2026-10-24', '2026-10-23', '2026-10-24T08:42:00.000Z'
report = {'synthetic': True, 'checks': [], 'pageerrors': [], 'external_requests': []}
server = subprocess.Popen(['node', 'tests/daily-notes-ui-browser-server.mjs'], cwd=ROOT,
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
assert select.select([server.stdout], [], [], 45)[0]
origin = server.stdout.readline().strip()
assert origin.startswith('http://127.0.0.1:')
def mark(text): report['checks'].append(text); print('Passed: ' + text, flush=True)
def until(page, check):
    for _ in range(120):
        if check(): return
        page.wait_for_timeout(25)
    assert check()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        for width in [375, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 1000}, is_mobile=width < 600,
                has_touch=width < 600, locale='zh-CN', timezone_id='Asia/Shanghai')
            fixture = {'data': {}, 'receipts': {}, 'writes': [], 'mode': '', 'held': [], 'owner': True}
            legacy = {'date': DAY, 'text': '合成原有记录', 'version': 1, 'updated_at': STAMP, 'deleted': False, 'can_edit': True}
            def commit(identifier, body, kind='put'):
                old = fixture['data'].get(identifier, {})
                text = body['text'] if kind == 'put' else old['text']
                raw = {'id': identifier, 'category': old.get('category', body.get('category')), 'date': old.get('date', body.get('date')),
                    'text': text, 'version': body['version'] + 1, 'created_at': old.get('created_at', STAMP), 'updated_at': STAMP,
                    'deleted': kind == 'delete', 'can_edit': fixture['owner']}
                raw['content_hash'] = identifier + ':' + str(raw['version']) + ':' + text + ':' + kind
                fixture['data'][identifier] = raw
                fixture['receipts'][body['save_id']] = {'found': True, 'id': identifier, 'version': raw['version'], 'content_hash': raw['content_hash']}
                return raw
            def handler(route):
                request = route.request
                if not request.url.startswith(origin + '/'):
                    report['external_requests'].append(request.url); route.abort(); return
                parts = urlsplit(request.url)
                if not parts.path.startswith('/api/v1/'):
                    route.continue_(); return
                path, query = parts.path.removeprefix('/api/v1'), parse_qs(parts.query)
                def respond(value, status=200): route.fulfill(status=status, content_type='application/json', body=json.dumps({'data': value}, ensure_ascii=False))
                if path == '/auth/me': respond({'id': 'synthetic-notes-owner', 'username': 'Synthetic owner', 'csrfToken': 'synthetic-csrf', 'publicBusiness': True})
                elif path == '/accounts': respond([])
                elif path.endswith('/dates'):
                    dates = sorted(set([DAY] + [v['date'] for v in fixture['data'].values() if v['category'] == query.get('category', ['life'])[0]]), reverse=True)
                    respond({'dates': dates, 'has_more': False, 'next_before': None})
                elif path == '/daily-notes':
                    day, category = query['date'][0], query.get('category', ['life'])[0]
                    respond({**legacy, 'can_edit': fixture['owner']} if day == DAY and category == 'life' else
                        {'date': day, 'text': '', 'version': 0, 'updated_at': None, 'deleted': False, 'can_edit': fixture['owner']})
                elif path == '/note-entries':
                    category, day = query['category'][0], query['date'][0]
                    respond({'category': category, 'date': day, 'can_edit': fixture['owner'],
                        'entries': [{**v, 'can_edit': fixture['owner']} for v in fixture['data'].values() if v['date'] == day and v['category'] == category and not v['deleted']]})
                elif path.startswith('/note-entries/operations/'):
                    respond(fixture['receipts'].get(path.rsplit('/', 1)[1], {'found': False}))
                elif path.startswith('/note-entries/') and request.method == 'GET':
                    identifier = path.rsplit('/', 1)[1]
                    if identifier not in fixture['data']: respond(None, 404)
                    else: respond({**fixture['data'][identifier], 'can_edit': fixture['owner']})
                elif path.startswith('/note-entries/') and request.method in ['PUT', 'DELETE', 'POST']:
                    identifier = path.split('/')[2]; body = request.post_data_json; kind = 'put' if request.method == 'PUT' else 'delete' if request.method == 'DELETE' else 'restore'
                    fixture['writes'].append({'id': identifier, 'body': body, 'kind': kind})
                    mode, fixture['mode'] = fixture['mode'], ''
                    if mode == 'hold': fixture['held'].append((route, identifier, body, kind)); return
                    if mode == 'unknown_before': route.abort('failed'); return
                    if mode == 'conflict':
                        commit(identifier, {**body, 'text': '<img src=x onerror=alert(1)> 合成服务器版本', 'save_id': 'external'})
                        route.fulfill(status=409, content_type='application/json', body=json.dumps({'error': {'code': 'VERSION_CONFLICT', 'message': '合成版本冲突'}})); return
                    value = commit(identifier, body, kind)
                    if mode == 'unknown_after': route.abort('failed'); return
                    respond(value)
                else: raise AssertionError('Unexpected synthetic route: ' + request.method + ' ' + path)
            context.route('**/*', handler)
            page = context.new_page(); page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
            page.goto(origin + '/?page=notes&date=' + DAY)
            expect(page.locator('#page-content')).to_have_attribute('aria-busy', 'false')
            expect(page.locator('#notes-legacy-card')).to_be_visible()
            expect(page.locator('#notes-legacy-card .note-entry-time')).to_have_text('原有记录')
            expect(page.locator('#notes-entry-list textarea')).to_have_count(0)
            page.locator('[data-notes-action=new]').click(); first = page.locator('#notes-entry-list textarea').first
            identifier = first.get_attribute('data-note-entry-editor'); tile = page.locator('[data-note-entry="' + identifier + '"]')
            first.evaluate("e=>{e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.value='拼音草稿';e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}))}")
            page.wait_for_timeout(550); assert not fixture['writes']
            first.evaluate("e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))")
            expect(tile.locator('.note-entry-status')).to_have_text('已保存'); expect(tile.locator('time')).to_have_text('16:42')
            first.evaluate("e=>{e.dataset.testIdentity='stable';e.focus();e.setSelectionRange(1,2)}")
            fixture['mode'] = 'hold'; first.fill('等待响应的第一稿'); until(page, lambda: len(fixture['held']) == 1)
            first.fill('等待时继续输入的第二稿'); first.evaluate('e=>e.setSelectionRange(2,4)')
            assert not first.is_disabled()
            held, hid, body, kind = fixture['held'].pop(); held.fulfill(status=200, content_type='application/json', body=json.dumps({'data': commit(hid, body, kind)}, ensure_ascii=False))
            expect(tile.locator('.note-entry-status')).to_have_text('已保存')
            until(page, lambda: fixture['data'][identifier]['text'] == '等待时继续输入的第二稿')
            assert first.evaluate("e=>document.activeElement===e&&e.dataset.testIdentity==='stable'&&e.selectionStart===2&&e.selectionEnd===4")
            mark('IME, fast serial autosave, real server time and stable focus/selection ' + str(width))
            page.locator('[data-notes-action=new]').click(); second = page.locator('#notes-entry-list textarea').nth(1)
            second_id = second.get_attribute('data-note-entry-editor'); second_tile = page.locator('[data-note-entry="' + second_id + '"]')
            fixture['mode'] = 'unknown_before'; second.fill('原来要保存的文字')
            expect(second_tile.locator('[data-note-entry-action=retry]')).to_be_visible(); writes_before = len(fixture['writes'])
            original = fixture['writes'][-1]
            second.fill('核对期间继续输入'); page.wait_for_timeout(550); assert len(fixture['writes']) == writes_before
            second_tile.locator('[data-note-entry-action=retry]').click()
            until(page, lambda: fixture['data'].get(second_id, {}).get('text') == '核对期间继续输入')
            assert fixture['writes'][writes_before] == original
            expect(second_tile.locator('.note-entry-status')).to_have_text('已保存')
            fixture['mode'] = 'conflict'; second.fill('要保留的冲突草稿')
            expect(second_tile.locator('.note-entry-conflict')).to_be_visible(); expect(second).to_have_value('要保留的冲突草稿')
            assert second_tile.locator('img').count() == 0
            second_tile.locator('[data-note-entry-action=use-draft]').click(); expect(second_tile.locator('.note-entry-status')).to_have_text('已保存')
            mark('two entries, unknown-write exact retry, continued draft and explicit conflict resolution ' + str(width))
            fixture['mode'] = 'hold'; first.fill('切换分类时等待确认'); until(page, lambda: len(fixture['held']) == 1)
            page.locator('.notes-categories [data-notes-category=work]').click()
            expect(page.locator('#daily-notes')).to_have_attribute('data-category', 'work')
            expect(page.locator('#page-content')).to_have_attribute('aria-busy', 'false')
            page.locator('[data-notes-action=new]').click(); work = page.locator('#notes-entry-list textarea'); work.fill('合成工作记录')
            expect(page.locator('#notes-entry-list .note-entry-status')).to_have_text('已保存')
            held, hid, body, kind = fixture['held'].pop(); held.fulfill(status=200, content_type='application/json', body=json.dumps({'data': commit(hid, body, kind)}, ensure_ascii=False))
            expect(work).to_have_value('合成工作记录')
            page.locator('.notes-categories [data-notes-category=life]').click()
            expect(page.locator('#notes-entry-list textarea')).to_have_count(2)
            expect(page.locator('#notes-entry-list textarea').first).to_have_value('切换分类时等待确认')
            page.locator('#notes-date').fill(OTHER); page.locator('#notes-date').dispatch_event('change')
            expect(page.locator('#daily-notes')).to_have_attribute('data-date', OTHER)
            expect(page.locator('#notes-entry-empty')).to_be_visible(); page.locator('[data-notes-action=new]').click()
            past = page.locator('#notes-entry-list textarea'); past.fill('合成过去日期记录'); expect(page.locator('#notes-entry-list .note-entry-status')).to_have_text('已保存')
            assert fixture['writes'][-1]['body']['date'] == OTHER
            page.reload(); expect(page.locator('#notes-entry-list textarea')).to_have_value('合成过去日期记录')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            mark('category/date isolation, delayed acknowledgement, reload and responsive layout ' + str(width))
            fixture['owner'] = False; page.reload()
            expect(page.locator('[data-notes-action=new]')).to_be_hidden()
            expect(page.locator('#notes-entry-list textarea')).to_be_hidden()
            expect(page.locator('#notes-entry-list .note-entry-reader')).to_have_text('合成过去日期记录')
            mark('server-authorized read-only rendering ' + str(width))
            context.close()
        assert not report['pageerrors'] and not report['external_requests']; browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=10)
    except subprocess.TimeoutExpired: server.kill(); server.wait()
    Path('/tmp/note-entries-browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False))
