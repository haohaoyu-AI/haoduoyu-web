"""Portable local-only QA using the real frontend and synthetic API responses.
Requires the repository's existing Python Playwright and system Chromium.
Starts/stops its own loopback fixture; no production or external requests.
"""
import json
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/daily-notes-ui'
OUT.mkdir(parents=True, exist_ok=True)
report = {'synthetic': True, 'real_backend': False, 'checks': [], 'screenshots': [], 'pageerrors': [], 'blocked_external': []}
server = subprocess.Popen(['node', 'tests/daily-notes-ui-browser-server.mjs'], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
origin = server.stdout.readline().strip()
if not origin.startswith('http://127.0.0.1:'):
    raise RuntimeError('Local frontend fixture did not start: ' + server.stderr.read())
DAY, OLD = '2026-10-24', '2026-10-23'
expect.set_options(timeout=10000)

def mark(name):
    report['checks'].append(name)
    print('Passed: ' + name, flush=True)

def note(day, text='', version=0, deleted=False, owner=False):
    return {'date': day, 'text': text, 'version': version, 'updated_at': None,
            'deleted': deleted, 'can_edit': owner}

try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        report['browser'] = browser.version

        def setup(width, owner):
            context = browser.new_context(viewport={'width': width, 'height': 900},
                                          is_mobile=width == 375, has_touch=width == 375,
                                          locale='zh-CN', timezone_id='Asia/Shanghai')
            context.add_init_script("Date=class extends Date{constructor(...a){super(...(a.length?a:['2026-10-24T08:00:00Z']))}static now(){return 1792828800000}}")
            fixture = {'data': {DAY: note(DAY, '今天的一点想法。\n\n文字会慢慢积累。', 1, owner=owner)},
                       'writes': [], 'reads': [], 'mode': '', 'dates_calls': 0}
            def route(request_route):
                request = request_route.request
                if not request.url.startswith(origin + '/'):
                    report['blocked_external'].append(request.url); request_route.abort(); return
                parts = urlsplit(request.url)
                if not parts.path.startswith('/api/v1/'):
                    request_route.continue_(); return
                path = parts.path.removeprefix('/api/v1')
                query = parse_qs(parts.query)
                def respond(data, status=200):
                    request_route.fulfill(status=status, content_type='application/json',
                                          body=json.dumps({'data': data}, ensure_ascii=False))
                if path == '/auth/me':
                    respond({'id': 'synthetic-notes-owner', 'username': 'Synthetic owner', 'csrfToken': 'synthetic-csrf'} if owner
                            else {'id': 'public-business', 'username': '公开编辑', 'publicBusiness': True})
                elif path == '/accounts':
                    respond([])
                elif path == '/daily-notes/dates':
                    fixture['dates_calls'] += 1
                    if query.get('before'):
                        respond({'dates': ['2026-09-01'], 'has_more': False, 'next_before': None})
                    else:
                        respond({'dates': [DAY, OLD], 'has_more': True, 'next_before': OLD})
                elif path == '/daily-notes' and request.method == 'GET':
                    day = query['date'][0]; fixture['reads'].append(day)
                    value = fixture['data'].get(day, note(day, owner=owner)).copy()
                    if value['deleted'] and not owner: value = note(day, owner=False)
                    respond(value)
                elif path.startswith('/daily-notes/') and request.method in ['PUT', 'DELETE']:
                    assert owner
                    assert request.headers.get('x-csrf-token') == 'synthetic-csrf'
                    assert request.headers.get('origin') == origin
                    day = path.rsplit('/', 1)[1]; body = request.post_data_json
                    fixture['writes'].append({'day': day, 'method': request.method, 'body': body})
                    if fixture['mode'] == 'unknown_before':
                        fixture['mode'] = ''; request_route.abort('failed'); return
                    current = fixture['data'].get(day, note(day, owner=True))
                    if fixture['mode'] == 'conflict':
                        fixture['mode'] = ''
                        fixture['data'][day] = note(day, '来自另一处的新版文字', current['version'] + 1, owner=True)
                        request_route.fulfill(status=409, content_type='application/json',
                                              body=json.dumps({'error': {'code': 'VERSION_CONFLICT', 'message': '合成版本冲突'}}))
                        return
                    assert body['version'] == current['version']
                    value = note(day, body.get('text', ''), body['version'] + 1,
                                 request.method == 'DELETE', owner=True)
                    fixture['data'][day] = value
                    if fixture['mode'] == 'unknown':
                        fixture['mode'] = ''; request_route.abort('failed'); return
                    respond(value)
                else:
                    raise AssertionError('Unexpected synthetic API path: ' + path)
            context.route('**/*', route)
            page = context.new_page()
            page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
            page.goto(origin + '/?page=notes&date=' + DAY)
            expect(page.locator('#daily-notes')).to_have_attribute('data-date', DAY)
            expect(page.locator('#page-content')).to_have_attribute('aria-busy', 'false')
            return context, page, fixture

        for width in [375, 1440]:
            context, page, fixture = setup(width, False)
            expect(page.locator('h1')).to_have_text('碎碎念')
            expect(page.locator('#notes-reader')).to_contain_text('今天的一点想法')
            expect(page.locator('#notes-editor')).to_be_hidden()
            expect(page.locator('#notes-write-actions')).to_be_hidden()
            expect(page.locator('#notes-status')).to_have_text('公开只读')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('[data-notes-action=more]').click()
            expect(page.locator('[data-notes-date="2026-09-01"]')).to_be_visible()
            assert fixture['dates_calls'] == 2
            page.locator('#notes-date').fill('2025-01-02')
            page.locator('#notes-date').dispatch_event('change')
            expect(page.locator('#daily-notes')).to_have_attribute('data-date', '2025-01-02')
            expect(page.locator('#notes-empty')).to_be_visible()
            assert not fixture['writes']
            page.locator('[data-notes-action=today]').click()
            expect(page.locator('#notes-reader')).to_be_visible()
            path = OUT / ('readonly-' + str(width) + '.png')
            page.screenshot(path=str(path), full_page=True); report['screenshots'].append(str(path))
            page.locator('[data-notes-action=login]').click()
            expect(page.locator('#login-form')).to_be_visible()
            assert 'page=notes' in page.url and 'date=' + DAY in page.url
            mark('readonly, paginated dates, arbitrary past date, owner login returns through existing URL, no overflow ' + str(width))
            context.close()

        for width in [375, 1440]:
            context, page, fixture = setup(width, True)
            editor = page.locator('#notes-editor')
            expect(editor).to_be_visible()
            editor.fill('第一段\n\n<img src=x onerror=alert(1)> 只会作为文字保存。')
            expect(page.locator('#notes-status')).to_have_text('已保存')
            assert fixture['writes'][-1]['body']['text'].startswith('第一段')
            assert page.locator('#daily-notes img').count() == 0
            if width == 375:
                fixture['mode'] = 'conflict'
                editor.fill('需要保留的草稿')
                expect(page.locator('#notes-status')).to_have_text('草稿有冲突')
                expect(editor).to_have_value('需要保留的草稿')
                expect(page.locator('#notes-remote')).to_have_text('来自另一处的新版文字')
                count = len(fixture['writes'])
                page.locator('#notes-date').fill(OLD); page.locator('#notes-date').dispatch_event('change')
                expect(page.locator('#daily-notes')).to_have_attribute('data-date', OLD)
                expect(page.locator('#notes-drafts')).to_contain_text(DAY)
                page.locator('#notes-drafts [data-notes-date="' + DAY + '"]').click()
                expect(editor).to_have_value('需要保留的草稿')
                assert len(fixture['writes']) == count
                page.locator('[data-notes-action=use-draft]').click()
                expect(page.locator('#notes-status')).to_have_text('已保存')
                fixture['mode'] = 'unknown'; count = len(fixture['writes'])
                editor.fill('响应丢失后先回读确认')
                expect(page.locator('#notes-status')).to_have_text('已保存')
                assert len(fixture['writes']) == count + 1
                assert len(fixture['reads']) >= 4
                fixture['mode'] = 'unknown_before'; count = len(fixture['writes'])
                editor.fill('需要重试的原保存')
                expect(page.locator('[data-notes-action=retry]')).to_be_visible()
                editor.fill('核对以后又写下的草稿')
                page.locator('[data-notes-action=retry]').click()
                expect(page.locator('#notes-status')).to_have_text('已保存')
                assert len(fixture['writes']) == count + 3
                assert fixture['writes'][count]['body'] == fixture['writes'][count + 1]['body']
                assert fixture['writes'][count + 2]['body']['text'] == '核对以后又写下的草稿'
                mark('409 retains drafts; unknown commit readback; manual original save_id retry then queued new draft')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            path = OUT / ('owner-' + str(width) + '.png')
            page.screenshot(path=str(path), full_page=True); report['screenshots'].append(str(path))
            page.locator('[data-notes-action=delete]').click()
            expect(page.locator('#notes-delete-confirm')).to_be_visible()
            page.locator('[data-notes-action=confirm-delete]').click()
            expect(editor).to_have_value('')
            expect(page.locator('#notes-status')).to_have_text('已保存')
            mark('owner autosave, plaintext XSS safety, no overflow and explicit soft delete ' + str(width))
            context.close()
        assert not report['pageerrors'], report['pageerrors']
        assert not report['blocked_external'], report['blocked_external']
        report['completed'] = True
        browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=5)
    except subprocess.TimeoutExpired: server.kill(); server.wait(timeout=5)
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
