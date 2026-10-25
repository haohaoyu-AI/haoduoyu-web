"""One mobile integration: real Worker, temporary synthetic Miniflare D1 and login."""
import json
import os
from pathlib import Path
import re
import subprocess
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/daily-notes-ui'
OUT.mkdir(parents=True, exist_ok=True)
harness = (ROOT / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert username.startswith('synthetic-')
report = {'synthetic': True, 'real_backend': True, 'checks': [], 'pageerrors': [], 'blocked_external': []}
server = subprocess.Popen(['node', 'tests/daily-notes-ui-browser-server.mjs'], cwd=ROOT,
                          env={**os.environ, 'DAILY_NOTES_REAL_BACKEND': '1'},
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
origin = server.stdout.readline().strip()
if not origin.startswith('http://127.0.0.1:'):
    raise RuntimeError('Synthetic Worker fixture failed to start')
DAY = '2026-10-24'
expect.set_options(timeout=15000)
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        def context():
            value = browser.new_context(viewport={'width': 375, 'height': 900}, is_mobile=True,
                                        has_touch=True, locale='zh-CN', timezone_id='Asia/Shanghai')
            def local_only(route):
                if route.request.url.startswith(origin + '/'): route.continue_()
                else: report['blocked_external'].append(route.request.url); route.abort()
            value.route('**/*', local_only)
            page = value.new_page()
            page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
            return value, page
        owner_context, owner = context()
        owner.goto(origin + '/?page=notes&date=' + DAY)
        expect(owner.locator('[data-notes-action=login]')).to_be_visible()
        owner.locator('[data-notes-action=login]').click()
        owner.locator('#username').fill(username)
        owner.locator('#password').fill(password)
        owner.locator('#login-form button[type=submit]').click()
        expect(owner.locator('#notes-editor')).to_be_visible()
        assert 'page=notes' in owner.url and 'date=' + DAY in owner.url
        text = '真实 Worker 合成联测\n只保存在隔离的临时 D1。'
        owner.locator('#notes-editor').fill(text)
        expect(owner.locator('#notes-status')).to_have_text('已保存')
        saved = owner.request.get(origin + '/api/v1/daily-notes?date=' + DAY).json()['data']
        assert saved['text'] == text and saved['version'] == 1 and saved['can_edit'] is True
        report['checks'].append('existing real login -> owner capability -> autosave version 1')
        public_context, public = context()
        public.goto(origin + '/?page=notes&date=' + DAY)
        expect(public.locator('#notes-reader')).to_have_text(text)
        expect(public.locator('#notes-editor')).to_be_hidden()
        anonymous = public.request.get(origin + '/api/v1/daily-notes?date=' + DAY).json()['data']
        assert anonymous['can_edit'] is False and anonymous['text'] == text
        assert public.evaluate('document.documentElement.scrollWidth <= innerWidth')
        public.screenshot(path=str(OUT / 'real-worker-readonly-375.png'), full_page=True)
        report['checks'].append('independent anonymous browser reads owner text and cannot edit')
        owner.locator('[data-notes-action=delete]').click()
        owner.locator('[data-notes-action=confirm-delete]').click()
        expect(owner.locator('#notes-editor')).to_have_value('')
        expect(owner.locator('#notes-status')).to_have_text('已保存')
        tombstone = owner.request.get(origin + '/api/v1/daily-notes?date=' + DAY).json()['data']
        assert tombstone['deleted'] is True and tombstone['version'] == 2 and tombstone['text'] == ''
        public.reload()
        expect(public.locator('#notes-empty')).to_be_visible()
        anonymous = public.request.get(origin + '/api/v1/daily-notes?date=' + DAY).json()['data']
        assert anonymous == {'date': DAY, 'text': '', 'version': 0, 'updated_at': None, 'deleted': False, 'can_edit': False}
        report['checks'].append('explicit owner delete -> real soft tombstone v2 -> public empty projection')
        assert not report['pageerrors'] and not report['blocked_external']
        report['completed'] = True
        owner_context.close(); public_context.close(); browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=5)
    except subprocess.TimeoutExpired: server.kill(); server.wait(timeout=5)
    (OUT / 'real-worker-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
