"""C4 real synthetic sessions: requests/bytes/D1 receipts and unchanged four-width UI."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
focused = '--focused' in sys.argv
out = root / ('artifacts/browser-reviews-light-final' if focused else 'artifacts/browser-reviews-light')
out.mkdir(parents=True, exist_ok=True)
harness = (root / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert username.startswith('synthetic-')
report = {'synthetic': True, 'focused_data_and_review_modal': focused, 'baseline_commit': '937503d3e8e1b5ba2aeaf154714900b62e46152e',
          'source_commit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
          'candidate_app_sha256': hashlib.sha256((root/'public/app.js').read_bytes()).hexdigest(),
          'candidate_worker_sha256': hashlib.sha256((root/'dist/server/index.js').read_bytes()).hexdigest(), 'widths': [375, 390, 768, 1440], 'captures': [],
          'pageerrors': [], 'console_errors': [], 'mismatches': [], 'network': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    for variant, port in [('baseline', 8793), ('candidate', 8794)]:
        origin = f'http://127.0.0.1:{port}'
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, timezone_id='Asia/Shanghai')
        context.add_init_script("""const NativeDate = Date;globalThis.Date = class extends NativeDate {
          constructor(...args){super(...(args.length?args:[1792656000000]));}static now(){return 1792656000000;}};""")
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
        page.on('console', lambda message: report['console_errors'].append(message.text)
                if message.type == 'error' else None)

        def ready():
            page.locator('#page-content[aria-busy=false]').wait_for()
            expect(page.locator('.error-panel')).to_have_count(0)

        def capture(name, width):
            assert page.locator('input[type=password]').count() == 0
            assert page.locator('#created-token').count() == 0
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            path = out / f'{variant}-{name}-{width}.png'
            page.screenshot(path=str(path), animations='disabled', full_page=True)
            report['captures'].append({'variant': variant, 'view': name, 'width': width,
                                       'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})

        def receipts():
            return page.request.get(origin + '/__synthetic-metrics').json()

        def checkpoint(name, before):
            rows = [row for row in receipts()[before:] if row['method'] == 'GET' and
                    row['path'].split('?')[0] in ['/api/v1/articles', '/api/v1/overview',
                    '/api/v1/due-reviews', '/api/v1/observations', '/api/v1/daily-metrics']]
            assert all(row['status'] == 200 for row in rows)
            report['network'].append({'variant': variant, 'phase': name, 'requests': rows,
                                      'count': len(rows), 'bytes': sum(row['bytes'] for row in rows),
                                      'sql': sum(row['d1']['sql'] for row in rows),
                                      'write_statements': sum(row['d1']['write_statements'] for row in rows)})

        page.goto(origin + '/?page=reviews&tab=observations', wait_until='networkidle')
        before = len(receipts())
        page.locator('#username').fill(username)
        page.locator('#password').fill(password)
        page.locator('#login-form button[type=submit]').click()
        ready()
        checkpoint('data-first', before)
        for name in ['modal-first', 'modal-repeat']:
            before = len(receipts())
            page.locator('[data-action=new-review]').first.click()
            page.locator('#overlay [role=dialog]').wait_for()
            checkpoint(name, before)
            page.keyboard.press('Escape')
            expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
        for name, tab in [('tab-daily', 'daily'), ('tab-observations', 'observations')]:
            before = len(receipts())
            page.locator('[data-action=review-tab][data-tab=' + tab + ']').click()
            ready()
            checkpoint(name, before)
        for name, account in [('account-first', 'zhihu-haoduoyu'), ('account-return', '')]:
            before = len(receipts())
            page.locator('#global-account').select_option(account)
            ready()
            checkpoint(name, before)
        for width in report['widths']:
            page.set_viewport_size({'width': width, 'height': 900})
            views = [('data', 'page=reviews&tab=observations')] if focused else [('dashboard', 'page=dashboard'), ('articles', 'page=articles'), ('data', 'page=reviews&tab=observations')]
            for view, query in views:
                page.goto(origin + '/?' + query)
                ready()
                capture(view, width)
            page.locator('[data-action=new-review]').first.click()
            page.locator('#overlay [role=dialog]').wait_for()
            capture('review-modal', width)
            page.keyboard.press('Escape')
            if not focused:
                page.goto(origin + '/?page=articles')
                ready()
                page.locator('[data-action=article-detail]:visible').first.click()
                page.locator('#overlay [role=dialog]').wait_for()
                capture('detail', width)
                page.keyboard.press('Escape')
                expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
        context.close()
    browser.close()
for width in report['widths']:
    for view in (['data', 'review-modal'] if focused else ['dashboard', 'articles', 'data', 'review-modal', 'detail']):
        hashes = [x['sha256'] for x in report['captures'] if x['width'] == width and x['view'] == view]
        if len(hashes) != 2 or hashes[0] != hashes[1]:
            report['mismatches'].append({'width': width, 'view': view})
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
assert not report['pageerrors']
assert not report['mismatches'], report['mismatches']
for phase in ['data-first', 'modal-first', 'modal-repeat', 'tab-daily', 'tab-observations', 'account-first', 'account-return']:
    old = next(row for row in report['network'] if row['variant'] == 'baseline' and row['phase'] == phase)
    new = next(row for row in report['network'] if row['variant'] == 'candidate' and row['phase'] == phase)
    assert not any('/overview' in row['path'] for row in new['requests'])
    assert all('fields=index' in row['path'] for row in new['requests'] if row['path'].startswith('/api/v1/articles'))
    assert new['bytes'] < old['bytes'], phase
print(str(len(report['captures']))+' screenshots match; real authenticated request/byte/D1 comparison complete.')
